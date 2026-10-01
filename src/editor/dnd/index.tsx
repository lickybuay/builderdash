/**
 * Builder drag & drop — ISOLATED MODULE.
 *
 * Nothing outside `dnd/` touches the drag mechanism. The surface the rest of
 * the editor consumes:
 *
 *   - `<DragProvider>`       holds the drag state. Mounted BOTH outside the
 *     canvas (for the palette) and inside the canvas shadow root, sharing one
 *     store.
 *   - `useDragSource()`      makes an element draggable.
 *   - `<ContainerDropZone>`  a container that accepts drops and resolves the
 *     insertion slot from the pointer position.
 *   - `<DropIndicator>`      the insertion line at the resolved slot.
 *
 * ## Why the state lives outside React context
 *
 * React delegates events to the container it mounted on. The admin mounts once,
 * outside the canvas; the canvas renders in a Shadow DOM. An event bubbling out
 * of a shadow root is **retargeted**, so listeners above the boundary only ever
 * see the host element, never the inner node that was actually hit. A canvas
 * rendered through a portal keeps React's delegation outside the boundary and
 * its handlers never fire.
 *
 * The canvas therefore runs its own `createRoot` inside the shadow root. That
 * splits the React tree in two: the palette lives in the outer tree, the canvas
 * in the inner one, and React context cannot span them.
 *
 * The drag state is consequently held in a plain external store (a tiny
 * subscribe/notify pair) that both trees read through `useSyncExternalStore`.
 * Context was the obvious choice and it simply does not work here.
 *
 * ## One zone per container
 *
 * There is exactly one drop zone per container, never one per insertion slot.
 * Per-slot zones nest inside each other, which makes `dragover` fire on several
 * zones at once and leaves the highlighted target dependent on DOM order.
 *
 * The Structure panel is the one exception: its rows form a flat list, so each
 * row is its own target and resolves a zone (before / inside / after) from the
 * pointer position inside it. See `useTreeDrop` and `tree-drop.ts`.
 *
 * ## Two traps worth remembering
 *
 * 1. `:scope >` does NOT work inside a ShadowRoot. It returns nothing, silently.
 *    This module walks `container.children` instead, which always works.
 * 2. A container is only as good as its measurable children. Every direct child
 *    of a zone must carry `data-bd-child` on the element the resolver measures,
 *    with no extra wrapper in between.
 *
 * ## Library choice
 *
 * Native HTML5 drag & drop, not `@dnd-kit`. `@dnd-kit` is already in the admin
 * bundle, but its sensors would have to cross the shadow boundary, where the
 * same retargeting problem applies and pointer coordinates cross realms.
 */

import * as React from "react";

import type { NodeType } from "../../schema/types";
import type { BuilderTree } from "../store/tree";
import { resolveTreeDrop, zoneFromPointer, type TreeDropZone } from "./tree-drop";

/** What is being dragged. */
export type DragPayload =
	| { kind: "new"; nodeType: NodeType }
	| { kind: "existing"; nodeKey: string };

/** Resolved insertion target: a container and a slot inside it. */
export interface DropTarget {
	parentKey: string | null;
	index: number;
}

/** The observable drag state. */
interface DragState {
	payload: DragPayload | null;
	activeContainer: string | null;
	activeIndex: number;
	/** Hovered row in the Structure panel, while the pointer is over it. */
	navKey: string | null;
	navZone: TreeDropZone | null;
}

const EMPTY: DragState = {
	payload: null,
	activeContainer: null,
	activeIndex: 0,
	navKey: null,
	navZone: null,
};

/**
 * Minimal external store.
 *
 * Shared by the outer React tree (palette) and the inner one (canvas), which is
 * why it is a module singleton rather than a context value.
 */
class DragStore {
	private state: DragState = EMPTY;
	private listeners = new Set<() => void>();

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getSnapshot = (): DragState => this.state;

	private set(next: Partial<DragState>): void {
		const merged = { ...this.state, ...next };
		if (
			merged.payload === this.state.payload &&
			merged.activeContainer === this.state.activeContainer &&
			merged.activeIndex === this.state.activeIndex &&
			merged.navKey === this.state.navKey &&
			merged.navZone === this.state.navZone
		) {
			// `dragover` fires continuously; an unconditional notify would
			// re-render both React trees on every pointer move.
			return;
		}
		this.state = merged;
		for (const listener of this.listeners) listener();
	}

	begin = (payload: DragPayload): void => this.set({ payload });
	end = (): void => this.set(EMPTY);
	/**
	 * Canvas target and navigator target are mutually exclusive: setting one
	 * clears the other, so crossing between the two surfaces never leaves two
	 * indicators on screen.
	 */
	setActive = (activeContainer: string | null, activeIndex: number): void =>
		this.set({ activeContainer, activeIndex, navKey: null, navZone: null });
	setNav = (navKey: string | null, navZone: TreeDropZone | null): void =>
		this.set({ navKey, navZone, activeContainer: null, activeIndex: 0 });
}

