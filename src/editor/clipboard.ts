/**
 * The builder's clipboard: Copy / Paste / Copy style / Paste style.
 *
 * Kept in `localStorage`, as Elementor does, so a copy in one tab pastes in
 * another. Not the system clipboard: that needs permissions, is async and is
 * unreliable from inside the preview iframe.
 *
 * Everything read back is untrusted — any same-origin script (the previewed
 * site included) can write the key. Nodes travel in their STORED form and are
 * rebuilt with `deserializeEntry`, which keeps only registry types and their
 * declared fields. Content blocks are checked against the block types the
 * current collection allows, field by field. What fails is dropped.
 */

import { PARENT_FIELD } from "../schema/registry";
import { fieldsOf, type BlockTypeDef } from "./store/block-values";
import {
	deserializeEntry,
	serializeTree,
	type StoredBlock,
	type StoredStyles,
} from "./store/serialize";
import type { NodeType } from "../schema/types";
import type { BuilderNode, StyleByBreakpoint } from "./store/tree";
import type { ContentBlockValue } from "./store/useBuilder";

const STORAGE_KEY = "builderdash:clipboard";
const VERSION = 1;

interface Stored {
	v: typeof VERSION;
	/** The copied subtree, serialized (blocks + styles). */
	nodes?: { blocks: StoredBlock[]; styles: StoredStyles };
	/** Content blocks the subtree's content refs point at. */
	content?: unknown[];
	/** The style of the copied node, for Paste style. */
	style?: { type: string; style: StyleByBreakpoint };
}

/** What Paste and Paste style can use, already validated. */
export interface ClipboardContents {
	nodes: BuilderNode[];
	content: ContentBlockValue[];
	style: { type: NodeType; style: StyleByBreakpoint } | null;
}

function read(): Stored | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Stored;
		return parsed && typeof parsed === "object" && parsed.v === VERSION ? parsed : null;
	} catch {
		return null;
	}
}

function write(value: Stored): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		// Storage full or blocked: the copy is simply not kept.
	}
}

/** A node's style without its CSS ID: pasted twice it would repeat an HTML id. */
export function styleWithoutId(style: StyleByBreakpoint): StyleByBreakpoint {
	if (!style.advanced?.cssId) return style;
	const { cssId: _drop, ...advanced } = style.advanced;
	const next: StyleByBreakpoint = { ...style, advanced };
	if (Object.keys(advanced).length === 0) delete next.advanced;
	return next;
}

/** Copy: the node with its subtree, the content blocks it places, and its style. */
export function copyNode(node: BuilderNode, content: readonly ContentBlockValue[]): void {
	const refs = new Set<string>();
	const collect = (current: BuilderNode) => {
		if (current.type === "content_ref") refs.add(String(current.props.ref_key));
		current.children.forEach(collect);
	};
	collect(node);
	const { blocks, styles } = serializeTree([{ ...node, parent: null }]);
	write({
		v: VERSION,
		nodes: { blocks, styles },
		content: content.filter((block) => refs.has(block._key)),
		style: { type: node.type, style: node.style },
	});
}

/** Copy style: only the node's style; a copied element stays pasteable. */
export function copyStyle(node: BuilderNode): void {
	const previous = read();
	write({ ...(previous ?? { v: VERSION }), v: VERSION, style: { type: node.type, style: node.style } });
}

/**
 * The clipboard, validated for this collection. `allowedBlocks` are the block
 * types the collection's content may use: other blocks, and the refs that
 * place them, are dropped.
 */
export function readClipboard(allowedBlocks: readonly BlockTypeDef[]): ClipboardContents {
	const stored = read();
	const empty: ClipboardContents = { nodes: [], content: [], style: null };
	if (!stored) return empty;

	const content: ContentBlockValue[] = [];
	for (const raw of Array.isArray(stored.content) ? stored.content : []) {
		const block = validBlock(raw, allowedBlocks);
		if (block) content.push(block);
	}
	const placeable = new Set(content.map((block) => block._key));

	let nodes: BuilderNode[] = [];
	if (stored.nodes && typeof stored.nodes === "object") {
		try {
			const { tree } = deserializeEntry(acyclic(stored.nodes.blocks), stored.nodes.styles);
			nodes = pruneRefs(tree, placeable);
		} catch {
			nodes = [];
		}
	}

	let style: ClipboardContents["style"] = null;
	if (stored.style && typeof stored.style.type === "string" && isStyle(stored.style.style)) {
		style = { type: stored.style.type as NodeType, style: stored.style.style };
	}
	return { nodes, content, style };
}

/**
 * Blocks that rebuild into a finite tree: unique keys, and every parent
 * declared BEFORE its children (as `serializeTree` writes them). A crafted
 * duplicate key or cycle would otherwise recurse forever on rebuild.
 */
function acyclic(blocks: unknown): StoredBlock[] {
	if (!Array.isArray(blocks)) return [];
	const seen = new Set<string>();
	const kept: StoredBlock[] = [];
	for (const block of blocks as StoredBlock[]) {
		if (!block || typeof block !== "object" || typeof block._key !== "string" || seen.has(block._key)) continue;
		const parent = block[PARENT_FIELD];
		if (parent !== undefined && parent !== null && parent !== "" && !seen.has(String(parent))) continue;
		seen.add(block._key);
		kept.push(block);
	}
	return kept;
}

/** Content refs whose block is not pasteable are removed (no "Missing block"). */
function pruneRefs(nodes: BuilderNode[], placeable: ReadonlySet<string>): BuilderNode[] {
	return nodes
		.filter((node) => node.type !== "content_ref" || placeable.has(String(node.props.ref_key)))
		.map((node) => ({ ...node, children: pruneRefs(node.children, placeable) }));
}

function validBlock(raw: unknown, allowed: readonly BlockTypeDef[]): ContentBlockValue | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Record<string, unknown>;
	if (typeof value._key !== "string" || typeof value._type !== "string") return null;
	const type = allowed.find((candidate) => candidate.slug === value._type);
	if (!type) return null;
	const version =
		typeof value._version === "number" && type.versions.some((entry) => entry.version === value._version)
			? value._version
			: null;
	if (version === null) return null;
	// Only the fields the block type declares travel.
	const block: ContentBlockValue = { _key: value._key, _type: type.slug, _version: version };
	for (const field of fieldsOf(type, version)) {
		if (field.slug in value) block[field.slug] = value[field.slug];
	}
	return block;
}

function isStyle(value: unknown): value is StyleByBreakpoint {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.entries(value).every(
		([key, inner]) =>
			["desktop", "tablet", "mobile", "advanced"].includes(key) &&
			!!inner &&
			typeof inner === "object" &&
			!Array.isArray(inner),
	);
}
