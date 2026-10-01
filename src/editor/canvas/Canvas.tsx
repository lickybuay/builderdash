/**
 * Builder canvas: the Shadow DOM root and the recursive tree render.
 *
 * ## Why the canvas owns a separate React root
 *
 * The canvas renders inside a Shadow DOM. React delegates events to the
 * container it was mounted on, and for the admin that container sits outside the
 * shadow root. When an event bubbles out of a shadow root it is **retargeted**:
 * listeners above the boundary see the host element, never the inner node. So
 * React's delegation never reaches a handler attached to a canvas node, and
 * `dragover` / `drop` silently do nothing.
 *
 * `composed: true` makes the event cross the boundary, but retargeting still
 * hides which inner element was hit, which is exactly the information the drop
 * resolver needs.
 *
 * The fix is to mount the canvas subtree on its own `createRoot` **inside** the
 * shadow root. Events then delegate to a container within the same tree, and
 * bubbling works normally.
 *
 * That means the canvas cannot read React context from the shell. State and
 * callbacks are passed down as props instead, which is also what keeps the
 * canvas independent from the shell's internals.
 *
 * ## Drag & drop
 *
 * ONE drop zone per container (see `dnd/index.tsx`). The insertion line is
 * rendered from the slot the container resolves against the pointer, which is
 * what keeps the visible marker and the actual drop target in agreement.
 */

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { getWidget, requireWidget, topLevelWidgets } from "../../schema/registry";
import type { NodeType } from "../../schema/types";
import {
	ContainerDropZone,
	DropIndicator,
	useDragSource,
	useDragState,
	useDropChild,
	type DragPayload,
	type DropTarget,
} from "../dnd/index";
import type { BuilderNode, BuilderTree, Breakpoint, MoveIntent } from "../store/tree";
import { CANVAS_STYLES } from "./styles";

/** Types the page root accepts. Same rule the Structure panel applies. */
const ROOT_ACCEPTS: readonly NodeType[] = topLevelWidgets().map((widget) => widget.type);

// ---------------------------------------------------------------------------
// Shadow DOM root, with its own React tree
// ---------------------------------------------------------------------------

interface ShadowHostProps {
	breakpoint: Breakpoint;
	/** Rendered inside the shadow root's own React root. */
	render: () => React.ReactNode;
	/** Changes whenever the rendered content does; resets a caught error. */
	resetKey: unknown;
}

interface CanvasErrorBoundaryProps {
	resetKey: unknown;
	children: React.ReactNode;
}

/**
 * Error boundary for the canvas' own React root.
 *
 * The admin's error boundaries live in the outer tree and do not cover a root
 * created with `createRoot`. Without this, any render error in a node unmounts
 * the whole canvas and leaves the empty host behind, with no message.
 *
 * The error clears on its own when `resetKey` changes (an undo, for instance),
 * or when the user retries.
 */
class CanvasErrorBoundary extends React.Component<
	CanvasErrorBoundaryProps,
	{ error: Error | null }
