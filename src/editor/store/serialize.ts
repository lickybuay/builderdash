/**
 * Serialization between the in-memory tree and the two data layers.
 *
 * Layer 1 — Content: an EmDash `blocks` field. A FLAT, ordered array.
 * Layer 2 — Styles:  a sibling `json` field on the same entry.
 *
 * `_key` links both layers. The hierarchy is rebuilt with the declared `parent_key` field.
 *
 * See `.agents/docs/builderdash/02-contrato-datos.md`.
 *
 * These functions are pure and depend on neither React nor the DOM: they are
 * the only part of milestone 1 that can be validated without a screen.
 */

import { requireWidget, blockTypeFor, PARENT_FIELD } from "../../schema/registry";
import type { NodeType } from "../../schema/types";
import type { BuilderNode, BuilderTree, StyleByBreakpoint } from "./tree";

/**
 * Current version of the builder block types.
 *
 * On a *breaking* change to a widget's fields, bump this, add the new version
 * to the seed and migrate with `migrateBlocks: true`.
 */
export const BLOCK_VERSION = 1;

/** A block as EmDash stores it. */
export interface StoredBlock extends Record<string, unknown> {
	_type: string;
	_version: number;
	_key: string;
}

/** Layer 2: styles indexed by `_key`. */
export type StoredStyles = Record<string, StyleByBreakpoint>;

export interface SerializedEntry {
	blocks: StoredBlock[];
	styles: StoredStyles;
}

// ---------------------------------------------------------------------------
// Tree → storage
// ---------------------------------------------------------------------------

/**
 * Converts the tree into both layers.
 *
 * The array order is render order: depth-first, parents before children. Every
 * block carries the declared parent field so the hierarchy can be rebuilt.
 *
 * `orphanStyles` re-introduces styles whose `_key` no longer has a block. They
 * are kept so deleting and undoing never destroys data, and so temporarily
 * retiring a block type does not lose them.
 */
export function serializeTree(
	tree: BuilderTree,
	orphanStyles: StoredStyles = {},
): SerializedEntry {
	const blocks: StoredBlock[] = [];
	const styles: StoredStyles = { ...orphanStyles };

	const visit = (nodes: BuilderTree, parentKey: string | null): void => {
		for (const node of nodes) {
			blocks.push(serializeNode(node, parentKey));
			if (Object.keys(node.style).length > 0) {
				styles[node.key] = node.style;
			}
			visit(node.children, node.key);
		}
	};

	visit(tree, null);
	return { blocks, styles };
}

function serializeNode(node: BuilderNode, parentKey: string | null): StoredBlock {
	const block: StoredBlock = {
		_type: blockTypeFor(node.type),
		_version: BLOCK_VERSION,
		_key: node.key,
	};

	// The parent pointer is a declared field, not a `_parent` convention: a
	// stored block rejects unknown keys.
	if (parentKey !== null) block[PARENT_FIELD] = parentKey;

	// Only fields declared by the widget are written. A prop that is not in the
	// registry never reaches the database.
	const widget = requireWidget(node.type);
	for (const field of widget.fields) {
		const value = node.props[field.slug];
		if (value !== undefined && value !== null && value !== "") {
			block[field.slug] = value;
		}
	}

	return block;
}

// ---------------------------------------------------------------------------
// Storage → tree
// ---------------------------------------------------------------------------

export interface DeserializedEntry {
	tree: BuilderTree;
	/** Styles whose `_key` matches no block: kept around. */
	orphanStyles: StoredStyles;
}

/**
 * Rebuilds the tree from both layers.
 *
 * Blocks with an unknown type are skipped (they cannot render) but their styles
 * are preserved as orphans.
 */
export function deserializeEntry(
	blocks: readonly StoredBlock[] | null | undefined,
	styles: StoredStyles | null | undefined,
): DeserializedEntry {
	const stored = Array.isArray(blocks) ? blocks : [];
	const storedStyles = styles && typeof styles === "object" ? styles : {};

	// Block index by key, plus grouping by parent preserving array order.
	const byKey = new Map<string, StoredBlock>();
	const childrenOf = new Map<string | null, StoredBlock[]>();

	for (const block of stored) {
		if (!block || typeof block._key !== "string") continue;
		if (!isKnownBlock(block)) continue;
		byKey.set(block._key, block);
		const parentKey =
			typeof block[PARENT_FIELD] === "string" && block[PARENT_FIELD] !== ""
				? (block[PARENT_FIELD] as string)
				: null;
		const bucket = childrenOf.get(parentKey);
		if (bucket) bucket.push(block);
		else childrenOf.set(parentKey, [block]);
	}

	const stylesUsed = new Set<string>();

	const build = (parentKey: string | null): BuilderNode[] => {
		const siblings = childrenOf.get(parentKey) ?? [];
		return siblings.map((block) => {
			const key = block._key;
			stylesUsed.add(key);
			const node: BuilderNode = {
				key,
				type: typeOfBlock(block._type),
				props: propsOfBlock(block),
				style: storedStyles[key] ?? {},
				children: build(key),
				parent: parentKey,
			};
			return node;
		});
	};

	const tree = build(null);

	const orphanStyles: StoredStyles = {};
	for (const [key, value] of Object.entries(storedStyles)) {
		if (!stylesUsed.has(key)) orphanStyles[key] = value;
	}

	return { tree, orphanStyles };
}

const KNOWN_TYPES: readonly NodeType[] = ["container"];

function isKnownBlock(block: StoredBlock): boolean {
	if (typeof block._type !== "string") return false;
	return KNOWN_TYPES.includes(typeOfBlock(block._type));
}

function typeOfBlock(blockType: string): NodeType {
	return blockType.replace(/^builder_/, "") as NodeType;
}

function propsOfBlock(block: StoredBlock): Record<string, unknown> {
	const widget = requireWidget(typeOfBlock(block._type));
	const props: Record<string, unknown> = {};
	for (const field of widget.fields) {
		if (field.slug in block) props[field.slug] = block[field.slug];
	}
	return props;
}

/** Checks the tree is well formed: every parent pointer resolves. **/
export function validateTree(tree: BuilderTree): string[] {
	const problems: string[] = [];
	const keys = new Set<string>();
	const collect = (nodes: BuilderTree): void => {
		for (const node of nodes) {
			if (keys.has(node.key)) problems.push(`Duplicate key: ${node.key}`);
			keys.add(node.key);
			collect(node.children);
		}
	};
	collect(tree);

	const check = (nodes: BuilderTree, expectedParent: string | null): void => {
		for (const node of nodes) {
			if (node.parent !== expectedParent) {
				problems.push(
					`${node.type} "${node.key}" has parent "${node.parent}" but expected "${expectedParent}"`,
				);
			}
			check(node.children, node.key);
		}
	};
	check(tree, null);

	return problems;
}
