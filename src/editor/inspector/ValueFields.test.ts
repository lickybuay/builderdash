/**
 * Pure helpers of the Inspector's value fields.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { pickerHex, splitLength, tokensOf } from "./ValueFields";

describe("pickerHex", () => {
	it("expands #rgb and lowercases", () => {
		expect(pickerHex("#abc")).toBe("#aabbcc");
		expect(pickerHex("#AABBCC")).toBe("#aabbcc");
		expect(pickerHex("  #ABC ")).toBe("#aabbcc");
	});

	it("returns null for anything the native picker cannot show", () => {
		expect(pickerHex("rgba(0,0,0,.5)")).toBeNull();
		expect(pickerHex("var(--color-brand)")).toBeNull();
		expect(pickerHex("#aabbccdd")).toBeNull();
		expect(pickerHex("#abcd")).toBeNull();
		expect(pickerHex(undefined)).toBeNull();
		expect(pickerHex("")).toBeNull();
	});
});

describe("splitLength", () => {
	it("splits a number and its unit", () => {
		expect(splitLength("24px")).toEqual({ num: "24", unit: "px" });
		expect(splitLength("1.5rem")).toEqual({ num: "1.5", unit: "rem" });
		expect(splitLength("-4%")).toEqual({ num: "-4", unit: "%" });
		expect(splitLength(" 10vh ")).toEqual({ num: "10", unit: "vh" });
	});

	it("gives a bare number no unit", () => {
		expect(splitLength("20")).toEqual({ num: "20", unit: null });
	});

	it("returns null for tokens, keywords, expressions and empties", () => {
		expect(splitLength("var(--spacing-lg)")).toBeNull();
		expect(splitLength("auto")).toBeNull();
		expect(splitLength("calc(1px + 2px)")).toBeNull();
		expect(splitLength("10pt")).toBeNull();
		expect(splitLength(undefined)).toBeNull();
		expect(splitLength("")).toBeNull();
	});
});

describe("tokensOf", () => {
	const tokens = [
		"--color-brand",
		"--spacing-lg",
		"--space-2",
		"--max-width",
		"--font-size-lg",
		"--font-weight-display",
		"--line-height-tight",
		"--leading-loose",
		"--radius",
		"--radius-lg",
		"--shadow-sm",
		"--gradient-brand",
	];

	it("keeps only the tokens of the kind", () => {
		expect(tokensOf(tokens, "color")).toEqual(["--color-brand"]);
		expect(tokensOf(tokens, "space")).toEqual(["--spacing-lg", "--space-2", "--max-width"]);
		expect(tokensOf(tokens, "fontSize")).toEqual(["--font-size-lg"]);
		expect(tokensOf(tokens, "fontWeight")).toEqual(["--font-weight-display"]);
		expect(tokensOf(tokens, "lineHeight")).toEqual(["--line-height-tight", "--leading-loose"]);
		expect(tokensOf(tokens, "radius")).toEqual(["--radius", "--radius-lg"]);
		expect(tokensOf(tokens, "shadow")).toEqual(["--shadow-sm"]);
	});

	it("returns an empty list when nothing matches", () => {
		expect(tokensOf([], "color")).toEqual([]);
		expect(tokensOf(["--gradient-brand"], "color")).toEqual([]);
	});
});
