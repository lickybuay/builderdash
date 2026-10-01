/**
 * Tests for the data cycle.
 *
 * The serialization step is the only one that cannot be validated on screen.
 * These tests are the real definition of done for the skeleton: if the tree
 * does not round-trip through storage, nothing built on top of it is worth
 * anything.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import {
	allKeys,
	countNodes,
	createContainer,
	createNode,
	duplicateNode,
	findNode,
	insertNode,
	isDescendantOf,
	moveNode,
	removeNode,
	updateNodeStyle,
	type BuilderNode,
	type BuilderTree,
} from "./tree";
import { deserializeEntry, serializeTree, validateTree } from "./serialize";
import { PARENT_FIELD } from "../../schema/registry";

/** Builds a sample tree: a container holding two nested containers. */
function sample(): BuilderTree {
	const container = createContainer(0);
	const [first, second] = [createNode("container", container.key), createNode("container", container.key)];
	container.children = [first, second];
	return [container];
}

describe("tree operations", () => {
	it("creates a container with the requested children", () => {
		const tree = [createContainer(3)];
		expect(tree[0]!.children).toHaveLength(3);
		expect(validateTree(tree)).toHaveLength(0);
	});

	it("inserts a node into the given container and sets its parent", () => {
		const tree = sample();
		const parent = tree[0]!;
		const nested = createNode("container");
		const next = insertNode(tree, nested, parent.key);

		const inserted = findNode(next, nested.key);
		expect(inserted).not.toBeNull();
		expect(inserted!.parent).toBe(parent.key);
		expect(findNode(next, parent.key)!.children).toHaveLength(3);
	});

	it("appends when no index is given", () => {
		const tree = sample();
		const parent = tree[0]!;
		const nested = createNode("container");
		const next = insertNode(tree, nested, parent.key);

		const children = findNode(next, parent.key)!.children;
		expect(children[children.length - 1]!.key).toBe(nested.key);
	});

	it("moves a node between containers keeping its styles", () => {
		const tree = sample();
		const parent = tree[0]!;
		const moved = parent.children[0]!;
		const target = parent.children[1]!;

		const styled = updateNodeStyle(tree, moved.key, {
			desktop: { typography: { size: "48" } },
		});

		const next = moveNode(styled, moved.key, target.key);
		const node = findNode(next, moved.key)!;

		expect(node.parent).toBe(target.key);
		expect(node.style).toEqual({ desktop: { typography: { size: "48" } } });
		expect(findNode(next, parent.key)!.children).toHaveLength(1);
	});

	it("reorders within the same parent using insertion slots", () => {
		const parent = createContainer(4);
		const tree: BuilderTree = [parent];
		const keys = parent.children.map((child) => child.key);

		// `index` is the slot where the user drops, from 0 to `children.length`,
		// resolved against the corrected list.
		const order = (t: BuilderTree) => findNode(t, parent.key)!.children.map((c) => c.key);

		// Final slot: the first child becomes the last.
		expect(order(moveNode(tree, keys[0]!, parent.key, 4))).toEqual([
			keys[1],
			keys[2],
			keys[3],
			keys[0],
		]);

		// Initial slot: the last child becomes the first.
		expect(order(moveNode(tree, keys[3]!, parent.key, 0))).toEqual([
			keys[3],
			keys[0],
			keys[1],
			keys[2],
		]);

		// #2 moves up to slot 1.
		expect(order(moveNode(tree, keys[2]!, parent.key, 1))).toEqual([
			keys[0],
			keys[2],
			keys[1],
			keys[3],
		]);
	});

	it("blocks dropping a container inside itself", () => {
		const tree = sample();
		const outer = tree[0]!;
		const inner = outer.children[0]!;

		expect(isDescendantOf(tree, inner.key, outer.key)).toBe(true);
		const next = moveNode(tree, outer.key, inner.key);
		expect(next).toBe(tree);
	});

	it("removes a node and all its descendants", () => {
		const tree = sample();
		const outer = tree[0]!;
		const removed = removeNode(tree, outer.key);

		expect(removed.tree).toHaveLength(0);
		expect(removed.removedKeys).toHaveLength(countNodes(tree));
	});

	it("duplicates a subtree with fresh keys", () => {
		const tree = sample();
		const outer = tree[0]!;
		const { tree: next, newKey } = duplicateNode(tree, outer.key);

		expect(newKey).toBeTruthy();
		expect(newKey).not.toBe(outer.key);
		expect(next).toHaveLength(2);

		const clone = findNode(next, newKey!)!;
		expect(clone.children).toHaveLength(outer.children.length);
		// No key in the clone collides with the original.
		const original = new Set(allKeys([outer]));
		for (const key of allKeys([clone])) {
			expect(original.has(key)).toBe(false);
		}
	});
});