> {
	state: { error: Error | null } = { error: null };

	static getDerivedStateFromError(error: Error): { error: Error } {
		return { error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo): void {
		console.error("[builderdash] Canvas render failed", error, info.componentStack);
	}

	componentDidUpdate(prev: CanvasErrorBoundaryProps): void {
		if (this.state.error && prev.resetKey !== this.props.resetKey) {
			this.setState({ error: null });
		}
	}

	render(): React.ReactNode {
		if (!this.state.error) return this.props.children;

		return (
			<div className="bd-canvas-error" role="alert">
				<strong>The canvas could not be rendered.</strong>
				<span>{this.state.error.message}</span>
				<button type="button" onClick={() => this.setState({ error: null })}>
					Retry
				</button>
			</div>
		);
	}
}

function ShadowHost({ breakpoint, render, resetKey }: ShadowHostProps): React.JSX.Element {
	const hostRef = React.useRef<HTMLDivElement | null>(null);
	const rootRef = React.useRef<Root | null>(null);
	const [, forceUpdate] = React.useReducer((n: number) => n + 1, 0);

	React.useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		// `open` so it can be inspected from browser dev tools.
		const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

		if (!shadow.querySelector("style[data-bd]")) {
			const style = document.createElement("style");
			style.setAttribute("data-bd", "");
			style.textContent = CANVAS_STYLES;
			shadow.appendChild(style);
		}

		let mount = shadow.querySelector<HTMLElement>("[data-bd-root]");
		if (!mount) {
			mount = document.createElement("div");
			mount.setAttribute("data-bd-root", "");
			shadow.appendChild(mount);
		}

		const root = createRoot(mount);
		rootRef.current = root;
		forceUpdate();

		return () => {
			// Unmount on teardown so the shadow root does not keep a stale tree.
			const current = rootRef.current;
			rootRef.current = null;
			current?.unmount();
		};
	}, []);

	// Re-render the shadow tree whenever the hosted content changes. This is a
	// manual bridge: the outer shell re-renders, this effect-less updater
	// pushes the new tree into the inner root.
	React.useEffect(() => {
		rootRef.current?.render(
			<div className="bd-canvas">
				<CanvasErrorBoundary resetKey={resetKey}>{render()}</CanvasErrorBoundary>
			</div>,
		);
	});

	return (
		<div
			ref={hostRef}
			data-breakpoint={breakpoint}
			style={{ display: "block", minHeight: "100%", background: "var(--color-kumo-canvas)" }}
		/>
	);
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

interface CanvasProps {
	tree: BuilderTree;
	breakpoint: Breakpoint;
	selectedKey: string | null;
	onSelect: (key: string | null) => void;
	onDropPayload: (payload: DragPayload, target: DropTarget) => void;
onMove: (key: string, intent: MoveIntent) => boolean;
	/** Pre-resolved accessible label, so the canvas needs no i18n provider. */
	ariaLabel: (label: string) => string;
}

export function Canvas({
	tree,
	breakpoint,
	selectedKey,
	onSelect,
	onDropPayload,
	onMove,
	ariaLabel,
}: CanvasProps): React.JSX.Element {
	return (
		<ShadowHost
			breakpoint={breakpoint}
			resetKey={tree}
			render={() => (
				<CanvasBody
					tree={tree}
					breakpoint={breakpoint}
					selectedKey={selectedKey}
					onSelect={onSelect}
					onDropPayload={onDropPayload}
					onMove={onMove}
					ariaLabel={ariaLabel}
				/>
			)}
		/>
	);
}

