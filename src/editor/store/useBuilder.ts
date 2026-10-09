/**
 * Builder store.
 *
 * One reducer holds everything that is part of the composition — the tree, the
 * orphan styles and the pending edits to the entry's content blocks — plus the
 * undo/redo history and the UI state (selection, device) that is not.
 *
 * A reducer, not chained `setState`s: the history push and the state change
 * happen in one pure transition, so StrictMode's double invocation cannot
 * duplicate snapshots and no closure can read a stale field.
 *
 * Undo keeps full snapshots: with ~40 nodes the cost is trivial. Typing is
 * grouped: consecutive edits to the same field within a short burst share one
 * history step, so a headline is one undo, not one per letter.
 */

import * as React from "react";

import type { NodeType } from "../../schema/types";
import {
	cloneSubtreeWithMap,
	countNodes,
	createNode,
	duplicateNode,
	findNode,
	flatten,
	insertNode,
	moveNode,
	removeNode,
	resolveMove,
	updateNodeProps,
	updateNodeStyle,
	type BuilderNode,
	type BuilderTree,
	type Breakpoint,
	type MoveIntent,
	type StyleByBreakpoint,
	walk,
} from "./tree";
import { canContain } from "../../schema/registry";
import { styleWithoutId } from "../clipboard";
import {
	deserializeEntry,
	serializeTree,
	type SerializedEntry,
	type StoredBlock,
	type StoredStyles,
} from "./serialize";

/** A block of the entry's `content` field, as stored. */
export type ContentBlockValue = Record<string, unknown> & { _key: string; _type: string };

/** One entry in the history stack. */
interface Snapshot {
	tree: BuilderTree;
	orphanStyles: StoredStyles;
	/** The entry's content blocks with every pending edit applied. */
	content: ContentBlockValue[];
	/** The page's custom CSS (Details → Custom CSS). */
	pageCss: string;
}

const HISTORY_LIMIT = 50;
/** Edits to the same field closer than this share one undo step. */
const GROUP_WINDOW_MS = 1000;

export interface BuilderState {
	tree: BuilderTree;
	/** Styles whose `_key` no longer has a block. Kept so data is never lost. */
	orphanStyles: StoredStyles;
	content: ContentBlockValue[];
	pageCss: string;
	/** `true` once a content block was edited, added or removed. */
	contentTouched: boolean;
	selectedKey: string | null;
	breakpoint: Breakpoint;
	dirty: boolean;
	canUndo: boolean;
	canRedo: boolean;
}

