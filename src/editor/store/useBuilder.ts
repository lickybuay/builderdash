/**
 * Builder store.
 *
 * A single immutable tree plus UI state (selection, device) that is NOT part of
 * the composition. Undo/redo keeps full snapshots: with ~40 nodes the cost is
 * trivial and the correctness argument is obvious.
 */

import * as React from "react";

import type { NodeType } from "../../schema/types";
import {
	countNodes,
	createNode,
	duplicateNode,
	flatten,
	findNode,
	insertNode,
	moveNode,
	removeNode,
	resolveMove,
	type BuilderNode,
	type BuilderTree,
	type Breakpoint,
	type MoveIntent,
} from "./tree";
import {
	deserializeEntry,
	serializeTree,
	type SerializedEntry,
	type StoredBlock,
	type StoredStyles,
} from "./serialize";

/** One entry in the history stack. */
interface Snapshot {
	tree: BuilderTree;
	orphanStyles: StoredStyles;
}

const HISTORY_LIMIT = 50;

export interface BuilderState {
	tree: BuilderTree;
	/** Styles whose `_key` no longer has a block. Kept so data is never lost. */
	orphanStyles: StoredStyles;
	selectedKey: string | null;
	breakpoint: Breakpoint;
	dirty: boolean;
	canUndo: boolean;
	canRedo: boolean;
}

export interface BuilderActions {
	select: (key: string | null) => void;
	setBreakpoint: (breakpoint: Breakpoint) => void;
	addNode: (type: NodeType, parentKey: string | null, index?: number) => string | null;
	moveExisting: (key: string, parentKey: string | null, index?: number) => void;
	/** Keyboard move of the selected node. Returns the new target, or `null`. */
	moveByKeyboard: (key: string, intent: MoveIntent) => boolean;
	remove: (key: string) => void;
	duplicate: (key: string) => void;
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
): BuilderState {
	const { tree, orphanStyles } = deserializeEntry(blocks, styles);
	return {
		tree,
		orphanStyles,
		selectedKey: null,
		breakpoint: "desktop",
		dirty: false,
		canUndo: false,
		canRedo: false,
	};
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
	const [tree, setTree] = React.useState<BuilderTree>(initial.tree);
	const [orphanStyles, setOrphanStyles] = React.useState<StoredStyles>(initial.orphanStyles);
	const [selectedKey, setSelectedKey] = React.useState<string | null>(initial.selectedKey);
	const [breakpoint, setBreakpoint] = React.useState<Breakpoint>(initial.breakpoint);
	const [dirty, setDirty] = React.useState(initial.dirty);

	const past = React.useRef<Snapshot[]>([]);
	const future = React.useRef<Snapshot[]>([]);
	const [, forceRender] = React.useReducer((n: number) => n + 1, 0);

	const markDirty = React.useCallback(
		(next: boolean) => {
			setDirty(next);
			onDirtyChange?.(next);
		},
		[onDirtyChange],
	);

	/** Applies a tree change, pushing the previous state onto the history. */
	const commit = React.useCallback(
		(update: (current: Snapshot) => Snapshot | null) => {
			setTree((currentTree) => {
				const current: Snapshot = { tree: currentTree, orphanStyles };
				const next = update(current);
				if (!next) return currentTree;

				past.current.push(current);
				if (past.current.length > HISTORY_LIMIT) past.current.shift();
				future.current = [];

				setOrphanStyles(next.orphanStyles);
				markDirty(true);
				forceRender();
				return next.tree;
			});
		},
		[orphanStyles, markDirty],
	);

	const restore = React.useCallback((snapshot: Snapshot) => {
		setTree(snapshot.tree);
		setOrphanStyles(snapshot.orphanStyles);
		setSelectedKey((key) => (key && findNode(snapshot.tree, key) ? key : null));
	}, []);

	const actions: BuilderActions = {
		select: setSelectedKey,
		setBreakpoint,

		addNode: (type, parentKey, index) => {
			const node = createNode(type, parentKey);
			commit((current) => {
				const nextTree = insertNode(current.tree, node, parentKey, index);
				// A rejected insert (disallowed type) must not enter history.
				if (nextTree === current.tree) return null;
				return { tree: nextTree, orphanStyles: current.orphanStyles };
			});
			setSelectedKey(node.key);
			return node.key;
		},

		moveExisting: (key, parentKey, index) => {
			commit((current) => {
				const nextTree = moveNode(current.tree, key, parentKey, index);
				if (nextTree === current.tree) return null;
				return { tree: nextTree, orphanStyles: current.orphanStyles };
			});
		},

		moveByKeyboard: (key, intent) => {
			// Resolve against the CURRENT tree before committing, so a blocked
			// move does not push a no-op onto the history.
			const target = resolveMove(tree, key, intent);
			if (!target) return false;

			commit((current) => {
				const nextTree = moveNode(current.tree, key, target.parentKey, target.index);
				if (nextTree === current.tree) return null;
				return { tree: nextTree, orphanStyles: current.orphanStyles };
			});
			return true;
		},

		remove: (key) => {
			commit((current) => {
				const { tree: nextTree, removedKeys } = removeNode(current.tree, key);
				if (removedKeys.length === 0) return null;

				// Styles of retired nodes are kept as orphans so undo (or adding
				// the same type back) does not lose them. Real cleanup happens at
				// save time, not here.
				const styles = { ...current.orphanStyles };
				for (const removedKey of removedKeys) {
					const style = findNode(current.tree, removedKey)?.style;
					if (style && Object.keys(style).length > 0) styles[removedKey] = style;
				}

				return { tree: nextTree, orphanStyles: styles };
			});
			setSelectedKey((current) => (current === key ? null : current));
		},

		duplicate: (key) => {
			let created: string | null = null;
			commit((current) => {
				const result = duplicateNode(current.tree, key);
				if (!result.newKey) return null;
				created = result.newKey;

				// The clone inherits the original styles under its new key.
				const original = findNode(current.tree, key);
				const styles = { ...current.orphanStyles };
				if (original && Object.keys(original.style).length > 0 && result.newKey) {
					styles[result.newKey] = original.style;
				}
				return { tree: result.tree, orphanStyles: styles };
			});
			if (created) setSelectedKey(created);
		},

		undo: () => {
			const previous = past.current.pop();
			if (!previous) return;
			future.current.push({ tree, orphanStyles });
			restore(previous);
			markDirty(true);
			forceRender();
		},

		redo: () => {
			const next = future.current.pop();
			if (!next) return;
			past.current.push({ tree, orphanStyles });
			restore(next);
			markDirty(true);
			forceRender();
		},

		markSaved: () => markDirty(false),

		toSerializable: () => serializeTree(tree, orphanStyles),
	};

	return {
		tree,
		orphanStyles,
		selectedKey,
		breakpoint,
		dirty,
		canUndo: past.current.length > 0,
		canRedo: future.current.length > 0,
		...actions,
	};
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
