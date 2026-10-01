/**
 * Pure operations on the composition tree.
 *
 * No React, no I/O. Every function returns a new (immutable) tree so the store
 * can compare by identity and undo/redo stays trivial.
 *
 * See `.agents/docs/builderdash/02-contrato-datos.md`.
 */

import type { NodeType } from "../../schema/types";
import { canContain, defaultProps, requireWidget } from "../../schema/registry";

/** A composition node. */
export interface BuilderNode {
	/** Stable identity: it is the `_key` of the content layer. */
	key: string;
	type: NodeType;
	/** Content values → layer 1 (`blocks`). */
	props: Record<string, unknown>;
	/** Style values → layer 2 (`json`). */
	style: StyleByBreakpoint;
	children: BuilderNode[];
	/** `key` of the parent, or `null` at the root. */
	parent: string | null;
}

export type Breakpoint = "desktop" | "tablet" | "mobile";

export const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"];

export interface SpacingValue {
	t?: string;
	r?: string;
	b?: string;
	l?: string;
}

export interface StyleValues {
	padding?: SpacingValue;
	margin?: SpacingValue;
	typography?: { size?: string; weight?: string; lineHeight?: string; align?: string };
	color?: string;
	background?: string;
	border?: { width?: string; radius?: string; color?: string };
	size?: { width?: string; maxWidth?: string; height?: string };
	[key: string]: unknown;
}

export interface StyleByBreakpoint {
	desktop?: StyleValues;
	tablet?: StyleValues;
	mobile?: StyleValues;
}

export type BuilderTree = BuilderNode[];

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

const KEY_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Generates a short, stable and sortable key. It avoids `crypto` so it runs the
 * same in the browser and in the Node test runner.
 */
export function newKey(): string {
	const time = Date.now().toString(36);
	let random = "";
	for (let i = 0; i < 6; i++) {
		random += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];
	}
	return `${time}${random}`;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Creates a node with its widget defaults. */
export function createNode(type: NodeType, parent: string | null = null): BuilderNode {
	requireWidget(type);
	return { key: newKey(), type, props: defaultProps(type), style: {}, children: [], parent };
}

/** Creates a container, optionally with `count` nested containers inside. */
export function createContainer(count = 0): BuilderNode {
	const container = createNode("container", null);
	container.children = Array.from({ length: count }, () => createNode("container", container.key));
	return container;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Traverses the tree depth-first (parent before children). */
export function walk(tree: BuilderTree, visit: (node: BuilderNode) => void): void {
	for (const node of tree) {
		visit(node);
		walk(node.children, visit);
	}
}

/** Finds a node by key. */
export function findNode(tree: BuilderTree, key: string): BuilderNode | null {
	let found: BuilderNode | null = null;
	walk(tree, (node) => {
		if (node.key === key) found = node;
	});
	return found;
}

/** Returns the ancestor chain, from the root down to the node's parent. */
export function ancestorsOf(tree: BuilderTree, key: string): BuilderNode[] {
	const chain: BuilderNode[] = [];
	const visit = (nodes: BuilderTree, path: BuilderNode[]): boolean => {
		for (const node of nodes) {
			if (node.key === key) {
				chain.push(...path);
				return true;
			}
			if (visit(node.children, [...path, node])) return true;
		}
		return false;
	};
	visit(tree, []);
	return chain;
}

/** Counts the nodes in the tree. */
export function countNodes(tree: BuilderTree): number {
	let total = 0;
	walk(tree, () => {
		total += 1;
	});
	return total;
}

/**
 * `true` when `candidateKey` is a descendant of `ancestorKey`.
 * Used to block dropping a container inside itself.
 */
export function isDescendantOf(
	tree: BuilderTree,
	candidateKey: string,
	ancestorKey: string,
): boolean {
	const ancestors = ancestorsOf(tree, candidateKey);
	return ancestors.some((node) => node.key === ancestorKey);
}

/** Index of a child inside its parent, or `-1`. */
export function indexOf(tree: BuilderTree, key: string): number {
	let index = -1;
	const visit = (nodes: BuilderTree): boolean => {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i]!;
			if (node.key === key) {
				index = i;
				return true;
			}
			if (visit(node.children)) return true;
		}
		return false;
	};
	visit(tree);
	return index;
}