function CanvasBody({
	tree,
	breakpoint,
	selectedKey,
	onSelect,
	onDropPayload,
	onMove,
	ariaLabel,
}: CanvasProps): React.JSX.Element {
	const isEmpty = tree.length === 0;
	const { payload: activeDrag } = useDragState();
	const childProps = useDropChild();

	return (
		<div className="bd-page" data-breakpoint={breakpoint} onClick={() => onSelect(null)}>
			<ContainerDropZone
				containerKey="root"
				parentKey={null}
				accepts={ROOT_ACCEPTS}
				childCount={tree.length}
				isEmpty={isEmpty}
				onDrop={onDropPayload}
				className="bd-dropzone bd-dropzone--root"
			>
				{isEmpty ? (
					<div className="bd-empty-slot" data-role="container">
						{activeDrag
							? "Drop the container here"
							: "The page is empty. Drag a container from the left panel."}
					</div>
				) : (
					<>
						<DropIndicator containerKey="root" index={0} />
						{tree.map((node, index) => (
							<React.Fragment key={node.key}>
								<div {...childProps} className="bd-child">
									<NodeView
										node={node}
										breakpoint={breakpoint}
										selectedKey={selectedKey}
										onSelect={onSelect}
										onDropPayload={onDropPayload}
										onMove={onMove}
										ariaLabel={ariaLabel}
									/>
								</div>
								<DropIndicator containerKey="root" index={index + 1} />
							</React.Fragment>
						))}
					</>
				)}
			</ContainerDropZone>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Node rendering
// ---------------------------------------------------------------------------

interface NodeViewProps {
	node: BuilderNode;
	breakpoint: Breakpoint;
	selectedKey: string | null;
	onSelect: (key: string) => void;
	onDropPayload: CanvasProps["onDropPayload"];
	/** Keyboard move of the selected node. Returns `true` when it applied. */
	onMove: (key: string, intent: MoveIntent) => boolean;
	/** Pre-resolved accessible label, so the canvas needs no i18n provider. */
	ariaLabel: (label: string) => string;
}

function NodeView({
	node,
	breakpoint,
	selectedKey,
	onSelect,
	onDropPayload,
	onMove,
	ariaLabel,
}: NodeViewProps): React.JSX.Element {
	const widget = requireWidget(node.type);
	const isSelected = selectedKey === node.key;
	const dragProps = useDragSource({ kind: "existing", nodeKey: node.key });
	const childProps = useDropChild();
	const { payload } = useDragState();

	const accepts = (widget.accepts ?? []) as readonly NodeType[];
	const isEmpty = node.children.length === 0;

	const handleClick = (event: React.MouseEvent) => {
		event.stopPropagation();
		onSelect(node.key);
	};

	/**
	 * Keyboard controls.
	 *
	 * Selection first: Enter and Space select (matching a button), and the arrow
	 * keys only move a node that is already selected, so tabbing through does not
	 * rearrange the page by accident.
	 *
	 * The arrows mirror the drag gestures: up/down reorder among siblings, right
	 * nests into the next container, left moves one level out.
	 */
	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (!isSelected && (event.key === "Enter" || event.key === " ")) {
			event.preventDefault();
			event.stopPropagation();
			onSelect(node.key);
			return;
		}

		if (!isSelected) return;

		const intents: Record<string, MoveIntent> = {
			ArrowUp: "up",
			ArrowDown: "down",
			ArrowRight: "in",
			ArrowLeft: "out",
		};
		const intent = intents[event.key];
		if (!intent) return;

		event.preventDefault();
		event.stopPropagation();
		onMove(node.key, intent);
	};

	return (
		<div
			className="bd-node"
			data-selected={isSelected ? "true" : undefined}
			data-node-key={node.key}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			// The node behaves as a button: it is selectable and operable, so it
			// has to be reachable with Tab and announced with a role.
			tabIndex={isSelected ? 0 : -1}
			role="button"
			aria-pressed={isSelected}
			aria-label={ariaLabel(widget.label)}
			{...dragProps}
		>
			{isSelected && <span className="bd-node__label">{widget.label}</span>}

			<ContainerDropZone
				containerKey={node.key}
				parentKey={node.key}
				accepts={accepts}
				childCount={node.children.length}
				isEmpty={isEmpty}
				onDrop={onDropPayload}
				className="bd-dropzone"
				data-gap={String(node.props.gap ?? "md")}
			>
				{isEmpty ? (
					<div className="bd-empty-slot" data-role="container">
						{payload ? "Drop here" : "Empty container"}
					</div>
				) : (
					<>
						<DropIndicator containerKey={node.key} index={0} />
						{node.children.map((child, index) => (
							<React.Fragment key={child.key}>
								<div {...childProps} className="bd-child">
									<NodeView
										node={child}
										breakpoint={breakpoint}
										selectedKey={selectedKey}
										onSelect={onSelect}
										onDropPayload={onDropPayload}
										onMove={onMove}
										ariaLabel={ariaLabel}
									/>
								</div>
								<DropIndicator containerKey={node.key} index={index + 1} />
							</React.Fragment>
						))}
					</>
				)}
			</ContainerDropZone>
		</div>
	);
}

/** Re-exported so `BuilderPage` can read the accepted types off the registry. */
export { getWidget };
