/**
 * Drop resolution for the Structure panel (the tree navigator).
 *
 * The canvas resolves a slot from the pointer position among a container's
 * children. The navigator is a flat list of rows, so it resolves differently:
 * the pointer's position INSIDE the hovered row picks a zone, and the zone maps
 * to a slot relative to that row.
 *
 *   top 25%     → before the row (same parent)
 *   middle 50%  → inside the row, when it can hold the dragged node
 *   bottom 25%  → after the row (same parent)
 *
 * Pure: no React, no DOM. The returned target uses the same insertion-slot
 * semantics as the canvas, so it feeds `moveNode` / `insertNode` unchanged.
 */

import { canContain, getWidget } from "../../schema/registry";
import type { NodeType } from "../../schema/types";
import { findNode, indexOf, isDescendantOf, type BuilderTree } from "../store/tree";
import type { DragPayload, DropTarget } from "./index";

/** Where, relative to the hovered row, the drop lands. */
export type TreeDropZone = "before" | "inside" | "after";

/**
 * `true` when a node of this type may live at the page root.
 *
 * Shared with the canvas root zone so both surfaces apply the same rule.
 */
export function acceptsAtRoot(type: NodeType): boolean {
	return getWidget(type)?.topLevel === true;
}

/** Picks the zone from the pointer offset inside a row of `height` pixels. */
export function zoneFromPointer(offsetY: number, height: number, canNest: boolean): TreeDropZone {
	const ratio = height > 0 ? offsetY / height : 0.5;
	if (ratio < 0.25) return "before";
	if (ratio > 0.75) return "after";
	if (canNest) return "inside";
	return ratio < 0.5 ? "before" : "after";
}

/** The type being dragged, or `null` when the dragged node no longer exists. */
function draggedType(tree: BuilderTree, payload: DragPayload): NodeType | null {
	if (payload.kind === "new") return payload.nodeType;
	// A template copies its widgets in, so it fits wherever a container fits.
	if (payload.kind === "template") return "container";
	return findNode(tree, payload.nodeKey)?.type ?? null;
}

/**
 * Resolves a drop on a navigator row into a target, or `null` when the drop is
 * not allowed or would leave the tree unchanged.
 *
 * @param expanded Whether the hovered row currently shows its children. An
 *   "after" drop on an expanded container reads as "first child": the line is
 *   drawn between the row and its first child, so that is where it must land.
 */
export function resolveTreeDrop(
	tree: BuilderTree,
	payload: DragPayload,
	hoveredKey: string,
	zone: TreeDropZone,
	expanded: boolean,
): DropTarget | null {
	const hovered = findNode(tree, hoveredKey);
	if (!hovered) return null;

	const type = draggedType(tree, payload);
	if (!type) return null;

	if (payload.kind === "existing") {
		// A node cannot land on, or inside, itself.
		if (payload.nodeKey === hoveredKey) return null;
		if (isDescendantOf(tree, hoveredKey, payload.nodeKey)) return null;
	}

	let target: DropTarget;
	if (zone === "inside") {
		if (!canContain(hovered.type, type)) return null;
		target = { parentKey: hovered.key, index: hovered.children.length };
	} else if (
		zone === "after" &&
		expanded &&
		hovered.children.length > 0 &&
		canContain(hovered.type, type)
	) {
		target = { parentKey: hovered.key, index: 0 };
	} else {
		const at = indexOf(tree, hoveredKey);
		target = { parentKey: hovered.parent, index: zone === "before" ? at : at + 1 };
	}

	// The destination container must accept the type.
	if (target.parentKey === null) {
		if (!acceptsAtRoot(type)) return null;
	} else {
		const parent = findNode(tree, target.parentKey);
		if (!parent || !canContain(parent.type, type)) return null;
	}

	// Dropping a node into the gap it already occupies is a no-op. Returning
	// `null` keeps it out of the undo history and leaves the entry clean.
	if (payload.kind === "existing") {
		const node = findNode(tree, payload.nodeKey);
		if (node && node.parent === target.parentKey) {
			const current = indexOf(tree, node.key);
			if (target.index === current || target.index === current + 1) return null;
		}
	}

	return target;
}
