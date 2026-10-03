/**
 * Reconciliation between the builder tree and the entry's existing content.
 *
 * A page already has content before the builder touches it: the blocks in its
 * `content` field (a hero, an FAQ…). The builder does not copy those blocks; it
 * places them with `content_ref` nodes that point at a block's `_key`.
 *
 * The site header and footer are not part of the page: the site renders them
 * around every layout, and the builder never lists or moves them.
 *
 * - An empty tree starts as one ref per content block.
 * - A block added later in the EmDash editor gets a ref, appended at the root,
 *   so it is never silently missing from the page.
 * - A ref whose block was deleted is dropped.
 *
 * Pure: no React, no I/O.
 */

import { countNodes, createNode, walk, type BuilderNode, type BuilderTree } from "./tree";

/** A block of the entry's `content` field, as far as the builder cares. */
export interface ContentBlock {
	_key: string;
	_type: string;
}

export interface ReconcileResult {
	tree: BuilderTree;
	/** `true` when the tree differs from the stored one and should be saved. */
	changed: boolean;
}

function refNode(block: ContentBlock, parent: string | null): BuilderNode {
	const node = createNode("content_ref", parent);
	node.props = { ref_key: block._key };
	return node;
}

/** Removes refs whose block no longer exists, at any depth. */
function dropDangling(nodes: BuilderTree, keys: ReadonlySet<string>): BuilderTree {
	return nodes
		.filter((node) => node.type !== "content_ref" || keys.has(String(node.props.ref_key)))
		.map((node) =>
			node.children.length > 0 ? { ...node, children: dropDangling(node.children, keys) } : node,
		);
}

export function reconcileWithContent(
	tree: BuilderTree,
	content: readonly ContentBlock[] | null | undefined,
): ReconcileResult {
	const blocks = (Array.isArray(content) ? content : []).filter(
		(block): block is ContentBlock => !!block && typeof block._key === "string",
	);

	if (tree.length === 0) {
		return { tree: blocks.map((block) => refNode(block, null)), changed: blocks.length > 0 };
	}

	const keys = new Set(blocks.map((block) => block._key));
	let next = dropDangling(tree, keys);
	let changed = countNodes(next) !== countNodes(tree);

	const placed = new Set<string>();
	walk(next, (node) => {
		if (node.type === "content_ref") placed.add(String(node.props.ref_key));
	});

	const missing = blocks.filter((block) => !placed.has(block._key));
	if (missing.length > 0) {
		next = [...next, ...missing.map((block) => refNode(block, null))];
		changed = true;
	}

	return { tree: next, changed };
}

/** "marketing_hero" → "Hero". Used to label refs in the tree and the canvas. */
export function contentBlockLabel(type: string): string {
	const base = type.replace(/^[a-z]+_/, "");
	return base.charAt(0).toUpperCase() + base.slice(1).replace(/_/g, " ");
}

/**
 * Applies pending field edits to the stored content blocks, by `_key`.
 *
 * Starts from each stored block as-is (its `_type`, `_version`, `_key` and any
 * field the form does not show stay untouched) and overwrites only the edited
 * fields. Blocks without edits are returned unchanged.
 */
export function mergeContentEdits<T extends ContentBlock>(
	content: readonly T[] | null | undefined,
	edits: Readonly<Record<string, Record<string, unknown>>>,
): T[] {
	return (Array.isArray(content) ? content : []).map((block) => {
		const patch = edits[block._key];
		if (!patch) return block;
		const next: Record<string, unknown> = { ...block };
		for (const [field, value] of Object.entries(patch)) {
			if (field.startsWith("_")) continue;
			next[field] = value;
		}
		return next as T;
	});
}
