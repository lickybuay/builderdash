/**
 * Tests for keeping the floating Structure panel reachable.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { clampPosition } from "./FloatingPanel";

const area = { width: 1000, height: 600 };
const panel = { width: 256 };

describe("clampPosition", () => {
	it("leaves a position inside the canvas alone", () => {
		expect(clampPosition({ x: 100, y: 50 }, panel, area)).toEqual({ x: 100, y: 50 });
	});

	it("pulls a panel back when the canvas shrinks", () => {
		expect(clampPosition({ x: 900, y: 50 }, panel, area)).toEqual({ x: 744, y: 50 });
	});

	it("keeps the header on screen at the bottom and never goes negative", () => {
		expect(clampPosition({ x: -40, y: 5000 }, panel, area)).toEqual({ x: 0, y: 560 });
	});

	it("pins to the corner when the canvas is narrower than the panel", () => {
		expect(clampPosition({ x: 50, y: 10 }, panel, { width: 200, height: 20 })).toEqual({ x: 0, y: 0 });
	});
});
