/**
 * Drop handling inside the live preview iframe.
 *
 * The iframe document is the real page. Drop targets are the page body
 * (`main[data-bd-main]`, the layout root) and every builder container
 * (`[data-bd-container]`). Nodes are `display: contents` wrappers carrying
 * `data-bd-key`, so slots are resolved from the boxes of their children.
 *
 * The drag itself can start in the parent document (the palette) or inside
 * the iframe (a node's handle). For same-origin drags, the payload is read
 * from `dataTransfer` because the iframe's DragStore singleton is a separate
 * instance from the parent's. For drags that start inside the iframe
 * (node handles), the store is current.
 *
 * Native listeners, not React: the iframe document has no React root.
 */

import { canContain } from "../../schema/registry";
import type { NodeType } from "../../schema/types";
import { findNode, isDescendantOf, type BuilderTree } from "../store/tree";
import { nodeRect } from "../canvas/live-dom";
import { currentDragPayload, endDrag, setFrameTarget, type DragPayload, type DropTarget } from "./index";

/**
 * Cached drag payload from the iframe's dataTransfer.
 *
 * The DragStore singleton lives in each document's JS realm separately.
 * The iframe's store never sees `store.begin()` called from the parent
 * (palette drag). The payload travels in dataTransfer, which IS shared
 * across same-origin documents during a drag operation.
 */
let cachedPayload: DragPayload | null = null;

/** Reads the builder payload from a native dataTransfer object. */
function payloadFromTransfer(dt: DataTransfer): DragPayload | null {
	try {
		const raw = dt.getData("application/x-builderdash-node");
		if (!raw) return null;
		return JSON.parse(raw) as DragPayload;
	} catch {
		return null;
	}
}

/** Where to draw the insertion line, in iframe document coordinates. */
export interface FrameDropLine {
	top: number;
	left: number;
	width: number;
}

interface FrameDropOptions {
	getTree: () => BuilderTree;
	onDrop: (payload: DragPayload, target: DropTarget) => void;
	/** Called with the line to draw, or `null` to hide it. */
	onLine: (line: FrameDropLine | null) => void;
}

interface Resolved {
	target: DropTarget;
	line: FrameDropLine;
}

function draggedType(tree: BuilderTree, payload: DragPayload): NodeType | null {
	if (payload.kind === "new") return payload.nodeType;
	return findNode(tree, payload.nodeKey)?.type ?? null;
}

/** Direct child wrappers of a container element, in order. */
function childWrappers(container: Element): Element[] {
	return Array.from(container.children).filter((child) => child.hasAttribute("data-bd-key"));
}

function resolve(doc: Document, target: Element, clientY: number, tree: BuilderTree): Resolved | null {
	const payload = cachedPayload ?? currentDragPayload();
	if (!payload) return null;
	const type = draggedType(tree, payload);
	if (!type) return null;

	// Innermost container under the pointer that accepts the dragged type,
	// else the page root.
	let container: Element | null = target.closest("[data-bd-container]");
	let parentKey: string | null = null;
	while (container) {
		const key = container.getAttribute("data-bd-container")!;
		const node = findNode(tree, key);
		const self =
			payload.kind === "existing" &&
			(key === payload.nodeKey || isDescendantOf(tree, key, payload.nodeKey));
		if (node && !self && canContain(node.type, type)) {
			parentKey = key;
			break;
		}
		container = container.parentElement?.closest("[data-bd-container]") ?? null;
	}

	if (!container) {
		container = doc.querySelector("main[data-bd-main]");
		if (!container || !target.closest("main[data-bd-main]")) return null;
		// Root accepts any type — auto-wrap is handled in handleDrop (BuilderPage).
	}

	// Slot: the first child whose middle sits below the pointer.
	const children = childWrappers(container);
	let index = children.length;
	for (let i = 0; i < children.length; i++) {
		const rect = nodeRect(children[i]!);
		if (rect && clientY < rect.top + rect.height / 2) {
			index = i;
			break;
		}
	}

	// The line sits between the neighbours, across the container's width.
	const box = container.getBoundingClientRect();
	const prev = index > 0 ? nodeRect(children[index - 1]!) : null;
	const next = index < children.length ? nodeRect(children[index]!) : null;
	const y = next && prev ? (prev.bottom + next.top) / 2 : next ? next.top : prev ? prev.bottom : box.top + 8;
	const scrollX = doc.defaultView?.scrollX ?? 0;
	const scrollY = doc.defaultView?.scrollY ?? 0;

	return {
		target: { parentKey, index },
		line: { top: y + scrollY - 2, left: box.left + scrollX, width: box.width },
	};
}

/** Wires drop handling on the iframe document. Returns a cleanup. */
export function attachFrameDrop(doc: Document, options: FrameDropOptions): () => void {
	let last: Resolved | null = null;

	const clear = () => {
		last = null;
		cachedPayload = null;
		options.onLine(null);
		setFrameTarget(null);
	};

	const onDragOver = (event: DragEvent) => {
		// Parse the payload from dataTransfer — the iframe's DragStore is a
		// separate singleton from the parent's, so currentDragPayload() would
		// return null. dataTransfer IS shared across same-origin documents.
		if (event.dataTransfer) {
			cachedPayload = payloadFromTransfer(event.dataTransfer);
		}
		const target = event.target as Element | null;
		if (!target || typeof target.closest !== "function") return;
		const resolved = resolve(doc, target, event.clientY, options.getTree());
		if (!resolved) {
			if (last) clear();
			return;
		}
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = (cachedPayload ?? currentDragPayload())?.kind === "new" ? "copy" : "move";
		}
		last = resolved;
		options.onLine(resolved.line);
		setFrameTarget(resolved.target);
	};

	const onDrop = (event: DragEvent) => {
		const payload = cachedPayload ?? currentDragPayload();
		if (!payload || !last) return;
		event.preventDefault();
		options.onDrop(payload, last.target);
		clear();
		endDrag();
	};

	const onDragLeave = (event: DragEvent) => {
		// Leaving the document entirely (back to the admin, or outside).
		if (!event.relatedTarget) clear();
	};

	doc.addEventListener("dragover", onDragOver);
	doc.addEventListener("drop", onDrop);
	doc.addEventListener("dragleave", onDragLeave);
	return () => {
		doc.removeEventListener("dragover", onDragOver);
		doc.removeEventListener("drop", onDrop);
		doc.removeEventListener("dragleave", onDragLeave);
	};
}
