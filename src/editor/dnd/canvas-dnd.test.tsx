/**
 * Integration tests for the canvas and its drag & drop contract.
 *
 * These mount the real canvas and inspect the DOM it produces.
 *
 * Two properties are load-bearing and both were bugs once:
 *
 * 1. **One drop zone per container.** Per-slot zones nest inside each other, so
 *    `dragover` fires on several containers at once and the highlight depends on
 *    DOM order.
 * 2. **The canvas runs its own React root inside the shadow root.** Rendering it
 *    through a portal keeps React's event delegation outside the boundary, where
 *    shadow retargeting hides the inner node. Handlers then never fire and the
 *    drop silently does nothing.
 *
 * The second one cannot be asserted through React Testing Library, which mounts
 * outside the shadow tree. It is asserted directly on the DOM that the real
 * component produces.
 *
 * Run: pnpm test
 */

import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Canvas } from "../canvas/Canvas";
import { resetDragStore, resolveSlot } from "./index";
import { createNode, type BuilderTree } from "../store/tree";

afterEach(() => {
	cleanup();
	resetDragStore();
});

/** Gives every measurable child a synthetic box, stacked down the page. */
function stackChildren(zone: HTMLElement, height = 100): void {
	let top = 0;
	for (const child of Array.from(zone.children)) {
		if (!child.hasAttribute("data-bd-child")) continue;
		const childTop = top;
		(child as HTMLElement).getBoundingClientRect = () =>
			({
				top: childTop,
				bottom: childTop + height,
				height,
				left: 0,
				right: 800,
				width: 800,
				x: 0,
				y: childTop,
				toJSON: () => ({}),
			}) as DOMRect;
		top += height;
	}
}

function canvasRoot(): ShadowRoot {
	const host = document.querySelector("[data-breakpoint]") as HTMLElement & {
		shadowRoot: ShadowRoot;
	};
	return host.shadowRoot;
}

/** Waits for the canvas' inner React root to commit. */
async function mountCanvas(tree: BuilderTree) {
	const view = render(
		<Canvas
			tree={tree}
			breakpoint="desktop"
			selectedKey={null}
			onSelect={() => {}}
			onDropPayload={() => {}}
			onMove={()=>false}
		/>,
	);
	// The shadow tree is rendered imperatively by the component's effect.
	await act(async () => {});
	return view;
}

/** Two containers at the root, the first holding a nested one. */
function nestedTree(): BuilderTree {
	const outer = createNode("container", null);
	const nested = createNode("container", outer.key);
	outer.children = [nested];
	const sibling = createNode("container", null);
	return [outer, sibling];
}

describe("canvas structure", () => {
	it("renders one drop zone per container, not one per slot", async () => {
		await mountCanvas(nestedTree());
		const root = canvasRoot();

		// Root + outer + nested + sibling = 4.
		const zones = root.querySelectorAll("[data-bd-dropzone]");
		expect(zones).toHaveLength(4);
		expect(zones[0]!.getAttribute("data-bd-dropzone")).toBe("root");
	});

	it("marks every direct child so the resolver can measure them", async () => {
		await mountCanvas(nestedTree());
		const root = canvasRoot();

		const rootZone = root.querySelector('[data-bd-dropzone="root"]') as HTMLElement;
		const marked = Array.from(rootZone.children).filter((child) =>
			child.hasAttribute("data-bd-child"),
		);
		expect(marked).toHaveLength(2);
	});

	it("nests a container inside another", async () => {
		const tree = nestedTree();
		await mountCanvas(tree);
		const root = canvasRoot();

		const outerKey = tree[0]!.key;
		const nestedKey = tree[0]!.children[0]!.key;
		const outerZone = root.querySelector(`[data-bd-dropzone="${outerKey}"]`) as HTMLElement;

		expect(outerZone.querySelector(`[data-bd-dropzone="${nestedKey}"]`)).not.toBeNull();
	});

	it("renders the empty state when the tree has no containers", async () => {
		await mountCanvas([]);
		const root = canvasRoot();
		expect(root.querySelector('[data-bd-dropzone="root"]')).not.toBeNull();
		expect(root.querySelectorAll(".bd-empty-slot").length).toBeGreaterThan(0);
	});

	it("renders no insertion line while no drag is active", async () => {
		await mountCanvas(nestedTree());
		const root = canvasRoot();
		expect(root.querySelectorAll(".bd-drop-line")).toHaveLength(0);
	});

	it("lets resolveSlot see the children of a rendered zone", async () => {
		// Regression guard: the first version used a `:scope >` selector, which
		// returns nothing inside a ShadowRoot. The slot then never advanced and
		// every drop landed at the same index.
		await mountCanvas(nestedTree());
		const root = canvasRoot();

		const zone = root.querySelector('[data-bd-dropzone="root"]') as HTMLElement;
		stackChildren(zone);

		expect(resolveSlot(zone, 10)).toBe(0);
		expect(resolveSlot(zone, 60)).toBe(1);
		expect(resolveSlot(zone, 500)).toBe(2);
	});
});

describe("shadow DOM event handling", () => {
	it("renders the canvas inside a shadow root", async () => {
		await mountCanvas(nestedTree());
		const host = document.querySelector("[data-breakpoint]") as HTMLElement;
		expect(host.shadowRoot).not.toBeNull();
		expect(canvasRoot().querySelectorAll("[data-bd-dropzone]").length).toBeGreaterThan(0);
	});

	it("keeps a React root inside the shadow root, not a portal from outside", async () => {
		// The distinguishing signal: React writes `__reactContainer$...` on the
		// node it mounted into. If the canvas were rendered through a portal, the
		// mark would live only on the outer admin container and no event handler
		// inside the shadow would ever fire.
		await mountCanvas(nestedTree());
		const root = canvasRoot();
		const mount = root.querySelector("[data-bd-root]") as HTMLElement;

		const reactKeys = Object.keys(mount).filter((key) => key.startsWith("__react"));
		expect(reactKeys.length).toBeGreaterThan(0);
	});

	it("does not require context from the outer tree", async () => {
		// The palette lives in the outer React tree and the canvas in the inner
		// one, so anything shared has to go through the module-scoped store.
		// Rendering the canvas with no provider above it must still work.
		await mountCanvas(nestedTree());
		const zone = canvasRoot().querySelector('[data-bd-dropzone="root"]') as HTMLElement;
		expect(zone).not.toBeNull();
	});
});
