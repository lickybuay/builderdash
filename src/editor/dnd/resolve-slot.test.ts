/**
 * Tests for drop-slot resolution.
 *
 * `resolveSlot` decides where a dropped container lands, so it is tested with a
 * synthetic DOM rather than in the browser. The geometry it depends on is
 * simple on purpose: children stacked along the vertical axis, compared by
 * midpoint.
 *
 * Run: pnpm test
 */

import { beforeEach, describe, expect, it } from "vitest";

import { resolveSlot } from "./index";

/**
 * Builds a container whose children report a known geometry.
 *
 * jsdom has no layout engine, so `getBoundingClientRect` always returns zeros.
 * Stubbing it per child keeps the test focused on the resolution logic instead
 * of on the browser.
 */
function buildContainer(heights: number[]): HTMLElement {
	const container = document.createElement("div");

	let top = 0;
	for (const height of heights) {
		const child = document.createElement("div");
		child.setAttribute("data-bd-child", "");
		const childTop = top;
		child.getBoundingClientRect = () =>
			({ top: childTop, height, bottom: childTop + height }) as DOMRect;
		container.appendChild(child);
		top += height;
	}

	return container;
}

describe("resolveSlot", () => {
	let container: HTMLElement;

	// Three rows of 100px: boundaries at 0, 100 and 200, append at 300.
	beforeEach(() => {
		container = buildContainer([100, 100, 100]);
	});

	it("resolves slot 0 when the pointer is above the first midpoint", () => {
		expect(resolveSlot(container, 10)).toBe(0);
		expect(resolveSlot(container, 49)).toBe(0);
	});

	it("moves to the next slot once the pointer crosses a midpoint", () => {
		// The first child spans 0-100, so its midpoint is 50.
		expect(resolveSlot(container, 50)).toBe(1);
		expect(resolveSlot(container, 99)).toBe(1);
	});

	it("resolves each boundary as the pointer walks down", () => {
		expect(resolveSlot(container, 150)).toBe(2);
		expect(resolveSlot(container, 250)).toBe(3);
	});

	it("appends past the last child", () => {
		expect(resolveSlot(container, 300)).toBe(3);
		expect(resolveSlot(container, 9999)).toBe(3);
	});

	it("returns 0 on an empty container", () => {
		const empty = buildContainer([]);
		expect(resolveSlot(empty, 0)).toBe(0);
		expect(resolveSlot(empty, 500)).toBe(0);
	});

	it("skips children with no height", () => {
		const withEmpty = buildContainer([100, 0, 100]);
		expect(resolveSlot(withEmpty, 10)).toBe(0);
		expect(resolveSlot(withEmpty, 200)).toBe(3);
	});

	it("ignores elements that are not marked as children", () => {
		const stray = document.createElement("div");
		stray.getBoundingClientRect = () => ({ top: 0, height: 500, bottom: 500 }) as DOMRect;
		container.appendChild(stray);

		// The stray element is a direct child but carries no marker, so it must
		// not create a slot boundary of its own.
		expect(resolveSlot(container, 250)).toBe(3);
	});

	it("appends when the children report no usable geometry", () => {
		// A rect that returns nothing must not invent a boundary.
		const flat = document.createElement("div");
		const child = document.createElement("div");
		child.setAttribute("data-bd-child", "");
		child.getBoundingClientRect = () => ({}) as DOMRect;
		flat.appendChild(child);

		expect(resolveSlot(flat, 0)).toBe(1);
	});
});
