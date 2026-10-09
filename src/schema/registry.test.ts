/**
 * Tests for the widget registry's template reference.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { canContain, defaultProps } from "./registry";

describe("template_ref widget", () => {
	it("starts with an empty ref_id, not a label", () => {
		expect(defaultProps("template_ref").ref_id).toBe("");
	});

	it("is not a container", () => {
		expect(canContain("template_ref", "heading")).toBe(false);
	});
});
