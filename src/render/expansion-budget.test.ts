/**
 * Tests for the per-render template expansion budget.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { MAX_TEMPLATE_EXPANSIONS, newExpansionBudget } from "./parts";

describe("newExpansionBudget", () => {
	it("starts at the maximum", () => {
		expect(MAX_TEMPLATE_EXPANSIONS).toBe(50);
		expect(newExpansionBudget().left).toBe(MAX_TEMPLATE_EXPANSIONS);
	});

	it("returns a fresh object each call", () => {
		const a = newExpansionBudget();
		a.left -= 10;
		const b = newExpansionBudget();
		expect(b).not.toBe(a);
		expect(b.left).toBe(MAX_TEMPLATE_EXPANSIONS);
	});
});