const store = new DragStore();

/** Test seam: resets the singleton between cases. */
export function resetDragStore(): void {
	store.end();
}

/** The drag state for the calling component. */
export function useDragState(): DragState {
	return React.useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
}

/**
 * Makes the returned element draggable. Props are spread rather than attaching
 * a ref, so it works the same on a `<button>` or a `<div>`.
 *
 * Usable from either React tree: it talks to the shared store, not to context.
 */
export function useDragSource(payload: DragPayload): {
	draggable: true;
	onDragStart: (event: React.DragEvent) => void;
	onDragEnd: () => void;
} {
	return {
		draggable: true,
		onDragStart: (event) => {
			store.begin(payload);
			event.dataTransfer.effectAllowed = payload.kind === "new" ? "copy" : "move";
			// Some browsers refuse to start a drag without data on the
			// dataTransfer. The real payload travels in the store, so a marker is
			// enough here.
			event.dataTransfer.setData("application/x-builderdash-node", JSON.stringify(payload));
			event.dataTransfer.setData(
				"text/plain",
				payload.kind === "new" ? payload.nodeType : payload.nodeKey,
			);
		},
		onDragEnd: () => store.end(),
	};
}

/** Kept for symmetry with `useDragSource`; the store is module-scoped. */
export function DragProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
	return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Slot resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the insertion slot for a pointer position inside a container.
 *
 * Walks the container's direct children that carry `data-bd-child`, in document
 * order, and returns the first slot whose midpoint sits past the pointer. Past
 * every child it returns `children.length`, which is the "append" slot.
 *
 * Iteration uses `children` rather than a `:scope >` selector on purpose.
 * `:scope` is unreliable inside a ShadowRoot (jsdom returns nothing, and some
 * engines are inconsistent), and the canvas renders inside one.
 */
export function resolveSlot(container: HTMLElement, clientY: number): number {
	let index = 0;

	for (const child of Array.from(container.children)) {
		if (!child.hasAttribute("data-bd-child")) continue;

		const rect = child.getBoundingClientRect();
		// A child with no measurable height contributes no boundary of its own.
		if (!Number.isFinite(rect.height) || rect.height <= 0) {
			index += 1;
			continue;
		}
		if (!Number.isFinite(rect.top)) {
			index += 1;
			continue;
		}
		if (clientY < rect.top + rect.height / 2) return index;
		index += 1;
	}

	return index;
}

/** `true` when the pointer is inside the container's box, with a small slack. */
function pointerInside(rect: DOMRect, clientX: number, clientY: number): boolean {
	return (
		clientX >= rect.left - 4 &&
		clientX <= rect.right + 4 &&
		clientY >= rect.top - 4 &&
		clientY <= rect.bottom + 4
	);
}

// ---------------------------------------------------------------------------
// Container drop zone
// ---------------------------------------------------------------------------

export interface ContainerDropZoneProps {
	/** Container identity: a node key, or `"root"` for the canvas root. */
	containerKey: string;
	/** Parent key passed to `onDrop`. `null` at the canvas root. */
	parentKey: string | null;
	/** Child types this container accepts. */
	accepts: readonly NodeType[];
	/** Existing children count, used to clamp the resolved slot. */
	childCount: number;
	/** Whether the container currently renders an empty placeholder. */
	isEmpty?: boolean;
	/** Extra data attribute placed on the zone element (e.g. the gap). */
	"data-gap"?: string;
	onDrop: (payload: DragPayload, target: DropTarget) => void;
	children?: React.ReactNode;
	className?: string;
}

/**
 * A container that accepts drops.
 *
 * Exactly one per container in the tree. It resolves the slot on every
 * `dragover` and publishes it, which is what the `<DropIndicator>` reads.
 */