describe("serialization", () => {
	it("produces a flat array in render order with the parent field set", () => {
		const { blocks } = serializeTree(sample());

		expect(blocks.map((block) => block._type)).toEqual([
			"builder_container",
			"builder_container",
			"builder_container",
		]);
		// The parent pointer is a declared field, not a `_parent` convention:
		// EmDash rejects unknown keys on a stored block.
		expect(blocks[0]![PARENT_FIELD]).toBeUndefined();
		expect(blocks[1]![PARENT_FIELD]).toBe(blocks[0]!._key);
		expect(blocks[2]![PARENT_FIELD]).toBe(blocks[0]!._key);
	});

	it("rebuilds the tree losslessly (round trip)", () => {
		const tree = sample();
		const { blocks, styles } = serializeTree(tree);
		const { tree: restored } = deserializeEntry(blocks, styles);

		expect(flatShape(restored)).toEqual(flatShape(tree));
		expect(validateTree(restored)).toHaveLength(0);
	});

	it("keeps styles keyed by _key across the full cycle", () => {
		const tree = sample();
		const key = tree[0]!.children[0]!.key;

		const styled = updateNodeStyle(tree, key, {
			desktop: { typography: { size: "48", weight: "700" } },
			mobile: { typography: { size: "28" } },
		});

		const { blocks, styles } = serializeTree(styled);
		const { tree: restored } = deserializeEntry(blocks, styles);

		expect(findNode(restored, key)!.style).toEqual({
			desktop: { typography: { size: "48", weight: "700" } },
			mobile: { typography: { size: "28" } },
		});
	});

	it("moving a node does not alter its styles", () => {
		const tree = sample();
		const parent = tree[0]!;
		const moved = parent.children[0]!;
		const target = parent.children[1]!;

		const styled = updateNodeStyle(tree, moved.key, { desktop: { color: "#111" } });
		const next = moveNode(styled, moved.key, target.key);

		const { blocks, styles } = serializeTree(next);
		expect(styles[moved.key]).toEqual({ desktop: { color: "#111" } });

		const { tree: restored } = deserializeEntry(blocks, styles);
		expect(findNode(restored, moved.key)!.style).toEqual({ desktop: { color: "#111" } });
	});

	it("keeps orphan styles that have no block", () => {
		const { blocks } = serializeTree(sample());
		const orphans = { key_without_block: { desktop: { color: "#f00" } } };

		const { styles } = serializeTree(sample(), orphans);
		expect(styles["key_without_block"]).toEqual({ desktop: { color: "#f00" } });

		// And they survive deserialization as orphans, ready to be written back.
		const { orphanStyles } = deserializeEntry(blocks, styles);
		expect(orphanStyles["key_without_block"]).toEqual({ desktop: { color: "#f00" } });
	});

	it("skips unknown block types but keeps their styles", () => {
		const { blocks, styles } = serializeTree(sample());
		const withUnknown = [...blocks, { _type: "builder_gone", _version: 1, _key: "x1" }];

		const { tree, orphanStyles } = deserializeEntry(withUnknown, {
			...styles,
			x1: { desktop: { color: "#0f0" } },
		});

		expect(allKeys(tree).includes("x1")).toBe(false);
		expect(orphanStyles["x1"]).toEqual({ desktop: { color: "#0f0" } });
	});

	it("only writes declared widget fields into the block", () => {
		const node: BuilderNode = createNode("container");
		node.props = { gap: "lg", inventedProp: "must not be saved" };
		const { blocks } = serializeTree([node]);

		expect(blocks[0]!["gap"]).toBe("lg");
		expect("inventedProp" in blocks[0]!).toBe(false);
	});

	it("tolerates empty or malformed input", () => {
		expect(deserializeEntry(null, null).tree).toEqual([]);
		expect(deserializeEntry(undefined, undefined).tree).toEqual([]);
		expect(deserializeEntry([], {}).tree).toEqual([]);
	});
});

/** Comparative tree shape: type and nesting depth. */
function flatShape(tree: BuilderTree): unknown {
	const out: unknown[] = [];
	const visit = (nodes: BuilderTree, depth: number): void => {
		for (const node of nodes) {
			out.push({ type: node.type, depth });
			visit(node.children, depth + 1);
		}
	};
	visit(tree, 0);
	return out;
}