/** Replaces a node's children, or the whole tree when `key` is `null`. */
function replaceChildren(
	tree: BuilderTree,
	key: string | null,
	update: (children: BuilderNode[]) => BuilderNode[],
): BuilderTree {
	if (key === null) return update(tree);
	return tree.map((node) => {
		if (node.key === key) {
			return { ...node, children: update(node.children) };
		}
		if (node.children.length === 0) return node;
		return { ...node, children: replaceChildren(node.children, key, update) };
	});
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Inserts `node` inside the `parentKey` container (or at the root when `null`).
 * `index` is the insertion slot inside the parent; appended when omitted.
 *
 * Returns the tree unchanged when the child type is not allowed.
 */
export function insertNode(
	tree: BuilderTree,
	node: BuilderNode,
	parentKey: string | null,
	index?: number,
): BuilderTree {
	if (parentKey !== null) {
		const parent = findNode(tree, parentKey);
		if (!parent) return tree;
		if (!canContain(parent.type, node.type)) return tree;
	}

	const placed: BuilderNode = { ...node, parent: parentKey };
	return replaceChildren(tree, parentKey, (children) => {
		const next = [...children];
		const at = index === undefined ? next.length : Math.max(0, Math.min(index, next.length));
		next.splice(at, 0, placed);
		return next;
	});
}

/**
 * Moves a node to another container without losing its styles or descendants.
 *
 * Styles hang off the `key`, so moving never touches layer 2. That property is
 * what makes dragging things around safe for styling work.
 */
export function moveNode(
	tree: BuilderTree,
	nodeKey: string,
	parentKey: string | null,
	index?: number,
): BuilderTree {
	if (nodeKey === parentKey) return tree;
	if (parentKey !== null && isDescendantOf(tree, parentKey, nodeKey)) return tree;

	const node = findNode(tree, nodeKey);
	if (!node) return tree;

	if (parentKey !== null) {
		const parent = findNode(tree, parentKey);
		if (!parent) return tree;
		if (!canContain(parent.type, node.type)) return tree;
	}

	// Source slot. Moving within the same parent must detach the node BEFORE
	// resolving the target, because `index` is a slot in the corrected list.
	const sourceParentKey = node.parent;
	const sourceIndex = sourceParentKey === parentKey ? indexOf(tree, nodeKey) : -1;

	const detached: BuilderNode = { ...node, parent: null };
	const withoutNode = replaceChildren(tree, sourceParentKey, (children) =>
		children.filter((child) => child.key !== nodeKey),
	);

	// `index` is an INSERTION SLOT in the corrected list: the gap between two
	// neighbours where the user drops, from 0 to `children.length`. That is
	// exactly what a drop zone produces and what `insertNode` consumes.
	//
	// Detaching the node removes one element from the target list, so a slot
	// that sat behind the source shifts by one. Without this adjustment,
	// `move(tree, k, parent, 3)` on a 4-item list would land the node on row 2
	// instead of the end.
	let targetIndex = index;
	if (targetIndex !== undefined && sourceIndex !== -1 && sourceIndex < targetIndex) {
		targetIndex -= 1;
	}

	return insertNode(withoutNode, detached, parentKey, targetIndex);
}

/** Removes a node and all its descendants. Returns the tree and the retired keys. */
export function removeNode(
	tree: BuilderTree,
	nodeKey: string,
): { tree: BuilderTree; removedKeys: string[] } {
	const node = findNode(tree, nodeKey);
	if (!node) return { tree, removedKeys: [] };

	const removedKeys: string[] = [];
	walk([node], (descendant) => {
		removedKeys.push(descendant.key);
	});

	const next = replaceChildren(tree, node.parent, (children) =>
		children.filter((child) => child.key !== nodeKey),
	);
	return { tree: next, removedKeys };
}

/** Duplicates a node (with fresh keys) right after the original. */
export function duplicateNode(
	tree: BuilderTree,
	nodeKey: string,
): { tree: BuilderTree; newKey: string | null } {
	const node = findNode(tree, nodeKey);
	if (!node) return { tree, newKey: null };

	const clone = cloneWithNewKeys(node, node.parent);
	const siblings = node.parent === null ? tree : findNode(tree, node.parent)?.children ?? [];
	const at = siblings.findIndex((child) => child.key === nodeKey);
	const next = insertNode(tree, clone, node.parent, at + 1);
	return { tree: next, newKey: clone.key };
}

/** Clones a subtree assigning fresh keys while keeping props and styles. */
export function cloneWithNewKeys(node: BuilderNode, parent: string | null): BuilderNode {
	const key = newKey();
	return {
		...node,
		key,
		parent,
		children: node.children.map((child) => cloneWithNewKeys(child, key)),
	};
}

/** Updates a node's props. */
export function updateNodeProps(
	tree: BuilderTree,
	nodeKey: string,
	patch: Record<string, unknown>,
): BuilderTree {
	return tree.map((node) => {
		if (node.key === nodeKey) return { ...node, props: { ...node.props, ...patch } };
		if (node.children.length === 0) return node;
		return { ...node, children: updateNodeProps(node.children, nodeKey, patch) };
	});
}

/** Replaces a node's styles. */
export function updateNodeStyle(
	tree: BuilderTree,
	nodeKey: string,
	style: StyleByBreakpoint,
): BuilderTree {
	return tree.map((node) => {
		if (node.key === nodeKey) return { ...node, style };
		if (node.children.length === 0) return node;
		return { ...node, children: updateNodeStyle(node.children, nodeKey, style) };
	});
}

// ---------------------------------------------------------------------------
// Keyboard movement
// ---------------------------------------------------------------------------

/** A keyboard movement the editor can perform on the selected node. */
export type MoveIntent = "up" | "down" | "in" | "out";

/**
 * Resolves a keyboard move into a concrete drop target, or `null` when the move
 * is not possible.
 *
 * This is the keyboard counterpart to a drag: it answers "where would this node
 * go" without a pointer. Keeping it here — rather than in the canvas — means the
 * same rules apply to the mouse path, and it can be tested without a DOM.
 *
 * The four intents:
 *
 * - `up` / `down`  reorder among siblings.
 * - `in`           nest inside the following sibling (or the previous one at
 *                  the end of the list), which is how a keyboard user drills
 *                  into a container.
 * - `out`          move to the parent's own position, i.e. one level up.
 */
export function resolveMove(
	tree: BuilderTree,
	nodeKey: string,
	intent: MoveIntent,
): { parentKey: string | null; index: number } | null {
	const node = findNode(tree, nodeKey);
	if (!node) return null;

	const parentKey = node.parent;

	if (intent === "out") {
		// A root node has nowhere to go up to.
		if (parentKey === null) return null;

		const parent = findNode(tree, parentKey);
		if (!parent) return null;

		// Landing after the parent keeps reading order intuitive.
		const grandParentKey = parent.parent;
		const parentIndex = indexOf(tree, parentKey);
		return { parentKey: grandParentKey, index: parentIndex + 1 };
	}

	const siblings =
		parentKey === null ? tree : (findNode(tree, parentKey)?.children ?? []);
	const at = siblings.findIndex((sibling) => sibling.key === nodeKey);
	if (at === -1) return null;

	if (intent === "up") {
		if (at === 0) return null;
		return { parentKey, index: at - 1 };
	}

	if (intent === "down") {
		if (at >= siblings.length - 1) return null;
		return { parentKey, index: at + 2 };
	}

	// `in`: nest inside a sibling that can hold this node.
	const candidates = [siblings[at + 1], siblings[at - 1]].filter(
		(candidate): candidate is BuilderNode => candidate !== undefined,
	);

	for (const candidate of candidates) {
		if (!canContain(candidate.type, node.type)) continue;
		return { parentKey: candidate.key, index: candidate.children.length };
	}

	return null;
}

// ---------------------------------------------------------------------------
// Flattening
// ---------------------------------------------------------------------------

/** A flattened node with its position context. */
export interface FlatNode {
	node: BuilderNode;
	depth: number;
	/** Parent container type, or `null` at the root. */
	parentType: NodeType | null;
	/** Position inside the parent. */
	index: number;
	siblingCount: number;
}

/**
 * Flattens the tree in render order: parent before children, siblings in order.
 * This is the order written into the blocks array.
 */
export function flatten(tree: BuilderTree): FlatNode[] {
	const out: FlatNode[] = [];
	const visit = (nodes: BuilderTree, depth: number, parentType: NodeType | null): void => {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i]!;
			out.push({ node, depth, parentType, index: i, siblingCount: nodes.length });
			visit(node.children, depth + 1, node.type);
		}
	};
	visit(tree, 0, null);
	return out;
}

/** Every key in the tree, in render order. */
export function allKeys(tree: BuilderTree): string[] {
	return flatten(tree).map((entry) => entry.node.key);
}
