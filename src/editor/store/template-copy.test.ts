/**
 * Template copy tests.
 *
 * A template is inserted as a COPY of its widgets (Elementor's "Saved
 * Template" semantics), not as a live reference. These tests pin the two
 * pieces that make the copy safe:
 *
 *   - `cloneSubtreeWithMap` regenerates every key, so a copy never collides
 *     with the node it came from, and reports the `oldKey → newKey` map.
 *   - The full cycle `builder_layout → deserializeEntry → cloneSubtreeWithMap`
 *     preserves hierarchy and styles.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import {
	allKeys,
	cloneSubtreeWithMap,
	createNode,
	findNode,
	walk,
	type BuilderTree,
} from "./tree";
import { deserializeEntry, type StoredBlock } from "./serialize";

/** A container with a styled heading child and a text grandchild. */
function nested(): BuilderTree {
	const root = createNode("container", null);
	const heading = createNode("heading", root.key);
	heading.style = { desktop: { color: "#111" } };
	const text = createNode("text", heading.key);
	heading.children = [text];
	root.children = [heading];
	return [root];
}

describe("cloneSubtreeWithMap", () => {
	it("gives every node a fresh key and maps old to new", () => {
		const tree = nested();
		const originalKeys = allKeys(tree);
		const { nodes, keyMap } = cloneSubtreeWithMap(tree, null);

		// One entry per node, and the map covers every original key.
		expect(keyMap.size).toBe(originalKeys.length);
		for (const key of originalKeys) expect(keyMap.has(key)).toBe(true);

		// No clone reuses an original key.
		const cloneKeys = allKeys(nodes);
		for (const key of cloneKeys) expect(originalKeys.includes(key)).toBe(false);
		// And no clone key repeats within itself.
		expect(new Set(cloneKeys).size).toBe(cloneKeys.length);
	});

	it("preserves depth and rewires parent pointers to the new keys", () => {
		const tree = nested();
		const { nodes, keyMap } = cloneSubtreeWithMap(tree, null);
		const root = nodes[0]!;
		const heading = root.children[0]!;
		const text = heading.children[0]!;

		expect(root.type).toBe("container");
		expect(heading.type).toBe("heading");
		expect(text.type).toBe("text");

		expect(root.parent).toBeNull();
		expect(heading.parent).toBe(root.key);
		expect(text.parent).toBe(heading.key);

		// The root maps to the original root's clone.
		expect(root.key).toBe(keyMap.get(tree[0]!.key));
	});

	it("keeps styles and props on the copy", () => {
		const tree = nested();
		const { nodes } = cloneSubtreeWithMap(tree, null);
		expect(nodes[0]!.children[0]!.style).toEqual({ desktop: { color: "#111" } });
	});

	it("hangs the clones from the given parent", () => {
		const tree = [createNode("container", null)];
		const { nodes } = cloneSubtreeWithMap(tree, "destination");
		expect(nodes[0]!.parent).toBe("destination");
	});

	it("returns an empty result for an empty subtree", () => {
		const { nodes, keyMap } = cloneSubtreeWithMap([], null);
		expect(nodes).toEqual([]);
		expect(keyMap.size).toBe(0);
	});
});

describe("template copy round trip", () => {
	it("rebuilds hierarchy from builder_layout and clones without collisions", () => {
		// Exactly the stored shape a builder template writes.
		const layout = [
			{ _type: "builder_container", _version: 1, _key: "c1", gap: "md", direction: "column" },
			{ _type: "builder_heading", _version: 1, _key: "h1", parent_key: "c1", text: "Build faster", level: "h2" },
			{ _type: "builder_button", _version: 1, _key: "b1", parent_key: "c1", label: "Get started", url: "/pricing" },
		] as unknown as StoredBlock[];
		const styles = {
			c1: { desktop: { margin: { t: "40px" } } },
			h1: { desktop: { color: "#111" } },
		};

		const { tree: source } = deserializeEntry(layout, styles);

		// The container holds its two children, not a flat list.
		expect(source).toHaveLength(1);
		expect(source[0]!.type).toBe("container");
		expect(source[0]!.children).toHaveLength(2);
		expect(source[0]!.children.map((child) => child.type).sort()).toEqual(["button", "heading"]);

		// Styles landed on the right nodes.
		expect(source[0]!.style.desktop?.margin?.t).toBe("40px");
		expect(findNode(source, "h1")!.style.desktop?.color).toBe("#111");

		// The copy: fresh keys, same shape, styles carried across.
		const { nodes, keyMap } = cloneSubtreeWithMap(source, null);
		expect(keyMap.size).toBe(3);
		expect(nodes[0]!.key).not.toBe("c1");
		expect(nodes[0]!.children).toHaveLength(2);
		for (const child of nodes[0]!.children) expect(child.parent).toBe(nodes[0]!.key);

		const copiedHeading = nodes[0]!.children.find((child) => child.type === "heading")!;
		expect(copiedHeading.style.desktop?.color).toBe("#111");
		expect(keyMap.get("h1")).toBe(copiedHeading.key);
	});

	it("skips public fields the widget does not declare", () => {
		// A forged template cannot smuggle an arbitrary node type or field.
		const layout = [
			{ _type: "builder_gone", _version: 1, _key: "x1" },
			{ _type: "builder_text", _version: 1, _key: "t1", invented: "no" },
		] as unknown as StoredBlock[];

		const { tree } = deserializeEntry(layout, {});
		expect(allKeys(tree)).toEqual(["t1"]);
		walk(tree, (node) => expect("invented" in node.props).toBe(false));
	});
});