export interface BuilderActions {
	select: (key: string | null) => void;
	setBreakpoint: (breakpoint: Breakpoint) => void;
	/** Commits an arbitrary tree change (used for compound operations like auto-wrap). */
	commitTree: (nextTree: BuilderTree, select?: string | null, orphanStyles?: StoredStyles) => boolean;
	/** Auto-wrap: creates a container at root, nests the content block inside. Returns ref key or null. */
	autoWrapBlock: (block: ContentBlockValue, index?: number) => string | null;
	/** Auto-wrap: creates a container at root, nests the regular widget inside. Returns node key or null. */
	autoWrapNode: (type: NodeType, index?: number) => string | null;
	addNode: (type: NodeType, parentKey: string | null, index?: number) => string | null;
	moveExisting: (key: string, parentKey: string | null, index?: number) => void;
	/** Keyboard move of the selected node. Returns `true` when it applied. */
	moveByKeyboard: (key: string, intent: MoveIntent) => boolean;
	remove: (key: string) => void;
	duplicate: (key: string) => void;
	/**
	 * Edits a node's styles for one breakpoint, or its non-responsive Extra
	 * settings (`"advanced"`). Patch keys replace; `undefined` or "" clears.
	 */
	updateStyle: (
		key: string,
		target: Breakpoint | "advanced",
		patch: Record<string, unknown>,
	) => void;
	/** Renames a node in the editor (empty restores the default label). */
	renameNode: (key: string, name: string) => void;
	/** Edits a node's own props (a container's gap, direction…). */
	updateProps: (key: string, patch: Record<string, unknown>) => void;
	/** Edits one field of a content block, by the block's `_key`. */
	editContent: (blockKey: string, field: string, value: unknown) => void;
	/** Duplicates the content block a ref points at, placing the copy after it. */
	duplicateContent: (refNodeKey: string) => void;
	/** Removes a content block from the entry, and its ref from the layout. */
	removeContent: (refNodeKey: string) => void;
	/**
	 * Adds a new content block and the ref that places it. Returns the ref's
	 * key, or `null` when the target cannot hold it (nothing is created).
	 */
	addContentBlock: (block: ContentBlockValue, parentKey: string | null, index?: number) => string | null;
	/**
	 * Inserts a template reference into the tree. Returns the ref's key, or
	 * `null` when the target cannot hold it.
	 */
	insertTemplate: (templateId: string, parentKey: string | null, index?: number) => string | null;
	/**
	 * Copies a template's nodes into the tree with fresh keys, styles included
	 * (they live inside each node). Returns the key of the first inserted node,
	 * or `null` when nothing could be inserted.
	 */
	insertSubtree: (
		nodes: readonly BuilderNode[],
		parentKey: string | null,
		index?: number,
	) => string | null;
	/**
	 * Pastes nodes (a copy or a duplicate) with fresh keys. Each content block
	 * in `contentBlocks` is copied under a fresh `_key` and the refs remapped, so
	 * the paste never shares a block with its source; a ref without its block is
	 * dropped. CSS IDs are not carried. With `wrapAtRoot`, a widget pasted at the
	 * root gets its container. One undo step. Returns the first pasted key.
	 */
	pasteSubtree: (
		nodes: readonly BuilderNode[],
		contentBlocks: readonly ContentBlockValue[],
		parentKey: string | null,
		index?: number,
		options?: { wrapAtRoot?: boolean },
	) => string | null;
	/** Removes a node, its subtree and every content block the subtree places. */
	removeSubtree: (key: string) => void;
	/** Replaces a node's whole style (Paste style; `{}` resets it). */
	setStyle: (key: string, style: StyleByBreakpoint) => void;
	/** Replaces the page's custom CSS. */
	setPageCss: (css: string) => void;
	undo: () => void;
	redo: () => void;
	markSaved: () => void;
	toSerializable: () => SerializedEntry;
}

export type BuilderStore = BuilderState & BuilderActions;

/** Initial state from a stored entry. */
export function initialStateFrom(
	blocks: readonly StoredBlock[] | null | undefined,
	styles: StoredStyles | null | undefined,
	content: readonly ContentBlockValue[] | null | undefined = [],
): BuilderState {
	const { tree, orphanStyles, pageCss } = deserializeEntry(blocks, styles);
	return {
		tree,
		orphanStyles,
		pageCss,
		content: Array.isArray(content) ? [...content] : [],
		contentTouched: false,
		selectedKey: null,
		breakpoint: "desktop",
		dirty: false,
		canUndo: false,
		canRedo: false,
	};
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

interface InternalState extends Snapshot {
	contentTouched: boolean;
	selectedKey: string | null;
	breakpoint: Breakpoint;
	dirty: boolean;
	past: Snapshot[];
	future: Snapshot[];
	/** Identity and time of the last grouped edit, for burst grouping. */
	lastGroup: { id: string; at: number } | null;
}

type Action =
	| { type: "select"; key: string | null }
	| { type: "breakpoint"; breakpoint: Breakpoint }
	| {
			type: "commit";
			next: Snapshot;
			select?: string | null;
			group?: string;
			at?: number;
			touchesContent?: boolean;
	  }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "saved" };

const snapshotOf = (state: InternalState): Snapshot => ({
	tree: state.tree,
	orphanStyles: state.orphanStyles,
	content: state.content,
	pageCss: state.pageCss,
});

