/**
 * Store action tests: paste, remove-with-content and style replacement.
 *
 * The actions close over the hook's state, so after each `act` the latest
 * `result.current` is read again.
 *
 * Run: pnpm test
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { initialStateFrom, useBuilder, type ContentBlockValue } from "./useBuilder";
import { createNode, findNode, walk, type BuilderNode, type BuilderTree } from "./tree";
import { serializeTree } from "./serialize";

function ref(key: string, parent: string | null): BuilderNode {
	const node = createNode("content_ref", parent);
	node.props = { ref_key: key };
	return node;
}

function block(key: string): ContentBlockValue {
	return { _key: key, _type: "marketing_hero", _version: 1, headline: "Hi" };
}

function setup(tree: BuilderTree, content: ContentBlockValue[] = []) {
	const { blocks, styles } = serializeTree(tree);
	return renderHook(() => useBuilder(initialStateFrom(blocks, styles, content)));
}

function keysOf(tree: BuilderTree): string[] {
	const keys: string[] = [];
	walk(tree, (node) => keys.push(node.key));
	return keys;
}

function refKeys(tree: BuilderTree): string[] {
	const keys: string[] = [];
	walk(tree, (node) => {
		if (node.type === "content_ref") keys.push(String(node.props.ref_key));
	});
	return keys;
}

describe("pasteSubtree", () => {
	function source() {
		const root = createNode("container", null);
		root.style = { desktop: { background: "#fff" }, advanced: { cssId: "hero", cssClasses: "x" } };
		const placed = ref("blk-1", root.key);
		const orphanRef = ref("missing", root.key);
		root.children = [placed, orphanRef];
		return root;
	}

	it("gives nodes and content blocks fresh keys, and drops refs without a block", () => {
		const root = source();
		const { result } = setup([]);

		let pasted: string | null = null;
		act(() => {
			pasted = result.current.pasteSubtree([root], [block("blk-1")], null);
		});

		const tree = result.current.tree;
		expect(tree).toHaveLength(1);
		expect(pasted).toBe(tree[0]!.key);
		expect(tree[0]!.key).not.toBe(root.key);
		expect(keysOf(tree)).not.toContain(root.children[0]!.key);

		// One ref survives, pointing at a copied block under a new _key.
		const refs = refKeys(tree);
		expect(refs).toHaveLength(1);
		expect(refs[0]).not.toBe("blk-1");
		expect(result.current.content).toHaveLength(1);
		expect(result.current.content[0]!._key).toBe(refs[0]);
		expect(result.current.content[0]!.headline).toBe("Hi");
		expect(result.current.contentTouched).toBe(true);
		expect(result.current.selectedKey).toBe(tree[0]!.key);
	});

	it("strips the CSS id but keeps the rest of the style", () => {
		const { result } = setup([]);
		act(() => {
			result.current.pasteSubtree([source()], [block("blk-1")], null);
		});
		expect(result.current.tree[0]!.style).toEqual({
			desktop: { background: "#fff" },
			advanced: { cssClasses: "x" },
		});
	});

	it("wraps a widget at the root in a container when asked", () => {
		const heading = createNode("heading", null);
		const { result } = setup([]);
		act(() => {
			result.current.pasteSubtree([heading], [], null, undefined, { wrapAtRoot: true });
		});
		const root = result.current.tree[0]!;
		expect(root.type).toBe("container");
		expect(root.children.map((child) => child.type)).toEqual(["heading"]);
		expect(root.children[0]!.parent).toBe(root.key);
	});

	it("does not wrap without wrapAtRoot", () => {
		const heading = createNode("heading", null);
		const { result } = setup([]);
		act(() => {
			result.current.pasteSubtree([heading], [], null);
		});
		expect(result.current.tree[0]!.type).toBe("heading");
	});

	it("is one undo step that restores tree and content", () => {
		const { result } = setup([]);
		expect(result.current.canUndo).toBe(false);
		act(() => {
			result.current.pasteSubtree([source()], [block("blk-1")], null);
		});
		expect(result.current.canUndo).toBe(true);
		act(() => result.current.undo());
		expect(result.current.tree).toEqual([]);
		expect(result.current.content).toEqual([]);
		expect(result.current.canUndo).toBe(false);
	});

	it("returns null and changes nothing for an empty paste", () => {
		const { result } = setup([]);
		let out: string | null = "x";
		act(() => {
			out = result.current.pasteSubtree([], [], null);
		});
		expect(out).toBeNull();
		expect(result.current.canUndo).toBe(false);
	});

	it("does not change anything when every pasted root is a ref without a block", () => {
		const { result } = setup([]);
		let out: string | null = "x";
		act(() => {
			out = result.current.pasteSubtree([ref("missing", null)], [], null);
		});
		expect(out).toBeNull();
		expect(result.current.tree).toEqual([]);
		expect(result.current.canUndo).toBe(false);
	});
});

describe("removeSubtree", () => {
	function page() {
		const outer = createNode("container", null);
		const inner = createNode("container", outer.key);
		const placed = ref("blk-1", inner.key);
		inner.children = [placed];
		outer.children = [inner];
		const sibling = createNode("container", null);
		const keep = ref("blk-2", sibling.key);
		sibling.children = [keep];
		return { tree: [outer, sibling], outer, inner, placed, sibling };
	}

	it("removes the nested content blocks the subtree places, and only those", () => {
		const { tree, outer } = page();
		const { result } = setup(tree, [block("blk-1"), block("blk-2")]);
		act(() => result.current.removeSubtree(outer.key));
		expect(result.current.tree).toHaveLength(1);
		expect(result.current.content.map((b) => b._key)).toEqual(["blk-2"]);
		expect(result.current.contentTouched).toBe(true);
	});

	it("clears the selection when the selected node was inside", () => {
		const { tree, outer, placed } = page();
		const { result } = setup(tree, [block("blk-1"), block("blk-2")]);
		act(() => result.current.select(placed.key));
		expect(result.current.selectedKey).toBe(placed.key);
		act(() => result.current.removeSubtree(outer.key));
		expect(result.current.selectedKey).toBeNull();
	});

	it("keeps the selection when it was outside the subtree", () => {
		const { tree, outer, sibling } = page();
		const { result } = setup(tree, [block("blk-1"), block("blk-2")]);
		act(() => result.current.select(sibling.key));
		act(() => result.current.removeSubtree(outer.key));
		expect(result.current.selectedKey).toBe(sibling.key);
	});

	it("is undoable, restoring the tree and the content", () => {
		const { tree, outer } = page();
		const { result } = setup(tree, [block("blk-1"), block("blk-2")]);
		act(() => result.current.removeSubtree(outer.key));
		act(() => result.current.undo());
		expect(result.current.tree).toHaveLength(2);
		expect(result.current.content.map((b) => b._key)).toEqual(["blk-1", "blk-2"]);
	});

	it("ignores an unknown key", () => {
		const { tree } = page();
		const { result } = setup(tree);
		act(() => result.current.removeSubtree("nope"));
		expect(result.current.canUndo).toBe(false);
	});
});

describe("setStyle", () => {
	it("replaces the whole style, and {} resets it", () => {
		const node = createNode("container", null);
		node.style = { desktop: { background: "#fff" }, tablet: { color: "#000" } };
		const { result } = setup([node]);

		act(() => result.current.setStyle(node.key, { mobile: { background: "#000" } }));
		expect(findNode(result.current.tree, node.key)!.style).toEqual({ mobile: { background: "#000" } });

		act(() => result.current.setStyle(node.key, {}));
		expect(findNode(result.current.tree, node.key)!.style).toEqual({});
		expect(result.current.canUndo).toBe(true);
	});

	it("ignores an unknown key", () => {
		const { result } = setup([createNode("container", null)]);
		act(() => result.current.setStyle("nope", { desktop: {} }));
		expect(result.current.canUndo).toBe(false);
	});
});
