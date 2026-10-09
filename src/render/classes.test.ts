/**
 * Tests for the body classes of an entry.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { bodyClasses } from "./classes";

describe("bodyClasses", () => {
	it("returns no classes without an entry", () => {
		expect(bodyClasses(undefined)).toEqual([]);
		expect(bodyClasses(null)).toEqual([]);
	});

	it("returns no classes for a missing or empty id", () => {
		expect(bodyClasses({ collection: "pages" })).toEqual([]);
		expect(bodyClasses({ collection: "pages", id: "" })).toEqual([]);
	});

	it("names the entry as <singular>-<id>", () => {
		expect(bodyClasses({ collection: "pages", id: "01M3ABC" })).toEqual(["page-01M3ABC"]);
	});
});
