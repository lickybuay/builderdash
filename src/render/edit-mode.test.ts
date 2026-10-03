/**
 * Tests for the `?_builder` gate.
 *
 * The edit-mode flag must never be on for an anonymous request, no matter the
 * query string, and must stay on for the builder's own iframe (a signed-in
 * editor with `?_builder`).
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { builderEditRequested, builderEditMode } from "./edit-mode";

function astro(url: string, user: unknown = undefined) {
	return { locals: { user }, url: new URL(url, "http://localhost:4321") };
}

describe("builderEditRequested", () => {
	it("reads the query alone", () => {
		expect(builderEditRequested(astro("/test-page?_builder=1"))).toBe(true);
		expect(builderEditRequested(astro("/test-page"))).toBe(false);
	});
});

describe("builderEditMode", () => {
	it("is off for anonymous requests, even with the parameter", () => {
		expect(builderEditMode(astro("/test-page?_builder=1"))).toBe(false);
		expect(builderEditMode(astro("/test-page?_builder=1", null))).toBe(false);
	});

	it("is off for a signed-in user without the parameter", () => {
		expect(builderEditMode(astro("/test-page", { id: "u1" }))).toBe(false);
	});

	it("is on for a signed-in editor with the parameter", () => {
		expect(builderEditMode(astro("/test-page?_builder=1", { id: "u1" }))).toBe(true);
	});

	it("survives a route with no locals yet", () => {
		const bare = { locals: {}, url: new URL("http://localhost:4321/test-page?_builder=1") };
		expect(builderEditMode(bare)).toBe(false);
	});
});
