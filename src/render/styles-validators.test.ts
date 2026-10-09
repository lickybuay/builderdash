/**
 * Tests for the CSS value validators and the safety rules of `generateCss`.
 *
 * Each validator returns the CSS to write or `null` when the value must be
 * dropped; the stylesheet lands inside a <style>, so what is rejected here is
 * what keeps editor-supplied JSON from becoming CSS injection.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { createNode, type BuilderNode } from "../editor/store/tree";
import {
	cssColor,
	cssExpression,
	cssLength,
	cssLineHeight,
	cssShadow,
	cssWeight,
	cssZIndex,
	generateCss,
} from "./styles";

function container(style: BuilderNode["style"] = {}): BuilderNode {
	const node = createNode("container", null);
	node.style = style;
	return node;
}

describe("cssExpression", () => {
	it.each([
		"calc(100% - 20px)",
		"calc( 100%  -  20px )",
		"min(50vw, 400px)",
		"max(1rem, 2vw)",
		"clamp(1rem, 2.5vw, 3rem)",
		"calc(var(--spacing-lg) * 2)",
		"calc(100% - min(10px, 2vw))",
	])("accepts %s", (value) => {
		expect(cssExpression(value)).toBe(value);
	});

	it.each([
		["url()", "calc(url(x))"],
		["expression()", "calc(expression(alert(1)))"],
		["attr()", "calc(attr(data-x))"],
		["a var fallback", "calc(var(--a, 1px))"],
		["a comment opener", "calc(1px)/*"],
		["a comment closer", "calc(1px */ 2px)"],
		["trailing text", "calc(1px) url"],
		["two calls", "calc(1px) calc(2px)"],
		["an unclosed paren", "calc(1px"],
		["an extra closing paren", "calc(1px))"],
		["a semicolon", "calc(1px);color:red"],
		["a function that is not an expression", "var(--x)"],
		["plain text", "100px"],
	])("rejects %s", (_name, value) => {
		expect(cssExpression(value)).toBeNull();
	});

	it("rejects more than 200 characters", () => {
		const long = `calc(${"1px + ".repeat(40)}1px)`;
		expect(long.length).toBeGreaterThan(200);
		expect(cssExpression(long)).toBeNull();
	});

	it("rejects non-strings", () => {
		expect(cssExpression(12)).toBeNull();
		expect(cssExpression(undefined)).toBeNull();
	});
});

describe("cssLength", () => {
	it("reads a bare number as pixels and keeps 0 as 0", () => {
		expect(cssLength("20")).toBe("20px");
		expect(cssLength("1.5")).toBe("1.5px");
		expect(cssLength("0")).toBe("0");
		expect(cssLength("2rem")).toBe("2rem");
	});

	it("accepts keywords, tokens and expressions", () => {
		expect(cssLength("auto")).toBe("auto");
		expect(cssLength("fit-content")).toBe("fit-content");
		expect(cssLength("var(--spacing-lg)")).toBe("var(--spacing-lg)");
		expect(cssLength("calc(100% - 2rem)")).toBe("calc(100% - 2rem)");
	});

	it("allows negatives unless negative is false", () => {
		expect(cssLength("-4px")).toBe("-4px");
		expect(cssLength("-4px", { negative: false })).toBeNull();
		expect(cssLength("4px", { negative: false })).toBe("4px");
	});

	it("rejects anything else", () => {
		expect(cssLength("url(x)")).toBeNull();
		expect(cssLength("10px; color:red")).toBeNull();
		expect(cssLength("var(--a, 1px)")).toBeNull();
		expect(cssLength("10 px")).toBeNull();
		expect(cssLength(10)).toBeNull();
	});
});

describe("cssColor", () => {
	it.each([
		"#abc",
		"#abcd",
		"#aabbcc",
		"#aabbccdd",
		"rgb(0,0,0)",
		"rgba(0, 0, 0, 0.5)",
		"rgb(0 0 0 / 50%)",
		"hsl(200, 50%, 50%)",
		"hsla(200 50% 50% / .3)",
		"transparent",
		"currentColor",
		"var(--color-brand)",
	])("accepts %s", (value) => {
		expect(cssColor(value)).toBe(value);
	});

	it.each(["red", "red;position:fixed", "#ggg", "url(x)", "var(--a, red)", "rgb(0,0,0);", 5])(
		"rejects %s",
		(value) => {
			expect(cssColor(value)).toBeNull();
		},
	);
});

