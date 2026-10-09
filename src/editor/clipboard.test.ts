/**
 * Clipboard tests.
 *
 * The clipboard lives in localStorage, which any same-origin script can write,
 * so everything read back is untrusted: these pin the round trip and what
 * `readClipboard` drops (disallowed block types, unknown fields and versions,
 * crafted duplicate-key or cyclic blocks, malformed payloads).
 *
 * Run: pnpm test
 */

import { beforeEach, describe, expect, it } from "vitest";

import { copyNode, copyStyle, readClipboard, styleWithoutId } from "./clipboard";
import type { BlockTypeDef } from "./store/block-values";
import { createNode, walk, type BuilderNode } from "./store/tree";
import type { ContentBlockValue } from "./store/useBuilder";

const STORAGE_KEY = "builderdash:clipboard";

const hero: BlockTypeDef = {
	slug: "marketing_hero",
	label: "Hero",
	currentVersion: 2,
	versions: [
		{ version: 1, fields: [{ slug: "headline", type: "string" }] },
		{
			version: 2,
			fields: [
				{ slug: "headline", type: "string" },
				{ slug: "subheadline", type: "text" },
			],
		},
	],
};

function ref(key: string, parent: string | null = null): BuilderNode {
	const node = createNode("content_ref", parent);
	node.props = { ref_key: key };
	return node;
}

function heroBlock(key: string, extra: Record<string, unknown> = {}): ContentBlockValue {
	return { _key: key, _type: "marketing_hero", _version: 2, headline: "Hi", ...extra };
}

function setRaw(value: unknown): void {
	window.localStorage.setItem(STORAGE_KEY, typeof value === "string" ? value : JSON.stringify(value));
}

beforeEach(() => {
	window.localStorage.clear();
});

describe("copyNode / readClipboard", () => {
	it("round-trips the subtree, its content blocks and its style", () => {
		const root = createNode("container", null);
		root.style = { desktop: { background: "#fff" } };
		const heading = createNode("heading", root.key);
		const placed = ref("blk-1", root.key);
		root.children = [heading, placed];
		const used = heroBlock("blk-1");
		const unused = heroBlock("blk-2");

		copyNode(root, [used, unused]);
		const clip = readClipboard([hero]);

		expect(clip.nodes).toHaveLength(1);
		const types: string[] = [];
		walk(clip.nodes, (node) => types.push(node.type));
		expect(types).toEqual(["container", "heading", "content_ref"]);
		expect(clip.nodes[0]!.style).toEqual({ desktop: { background: "#fff" } });
		expect(clip.content).toEqual([used]);
		expect(clip.style).toEqual({ type: "container", style: root.style });
	});

	it("drops content blocks of a type the collection does not allow, and the refs to them", () => {
		const root = createNode("container", null);
		root.children = [ref("blk-1", root.key), ref("faq-1", root.key)];
		copyNode(root, [heroBlock("blk-1"), { _key: "faq-1", _type: "marketing_faq", _version: 1 }]);

		const clip = readClipboard([hero]);

		expect(clip.content.map((block) => block._key)).toEqual(["blk-1"]);
		const refs: string[] = [];
		walk(clip.nodes, (node) => {
			if (node.type === "content_ref") refs.push(String(node.props.ref_key));
		});
		expect(refs).toEqual(["blk-1"]);
	});

	it("keeps only the fields the block version declares", () => {
		const root = createNode("container", null);
		root.children = [ref("blk-1", root.key)];
		copyNode(root, [heroBlock("blk-1", { evil: "<script>", subheadline: "Sub" })]);
		expect(readClipboard([hero]).content[0]).toEqual({
			_key: "blk-1",
			_type: "marketing_hero",
			_version: 2,
			headline: "Hi",
			subheadline: "Sub",
		});

		// Version 1 does not declare subheadline.
		window.localStorage.clear();
		copyNode(root, [heroBlock("blk-1", { _version: 1, subheadline: "Sub" })]);
		expect(readClipboard([hero]).content[0]).not.toHaveProperty("subheadline");
	});

	it("rejects a block with an unknown _version", () => {
		const root = createNode("container", null);
		root.children = [ref("blk-1", root.key)];
		copyNode(root, [heroBlock("blk-1", { _version: 99 })]);
		const clip = readClipboard([hero]);
		expect(clip.content).toEqual([]);
		const refs: BuilderNode[] = [];
		walk(clip.nodes, (node) => node.type === "content_ref" && refs.push(node));
		expect(refs).toEqual([]);
	});
});

describe("readClipboard with crafted payloads", () => {
	const block = (key: string, parent?: string) => ({
		_type: "builder_container",
		_version: 1,
		_key: key,
		...(parent ? { parent_key: parent } : {}),
	});

	it("ignores duplicate keys", () => {
		setRaw({
			v: 1,
			nodes: { blocks: [block("a"), block("a"), block("b", "a")], styles: {} },
		});
		const clip = readClipboard([hero]);
		let count = 0;
		walk(clip.nodes, () => count++);
		expect(count).toBe(2);
	});

	it("does not recurse on a cycle", () => {
		setRaw({
			v: 1,
			nodes: { blocks: [block("a", "b"), block("b", "a")], styles: {} },
		});
		const clip = readClipboard([hero]);
		let count = 0;
		walk(clip.nodes, () => count++);
		expect(count).toBe(0);
	});

	it("does not accept a block that is its own parent", () => {
		setRaw({ v: 1, nodes: { blocks: [block("a", "a")], styles: {} } });
		expect(() => readClipboard([hero])).not.toThrow();
		expect(readClipboard([hero]).nodes).toEqual([]);
	});

	it.each([
		["malformed JSON", "{not json"],
		["a wrong version", { v: 2, nodes: { blocks: [], styles: {} } }],
		["no version", { nodes: { blocks: [], styles: {} } }],
		["null", "null"],
		["an array", "[]"],
	])("returns an empty clipboard for %s", (_name, raw) => {
		setRaw(raw);
		expect(readClipboard([hero])).toEqual({ nodes: [], content: [], style: null });
	});

	it("returns an empty clipboard when nothing was copied", () => {
		expect(readClipboard([hero])).toEqual({ nodes: [], content: [], style: null });
	});

	it("rejects a style with an unknown breakpoint key", () => {
		setRaw({ v: 1, style: { type: "container", style: { evil: { a: 1 } } } });
		expect(readClipboard([hero]).style).toBeNull();
	});
});

describe("copyStyle", () => {
	it("keeps a previously copied node pasteable", () => {
		const root = createNode("container", null);
		copyNode(root, []);
		const heading = createNode("heading", null);
		heading.style = { desktop: { color: "#111" } };
		copyStyle(heading);
		const clip = readClipboard([]);
		expect(clip.nodes).toHaveLength(1);
		expect(clip.style).toEqual({ type: "heading", style: heading.style });
	});
});

describe("styleWithoutId", () => {
	it("strips advanced.cssId and keeps the rest", () => {
		expect(styleWithoutId({ advanced: { cssId: "x", cssClasses: "a" } })).toEqual({
			advanced: { cssClasses: "a" },
		});
	});

	it("removes advanced when nothing else is left", () => {
		expect(styleWithoutId({ desktop: { color: "#111" }, advanced: { cssId: "x" } })).toEqual({
			desktop: { color: "#111" },
		});
	});

	it("returns a style without an id untouched", () => {
		const style = { desktop: { color: "#111" } };
		expect(styleWithoutId(style)).toBe(style);
	});
});
