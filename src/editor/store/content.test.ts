/**
 * Tests for the content reconciliation and the content-edit merge.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { contentBlockLabel, mergeContentEdits, reconcileWithContent } from "./content";
import { CSS_KEY, deserializeEntry, NAMES_KEY, serializeTree } from "./serialize";
import { createNode, type BuilderTree } from "./tree";

const hero = { _key: "k-hero", _type: "marketing_hero", _version: 1, headline: "Hi" };
const faq = { _key: "k-faq", _type: "marketing_faq", _version: 1 };

const refsOf = (tree: BuilderTree) => tree.map((node) => node.props.ref_key);

describe("reconcileWithContent", () => {
	it("starts an empty tree with one ref per content block, in order", () => {
		const { tree, changed } = reconcileWithContent([], [hero, faq]);
		expect(changed).toBe(true);
		expect(tree.map((node) => node.type)).toEqual(["content_ref", "content_ref"]);
		expect(refsOf(tree)).toEqual(["k-hero", "k-faq"]);
	});

	it("leaves an empty tree unchanged when there is no content", () => {
		expect(reconcileWithContent([], []).changed).toBe(false);
	});

	it("appends refs for blocks added later in the EmDash editor", () => {
		const start = reconcileWithContent([], [hero]).tree;
		const { tree, changed } = reconcileWithContent(start, [hero, faq]);
		expect(changed).toBe(true);
		expect(refsOf(tree)).toEqual(["k-hero", "k-faq"]);
	});

	it("drops refs whose block was deleted, at any depth", () => {
		const box = createNode("container", null);
		const ref = createNode("content_ref", box.key);
		ref.props = { ref_key: "gone" };
		box.children = [ref];
		const { tree, changed } = reconcileWithContent([box], []);
		expect(changed).toBe(true);
		expect(tree[0]!.children).toEqual([]);
	});

	it("reports no change when the tree already matches", () => {
		const start = reconcileWithContent([], [hero]).tree;
		expect(reconcileWithContent(start, [hero]).changed).toBe(false);
	});
});

describe("mergeContentEdits", () => {
	it("replaces only the edited fields and keeps the block's identity", () => {
		const merged = mergeContentEdits([hero, faq], { "k-hero": { headline: "New", _type: "evil" } });
		expect(merged[0]).toEqual({ ...hero, headline: "New" });
		expect(merged[1]).toBe(faq);
	});
});

describe("contentBlockLabel", () => {
	it("turns a block type into a readable label", () => {
		expect(contentBlockLabel("marketing_hero")).toBe("Hero");
		expect(contentBlockLabel("marketing_faq")).toBe("Faq");
	});
});

describe("node names", () => {
	it("round-trip through the styles layer without becoming orphans", () => {
		const node = createNode("container", null);
		node.name = "Hero section";
		const { blocks, styles } = serializeTree([node]);
		expect(styles[NAMES_KEY]).toEqual({ [node.key]: "Hero section" });

		const { tree, orphanStyles } = deserializeEntry(blocks, styles);
		expect(tree[0]!.name).toBe("Hero section");
		expect(orphanStyles[NAMES_KEY]).toBeUndefined();
	});

	it("keeps advanced settings with the node's styles", () => {
		const node = createNode("container", null);
		node.style = { advanced: { cssId: "intro" } };
		const { blocks, styles } = serializeTree([node]);
		expect(deserializeEntry(blocks, styles).tree[0]!.style.advanced).toEqual({ cssId: "intro" });
	});
});

describe("page custom CSS", () => {
	it("round-trips through the styles layer and is not an orphan", () => {
		const node = createNode("container", null);
		const { blocks, styles } = serializeTree([node], {}, ".builderdash h1 { color: red; }");
		expect(styles[CSS_KEY]).toBe(".builderdash h1 { color: red; }");

		const entry = deserializeEntry(blocks, styles);
		expect(entry.pageCss).toBe(".builderdash h1 { color: red; }");
		expect(entry.orphanStyles[CSS_KEY]).toBeUndefined();
	});

	it("is left out when empty", () => {
		expect(serializeTree([], {}, "  ").styles[CSS_KEY]).toBeUndefined();
	});
});