export function ContainerDropZone({
	containerKey,
	parentKey,
	accepts,
	childCount,
	isEmpty = false,
	onDrop,
	children,
	className,
	"data-gap": dataGap,
}: ContainerDropZoneProps): React.JSX.Element {
	const state = useDragState();
	const zoneRef = React.useRef<HTMLDivElement | null>(null);

	const acceptsPayload =
		state.payload !== null &&
		(state.payload.kind === "new" ? accepts.includes(state.payload.nodeType) : true);

	/** A dragged node must not target its own container. */
	const isSelf = state.payload?.kind === "existing" && state.payload.nodeKey === containerKey;

	const isActive = state.activeContainer === containerKey;

	const resolve = React.useCallback(
		(event: React.DragEvent): number => {
			const zone = zoneRef.current;
			if (!zone) return childCount;
			return Math.max(0, Math.min(resolveSlot(zone, event.clientY), childCount));
		},
		[childCount],
	);

	const handleDragOver = (event: React.DragEvent) => {
		if (!acceptsPayload || isSelf) return;
		event.preventDefault();
		// Stop here so the innermost container wins: a nested zone must not be
		// overridden by its own ancestors.
		event.stopPropagation();
		event.dataTransfer.dropEffect = state.payload?.kind === "new" ? "copy" : "move";

		const zone = zoneRef.current;
		if (!zone) return;
		const rect = zone.getBoundingClientRect();
		if (!pointerInside(rect, event.clientX, event.clientY)) return;

		store.setActive(containerKey, resolve(event));
	};

	const handleDrop = (event: React.DragEvent) => {
		if (!acceptsPayload || isSelf || !state.payload) return;
		event.preventDefault();
		event.stopPropagation();

		onDrop(state.payload, { parentKey, index: resolve(event) });
		store.end();
	};

	const handleDragLeave = (event: React.DragEvent) => {
		// A nested container's zone is the one that should stay active, so only
		// clear when the pointer left this zone entirely.
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
		if (isActive) store.setActive(null, 0);
	};

	return (
		<div
			ref={zoneRef}
			data-bd-dropzone={containerKey}
			data-bd-active={isActive ? "true" : undefined}
			data-bd-empty={isEmpty ? "true" : undefined}
			data-gap={dataGap}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
			onDragLeave={handleDragLeave}
			className={className}
		>
			{children}
		</div>
	);
}

/**
 * Marks an element as a direct child of a drop zone so `resolveSlot` can see it.
 * Spread onto the element that wraps each child in the container.
 */
export function useDropChild(): { "data-bd-child": true } {
	return { "data-bd-child": true };
}

// ---------------------------------------------------------------------------
// Insertion indicator
// ---------------------------------------------------------------------------

/**
 * The insertion line for one slot.
 *
 * Renders nothing unless the store says this exact slot is the active one,
 * which keeps the canvas free of stray markers during a drag.
 */
export function DropIndicator({
	containerKey,
	index,
}: {
	containerKey: string;
	index: number;
}): React.JSX.Element | null {
	const state = useDragState();
	if (
		!state.payload ||
		state.activeContainer !== containerKey ||
		state.activeIndex !== index
	) {
		return null;
	}

	return <div className="bd-drop-line" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Structure panel (tree navigator)
// ---------------------------------------------------------------------------

export interface TreeDrop {
	/** Spread on the element that wraps every row (the `role="tree"` list). */
	listProps: { onDragLeave: (event: React.DragEvent) => void };
	/** Spread on each row. */
	rowProps: (
		nodeKey: string,
		expanded: boolean,
	) => {
		onDragOver: (event: React.DragEvent) => void;
		onDrop: (event: React.DragEvent) => void;
	};
	/** The zone to draw on `nodeKey`, or `null`. */
	zoneFor: (nodeKey: string) => TreeDropZone | null;
}

/**
 * Drop handling for the Structure panel.
 *
 * One target per row, which is fine here: rows are siblings in a flat list, so
 * they never nest and `dragover` only ever fires on one of them.
 */
export function useTreeDrop(
	tree: BuilderTree,
	onDrop: (payload: DragPayload, target: DropTarget) => void,
): TreeDrop {
	const state = useDragState();

	const resolveAt = (event: React.DragEvent, nodeKey: string, expanded: boolean) => {
		const payload = store.getSnapshot().payload;
		if (!payload) return null;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const canNest = resolveTreeDrop(tree, payload, nodeKey, "inside", expanded) !== null;
		const zone = zoneFromPointer(event.clientY - rect.top, rect.height, canNest);
		const target = resolveTreeDrop(tree, payload, nodeKey, zone, expanded);
		return target ? { payload, zone, target } : null;
	};

	return {
		listProps: {
			onDragLeave: (event) => {
				if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
				if (store.getSnapshot().navKey !== null) store.setNav(null, null);
			},
		},
		rowProps: (nodeKey, expanded) => ({
			onDragOver: (event) => {
				const resolved = resolveAt(event, nodeKey, expanded);
				if (!resolved) {
					// Not a valid drop here: no indicator, and no preventDefault so
					// the browser shows the "not allowed" cursor.
					if (store.getSnapshot().navKey !== null) store.setNav(null, null);
					return;
				}
				event.preventDefault();
				event.dataTransfer.dropEffect = resolved.payload.kind === "new" ? "copy" : "move";
				store.setNav(nodeKey, resolved.zone);
			},
			onDrop: (event) => {
				const resolved = resolveAt(event, nodeKey, expanded);
				if (!resolved) return;
				event.preventDefault();
				onDrop(resolved.payload, resolved.target);
				store.end();
			},
		}),
		zoneFor: (nodeKey) => (state.payload && state.navKey === nodeKey ? state.navZone : null),
	};
}