function reducer(state: InternalState, action: Action): InternalState {
	switch (action.type) {
		case "select":
			return { ...state, selectedKey: action.key };
		case "breakpoint":
			return { ...state, breakpoint: action.breakpoint };
		case "commit": {
			const grouped =
				action.group !== undefined &&
				state.lastGroup?.id === action.group &&
				(action.at ?? 0) - state.lastGroup.at < GROUP_WINDOW_MS;
			const past = grouped
				? state.past
				: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT);
			return {
				...state,
				...action.next,
				past,
				future: [],
				dirty: true,
				contentTouched: state.contentTouched || action.touchesContent === true,
				selectedKey: action.select !== undefined ? action.select : state.selectedKey,
				lastGroup: action.group !== undefined ? { id: action.group, at: action.at ?? 0 } : null,
			};
		}
		case "undo": {
			const previous = state.past[state.past.length - 1];
			if (!previous) return state;
			return {
				...state,
				...previous,
				past: state.past.slice(0, -1),
				future: [...state.future, snapshotOf(state)],
				dirty: true,
				lastGroup: null,
				selectedKey:
					state.selectedKey && findNode(previous.tree, state.selectedKey) ? state.selectedKey : null,
			};
		}
		case "redo": {
			const next = state.future[state.future.length - 1];
			if (!next) return state;
			return {
				...state,
				...next,
				past: [...state.past, snapshotOf(state)],
				future: state.future.slice(0, -1),
				dirty: true,
				lastGroup: null,
				selectedKey:
					state.selectedKey && findNode(next.tree, state.selectedKey) ? state.selectedKey : null,
			};
		}
		case "saved":
			return { ...state, dirty: false, lastGroup: null };
	}
}

/**
 * Main builder hook.
 *
 * `onDirtyChange` lets the page react to the dirty flag (for example, a
 * `beforeunload` guard) without coupling the store to navigation.
 */
