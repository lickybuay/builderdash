/**
 * Tests for the template-parts resolver.
 *
 * A template declares its slot in `display_target`. The resolver picks the
 * template for each slot deterministically, so the site chrome is a pure
 * function of the stored templates.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { isSlotTarget, resolveTemplateParts, type TemplatePartInput } from "./parts";

function part(over: Partial<TemplatePartInput> & { id: string }): TemplatePartInput {
	return {
		displayTarget: "anywhere",
		updatedAt: "2026-01-01T00:00:00.000Z",
		layout: [{ _type: "builder_container", _version: 1, _key: "k" }],
		styles: {},
		...over,
	};
}

describe("isSlotTarget", () => {
	it("accepts the three slots", () => {
		expect(isSlotTarget("header")).toBe(true);
		expect(isSlotTarget("footer")).toBe(true);
		expect(isSlotTarget("sidebar")).toBe(true);
	});

	it("rejects everything else", () => {
		expect(isSlotTarget("anywhere")).toBe(false);
		expect(isSlotTarget("page_content")).toBe(false);
		expect(isSlotTarget(undefined)).toBe(false);
		expect(isSlotTarget(null)).toBe(false);
	});
});

describe("resolveTemplateParts", () => {
	it("assigns a template to its declared slot", () => {
		const out = resolveTemplateParts([
			part({ id: "h1", displayTarget: "header", updatedAt: "2026-01-01T00:00:00.000Z" }),
		]);
		expect(out.header?.id).toBe("h1");
		expect(out.footer).toBeUndefined();
	});

	it("ignores ordinary templates and empty layouts", () => {
		const out = resolveTemplateParts([
			part({ id: "a", displayTarget: "anywhere" }),
			part({ id: "b", displayTarget: "page_content" }),
			part({ id: "c", displayTarget: "header", layout: [] }),
		]);
		expect(out.header).toBeUndefined();
	});

	it("lets the most recently updated template win a contested slot", () => {
		const out = resolveTemplateParts([
			part({ id: "old", displayTarget: "footer", updatedAt: "2026-01-01T00:00:00.000Z" }),
			part({ id: "new", displayTarget: "footer", updatedAt: "2026-06-01T00:00:00.000Z" }),
		]);
		expect(out.footer?.id).toBe("new");
	});

	it("breaks a timestamp tie by id, independent of input order", () => {
		const a = part({ id: "aaa", displayTarget: "header", updatedAt: "2026-01-01T00:00:00.000Z" });
		const b = part({ id: "bbb", displayTarget: "header", updatedAt: "2026-01-01T00:00:00.000Z" });
		expect(resolveTemplateParts([a, b]).header?.id).toBe("bbb");
		expect(resolveTemplateParts([b, a]).header?.id).toBe("bbb");
	});

	it("returns an empty result for no inputs", () => {
		expect(resolveTemplateParts([])).toEqual({});
	});
});
