/**
 * Tests for drop resolution in the Structure panel.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { createNode, type BuilderTree } from "../store/tree";
import { resolveTreeDrop, zoneFromPointer } from "./tree-drop";

/** [A, B(child C)] at the root. */
function tree(): BuilderTree {
	const a = createNode("container", null);
	a.key = "a";
	const b = createNode("container", null);
	b.key = "b";
	const c = createNode("container", "b");
	c.key = "c";
	b.children = [c];
	return [a, b];
}

const move = (nodeKey: string) => ({ kind: "existing" as const, nodeKey });

describe("zoneFromPointer", () => {
	it("splits a row into before / inside / after", () => {
		expect(zoneFromPointer(2, 40, true)).toBe("before");
		expect(zoneFromPointer(20, 40, true)).toBe("inside");
		expect(zoneFromPointer(38, 40, true)).toBe("after");
	});

	it("falls back to the nearest edge when the row cannot hold the node", () => {
		expect(zoneFromPointer(18, 40, false)).toBe("before");
		expect(zoneFromPointer(22, 40, false)).toBe("after");
	});
});

describe("resolveTreeDrop", () => {
	it("places before and after a row in the same parent", () => {
		expect(resolveTreeDrop(tree(), move("c"), "a", "before", false)).toEqual({
			parentKey: null,
			index: 0,
		});
		expect(resolveTreeDrop(tree(), move("c"), "a", "after", false)).toEqual({
			parentKey: null,
			index: 1,
		});
	});

	it("nests inside a container, at the end", () => {
		expect(resolveTreeDrop(tree(), move("a"), "b", "inside", true)).toEqual({
			parentKey: "b",
			index: 1,
		});
	});

	it("drops 'after' an expanded container as its first child", () => {
		expect(resolveTreeDrop(tree(), move("a"), "b", "after", true)).toEqual({
			parentKey: "b",
			index: 0,
		});
	});

	it("refuses a node onto itself or into its own descendant", () => {
		expect(resolveTreeDrop(tree(), move("b"), "b", "inside", true)).toBeNull();
		expect(resolveTreeDrop(tree(), move("b"), "c", "inside", false)).toBeNull();
	});

	it("treats a drop into the gap the node already occupies as no move", () => {
		expect(resolveTreeDrop(tree(), move("a"), "b", "before", false)).toBeNull();
	});

	it("accepts a new node from the palette", () => {
		expect(
			resolveTreeDrop(tree(), { kind: "new", nodeType: "container" }, "a", "inside", false),
		).toEqual({ parentKey: "a", index: 0 });
	});

	it("accepts a new content block from the palette, inside a container", () => {
		expect(
			resolveTreeDrop(
				tree(),
				{ kind: "new", nodeType: "content_ref", blockType: "marketing_hero" },
				"a",
				"inside",
				true,
			),
		).toEqual({ parentKey: "a", index: 0 });
	});

	it("accepts new basic widgets at the root", () => {
		expect(resolveTreeDrop(tree(), { kind: "new", nodeType: "heading" }, "a", "before", false)).toEqual({
			parentKey: null,
			index: 0,
		});
		expect(resolveTreeDrop(tree(), { kind: "new", nodeType: "text" }, "a", "after", false)).toEqual({
			parentKey: null,
			index: 1,
		});
	});

	it("accepts new basic widgets inside a container", () => {
		expect(resolveTreeDrop(tree(), { kind: "new", nodeType: "image" }, "a", "inside", false)).toEqual({
			parentKey: "a",
			index: 0,
		});
		expect(resolveTreeDrop(tree(), { kind: "new", nodeType: "button" }, "a", "inside", false)).toEqual({
			parentKey: "a",
			index: 0,
		});
		expect(resolveTreeDrop(tree(), { kind: "new", nodeType: "divider" }, "a", "inside", false)).toEqual({
			parentKey: "a",
			index: 0,
		});
	});

	it("accepts nesting basic widgets inside a container", () => {
		expect(resolveTreeDrop(tree(), { kind: "new", nodeType: "heading" }, "a", "inside", false)).toEqual({
			parentKey: "a",
			index: 0,
		});
	});

	it("accepts a template drop where a container fits", () => {
		const tpl = { kind: "template" as const, templateId: "tpl-1" };
		// Inside a container, at the end.
		expect(resolveTreeDrop(tree(), tpl, "a", "inside", false)).toEqual({ parentKey: "a", index: 0 });
		// At the root, before another node.
		expect(resolveTreeDrop(tree(), tpl, "a", "before", false)).toEqual({ parentKey: null, index: 0 });
	});
});