export function useBuilder(
	initial: BuilderState,
	onDirtyChange?: (dirty: boolean) => void,
): BuilderStore {
	const [state, dispatch] = React.useReducer(reducer, initial, (init) => ({
		tree: init.tree,
		orphanStyles: init.orphanStyles,
		content: init.content,
		pageCss: init.pageCss,
		contentTouched: init.contentTouched,
		selectedKey: init.selectedKey,
		breakpoint: init.breakpoint,
		dirty: init.dirty,
		past: [],
		future: [],
		lastGroup: null,
	}));

	React.useEffect(() => {
		onDirtyChange?.(state.dirty);
	}, [state.dirty, onDirtyChange]);

	const current = (): Snapshot => snapshotOf(state);

	/** Commits a tree change; a rejected change (same tree) is not recorded. */
	const commitTree = (nextTree: BuilderTree, select?: string | null, orphanStyles?: StoredStyles) => {
		if (nextTree === state.tree) return false;
		dispatch({
			type: "commit",
			next: { ...current(), tree: nextTree, orphanStyles: orphanStyles ?? state.orphanStyles },
			select,
		});
		return true;
	};

	const actions: BuilderActions = {
		select: (key) => dispatch({ type: "select", key }),
		setBreakpoint: (breakpoint) => dispatch({ type: "breakpoint", breakpoint }),

		commitTree,

		autoWrapBlock: (block, index) => {
			const containerNode = createNode("container", null);
			const tree = insertNode(state.tree, containerNode, null, index);
			const ref = createNode("content_ref", containerNode.key);
			ref.props = { ref_key: block._key };
			const nextTree = insertNode(tree, ref, containerNode.key, 0);
			if (nextTree === state.tree) return null;
			dispatch({
				type: "commit",
				next: {
					...current(),
					tree: nextTree,
					content: [...state.content, block],
					orphanStyles: state.orphanStyles,
				},
				select: ref.key,
				touchesContent: true,
			});
			return ref.key;
		},

		autoWrapNode: (type, index) => {
			const containerNode = createNode("container", null);
			const tree = insertNode(state.tree, containerNode, null, index);
			const node = createNode(type, containerNode.key);
			const nextTree = insertNode(tree, node, containerNode.key, 0);
			if (nextTree === state.tree) return null;
			dispatch({
				type: "commit",
				next: { ...current(), tree: nextTree, orphanStyles: state.orphanStyles },
				select: node.key,
			});
			return node.key;
		},

		addNode: (type, parentKey, index) => {
			const node = createNode(type, parentKey);
			return commitTree(insertNode(state.tree, node, parentKey, index), node.key) ? node.key : null;
		},

		moveExisting: (key, parentKey, index) => {
			commitTree(moveNode(state.tree, key, parentKey, index));
		},

		moveByKeyboard: (key, intent) => {
			const target = resolveMove(state.tree, key, intent);
			if (!target) return false;
			return commitTree(moveNode(state.tree, key, target.parentKey, target.index));
		},

		remove: (key) => {
			const { tree: nextTree, removedKeys } = removeNode(state.tree, key);
			if (removedKeys.length === 0) return;
			// Styles of retired nodes are kept as orphans so undo (or adding the
			// same type back) does not lose them.
			const styles = { ...state.orphanStyles };
			for (const removedKey of removedKeys) {
				const style = findNode(state.tree, removedKey)?.style;
				if (style && Object.keys(style).length > 0) styles[removedKey] = style;
			}
			// A selection inside the removed subtree would point at a node that is gone.
			const selectionGone = state.selectedKey !== null && removedKeys.includes(state.selectedKey);
			commitTree(nextTree, selectionGone ? null : undefined, styles);
		},

		duplicate: (key) => {
			const result = duplicateNode(state.tree, key);
			if (!result.newKey) return;
			const original = findNode(state.tree, key);
			const styles = { ...state.orphanStyles };
			if (original && Object.keys(original.style).length > 0) styles[result.newKey] = original.style;
			commitTree(result.tree, result.newKey, styles);
		},

		updateStyle: (key, target, patch) => {
			const node = findNode(state.tree, key);
			if (!node) return;
			const current = { ...(node.style[target] as Record<string, unknown> | undefined) };
			for (const [field, value] of Object.entries(patch)) {
				const empty =
					value === undefined ||
					value === "" ||
					(typeof value === "object" &&
						value !== null &&
						Object.values(value).every((inner) => inner === undefined || inner === "" || inner === false));
				if (empty) delete current[field];
				else current[field] = value;
			}
			const style = { ...node.style };
			if (Object.keys(current).length > 0) (style as Record<string, unknown>)[target] = current;
			else delete style[target];
			dispatch({
				type: "commit",
				next: { ...snapshotOf(state), tree: updateNodeStyle(state.tree, key, style) },
				group: `style:${key}:${target}:${Object.keys(patch).join(",")}`,
				at: Date.now(),
			});
		},

		renameNode: (key, name) => {
			const trimmed = name.trim();
			const rename = (nodes: BuilderTree): BuilderTree =>
				nodes.map((node) => {
					if (node.key === key) {
						const next = { ...node };
						if (trimmed) next.name = trimmed;
						else delete next.name;
						return next;
					}
					return node.children.length > 0 ? { ...node, children: rename(node.children) } : node;
				});
			commitTree(rename(state.tree));
		},

		updateProps: (key, patch) => {
			dispatch({
				type: "commit",
				next: { ...current(), tree: updateNodeProps(state.tree, key, patch) },
				group: `props:${key}:${Object.keys(patch).join(",")}`,
				at: Date.now(),
			});
		},

		editContent: (blockKey, field, value) => {
			if (field.startsWith("_")) return;
			dispatch({
				type: "commit",
				next: {
					...current(),
					content: state.content.map((block) =>
						block._key === blockKey ? { ...block, [field]: value } : block,
					),
				},
				group: `content:${blockKey}:${field}`,
				at: Date.now(),
				touchesContent: true,
			});
		},

		duplicateContent: (refNodeKey) => {
			const ref = findNode(state.tree, refNodeKey);
			if (!ref || ref.type !== "content_ref") return;
			const at = state.content.findIndex((block) => block._key === ref.props.ref_key);
			if (at === -1) return;
			const copy = { ...state.content[at]!, _key: newContentKey() };
			const refCopy = createNode("content_ref", ref.parent);
			refCopy.props = { ref_key: copy._key };
			const siblings = ref.parent === null ? state.tree : (findNode(state.tree, ref.parent)?.children ?? []);
			const index = siblings.findIndex((node) => node.key === ref.key) + 1;
			dispatch({
				type: "commit",
				next: {
					...current(),
					tree: insertNode(state.tree, refCopy, ref.parent, index),
					content: [...state.content.slice(0, at + 1), copy, ...state.content.slice(at + 1)],
				},
				select: refCopy.key,
				touchesContent: true,
			});
		},

		removeContent: (refNodeKey) => {
			const ref = findNode(state.tree, refNodeKey);
			if (!ref || ref.type !== "content_ref") return;
			dispatch({
				type: "commit",
				next: {
					...current(),
					tree: removeNode(state.tree, refNodeKey).tree,
					content: state.content.filter((block) => block._key !== ref.props.ref_key),
				},
				select: null,
				touchesContent: true,
			});
		},

		addContentBlock: (block, parentKey, index) => {
			const ref = createNode("content_ref", parentKey);
			ref.props = { ref_key: block._key };
			const nextTree = insertNode(state.tree, ref, parentKey, index);
			if (nextTree === state.tree) return null;
			dispatch({
				type: "commit",
				next: { ...current(), tree: nextTree, content: [...state.content, block] },
				select: ref.key,
				touchesContent: true,
			});
			return ref.key;
		},

		insertTemplate: (templateId, parentKey, index) => {
			const node = createNode("template_ref", parentKey);
			node.props = { ref_id: templateId };
			const nextTree = insertNode(state.tree, node, parentKey, index);
			if (nextTree === state.tree) return null;
			dispatch({
				type: "commit",
				next: { ...current(), tree: nextTree },
				select: node.key,
			});
			return node.key;
		},

		insertSubtree: (nodes, parentKey, index) => {
			if (nodes.length === 0) return null;
			const { nodes: cloned } = cloneSubtreeWithMap(nodes, parentKey);

			// One insertion per root, each at the next slot, so the template's
			// order is preserved and the whole copy lands as a single block.
			let tree: BuilderTree = state.tree;
			let at = index;
			for (const node of cloned) {
				const next = insertNode(tree, node, parentKey, at);
				if (next === tree) return null;
				tree = next;
				at = at === undefined ? undefined : at + 1;
			}

			dispatch({
				type: "commit",
				next: { ...current(), tree },
				select: cloned[0]!.key,
			});
			return cloned[0]!.key;
		},

		pasteSubtree: (nodes, contentBlocks, parentKey, index, options) => {
			if (nodes.length === 0) return null;
			const { nodes: cloned } = cloneSubtreeWithMap(nodes, parentKey);

			// Fresh content keys; refs follow them. A ref whose block is not
			// among `contentBlocks` cannot be placed and is dropped.
			const contentKeys = new Map<string, string>();
			const copies: ContentBlockValue[] = [];
			for (const block of contentBlocks) {
				if (contentKeys.has(block._key)) continue;
				const copy = { ...block, _key: newContentKey() };
				contentKeys.set(block._key, copy._key);
				copies.push(copy);
			}
			const remap = (list: BuilderNode[]): BuilderNode[] =>
				list
					.filter((node) => node.type !== "content_ref" || contentKeys.has(String(node.props.ref_key)))
					.map((node) => ({
						...node,
						style: styleWithoutId(node.style),
						props:
							node.type === "content_ref"
								? { ...node.props, ref_key: contentKeys.get(String(node.props.ref_key)) }
								: node.props,
						children: remap(node.children),
					}));
			let roots = remap(cloned);

			// At the root, a widget gets its container (as a drop does).
			if (parentKey === null && options?.wrapAtRoot) {
				roots = roots.map((node) => {
					if (node.type === "container" || !canContain("container", node.type)) return node;
					const wrapper = createNode("container", null);
					return { ...wrapper, children: [{ ...node, parent: wrapper.key }] };
				});
			}

			let tree: BuilderTree = state.tree;
			let at = index;
			for (const node of roots) {
				const next = insertNode(tree, node, parentKey, at);
				if (next === tree) return null;
				tree = next;
				at = at === undefined ? undefined : at + 1;
			}
			if (roots.length === 0) return null;
			// Keep only the copies the pasted refs use.
			const used = new Set<string>();
			walk(roots, (node) => {
				if (node.type === "content_ref") used.add(String(node.props.ref_key));
			});
			const added = copies.filter((block) => used.has(block._key));

			dispatch({
				type: "commit",
				next: { ...current(), tree, content: added.length > 0 ? [...state.content, ...added] : state.content },
				select: roots[0]!.key,
				touchesContent: added.length > 0,
			});
			return roots[0]!.key;
		},

		removeSubtree: (key) => {
			const node = findNode(state.tree, key);
			if (!node) return;
			const { tree: nextTree, removedKeys } = removeNode(state.tree, key);
			const refs = new Set<string>();
			const styles = { ...state.orphanStyles };
			walk([node], (descendant) => {
				if (descendant.type === "content_ref") refs.add(String(descendant.props.ref_key));
				if (Object.keys(descendant.style).length > 0) styles[descendant.key] = descendant.style;
			});
			const selectionGone = state.selectedKey !== null && removedKeys.includes(state.selectedKey);
			dispatch({
				type: "commit",
				next: {
					...current(),
					tree: nextTree,
					orphanStyles: styles,
					content: refs.size > 0 ? state.content.filter((block) => !refs.has(block._key)) : state.content,
				},
				select: selectionGone ? null : undefined,
				touchesContent: refs.size > 0,
			});
		},

		setStyle: (key, style) => {
			if (!findNode(state.tree, key)) return;
			dispatch({
				type: "commit",
				next: { ...current(), tree: updateNodeStyle(state.tree, key, style) },
			});
		},

		setPageCss: (css) => {
			if (css === state.pageCss) return;
			dispatch({
				type: "commit",
				next: { ...current(), pageCss: css },
				group: "page-css",
				at: Date.now(),
			});
		},

		undo: () => dispatch({ type: "undo" }),
		redo: () => dispatch({ type: "redo" }),
		markSaved: () => dispatch({ type: "saved" }),
		toSerializable: () => serializeTree(state.tree, state.orphanStyles, state.pageCss),
	};

	return {
		tree: state.tree,
		orphanStyles: state.orphanStyles,
		content: state.content,
		pageCss: state.pageCss,
		contentTouched: state.contentTouched,
		selectedKey: state.selectedKey,
		breakpoint: state.breakpoint,
		dirty: state.dirty,
		canUndo: state.past.length > 0,
		canRedo: state.future.length > 0,
		...actions,
	};
}

/** A fresh `_key` for a content block, in the format EmDash uses (UUID). */
export function newContentKey(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Total node count, useful for the status bar. */
export function nodeCount(tree: BuilderTree): number {
	return countNodes(tree);
}

/** Flattened list, useful for keyboard shortcuts and debugging. */
export function flatList(tree: BuilderTree) {
	return flatten(tree);
}

export type { BuilderNode, BuilderTree, Breakpoint };