describe("cssWeight", () => {
	it("accepts 100 to 900, normal, bold and tokens", () => {
		for (const value of ["100", "400", "900", "normal", "bold", "var(--font-weight-display)"]) {
			expect(cssWeight(value)).toBe(value);
		}
	});

	it("rejects other values", () => {
		for (const value of ["0", "1000", "450", "bolder", "700;x", 700]) expect(cssWeight(value)).toBeNull();
	});
});

describe("cssLineHeight", () => {
	it("accepts numbers, lengths, normal and tokens", () => {
		expect(cssLineHeight("1.5")).toBe("1.5");
		expect(cssLineHeight("24px")).toBe("24px");
		expect(cssLineHeight("normal")).toBe("normal");
		expect(cssLineHeight("var(--line-height-tight)")).toBe("var(--line-height-tight)");
	});

	it("rejects auto and negatives", () => {
		expect(cssLineHeight("auto")).toBeNull();
		expect(cssLineHeight("-1")).toBeNull();
		expect(cssLineHeight("-10px")).toBeNull();
	});
});

describe("cssZIndex", () => {
	it("accepts integers, negatives included", () => {
		expect(cssZIndex("3")).toBe("3");
		expect(cssZIndex("-2")).toBe("-2");
		expect(cssZIndex("0")).toBe("0");
	});

	it("rejects decimals, words and non-strings", () => {
		expect(cssZIndex("1.5")).toBeNull();
		expect(cssZIndex("auto")).toBeNull();
		expect(cssZIndex("1; x")).toBeNull();
		expect(cssZIndex(3)).toBeNull();
	});
});

describe("cssShadow", () => {
	it("accepts none and tokens", () => {
		expect(cssShadow("none")).toBe("none");
		expect(cssShadow("var(--shadow-lg)")).toBe("var(--shadow-lg)");
	});

	it("accepts single and multi-layer shadows, with colors that contain spaces", () => {
		expect(cssShadow("0 4px 8px #00000033")).toBe("0 4px 8px #00000033");
		expect(cssShadow("0 0 4px rgba(0, 0, 0, 0.5)")).toBe("0 0 4px rgba(0, 0, 0, 0.5)");
		expect(cssShadow("inset 0 1px 2px 1px #fff")).toBe("inset 0 1px 2px 1px #fff");
		expect(cssShadow("0 1px 2px #000, 0 4px 8px rgba(0, 0, 0, 0.2)")).toBe(
			"0 1px 2px #000, 0 4px 8px rgba(0, 0, 0, 0.2)",
		);
	});

	it("rejects comment injection", () => {
		expect(cssShadow("0 0 /* x */ 1px")).toBeNull();
		expect(cssShadow("0 0 1px */")).toBeNull();
	});

	it("rejects more than one color per layer, or fewer than two lengths", () => {
		expect(cssShadow("0 0 #fff #000")).toBeNull();
		expect(cssShadow("0 #fff")).toBeNull();
		expect(cssShadow("#fff")).toBeNull();
	});

	it("rejects injection, unbalanced parens and empty values", () => {
		expect(cssShadow("0 0 1px red;position:fixed")).toBeNull();
		expect(cssShadow("0 0 1px rgba(0,0,0")).toBeNull();
		expect(cssShadow("")).toBeNull();
		expect(cssShadow(4)).toBeNull();
	});
});

describe("generateCss safety rules", () => {
	it("drops negative padding but keeps negative margin", () => {
		const css = generateCss([
			container({
				desktop: { padding: { t: "-4px", b: "4px" }, margin: { t: "-4px" } },
			}),
		]);
		expect(css).not.toContain("padding-top");
		expect(css).toContain("padding-bottom:4px");
		expect(css).toContain("margin-top:-4px");
	});

	it("makes a z-index take effect with position:relative", () => {
		const css = generateCss([container({ advanced: { zIndex: "3" } })]);
		expect(css).toContain("position:relative;z-index:3");
		expect(generateCss([container({ advanced: { zIndex: "1.5" } })])).toBe("");
	});

	it("cannot have another node's hide swallowed by a comment in a width", () => {
		const a = container({ desktop: { size: { width: "calc(1px)/*" } } });
		const b = container({ advanced: { hide: { desktop: true } } });
		const css = generateCss([a, b]);
		expect(css).toContain(`[data-bd-container="${b.key}"]`);
		expect(css).toContain("display:none!important");
		expect(css).not.toContain(`[data-bd-container="${a.key}"]`);
		expect(css).not.toContain("/*");
	});
});
