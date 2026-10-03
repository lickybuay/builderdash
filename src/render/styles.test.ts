/**
 * Tests for the CSS generator.
 *
 * The generator turns editor-supplied JSON into a stylesheet that lands in the
 * page, so these pin both the output and the safety rules: only whitelisted
 * properties, validated values, plain node keys, never a `<`.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { createNode, type BuilderNode } from "../editor/store/tree";
import { bodyClasses } from "./classes";
import { elementAttributes, generateCss, missingLabel, pageCssText, selectorFor } from "./styles";

function container(style: BuilderNode["style"] = {}): BuilderNode {
	const node = createNode("container", null);
	node.style = style;
	return node;
}

function block(style: BuilderNode["style"] = {}): BuilderNode {
	const node = createNode("content_ref", null);
	node.props = { ref_key: "hero-1" };
	node.style = style;
	return node;
}

describe("generateCss", () => {
	it("targets containers by their box and blocks by their wrapper", () => {
		const c = container();
		const b = block();
		expect(selectorFor(c)).toBe(`[data-bd-container="${c.key}"]`);
		expect(selectorFor(b)).toBe(`[data-bd-key="${b.key}"]`);
	});

	it("reads a bare number as pixels, keeps units and tokens", () => {
		const node = container({
			desktop: { padding: { t: "20", r: "2rem", b: "var(--spacing-lg)", l: "0" } },
		});
		const css = generateCss([node]);
		expect(css).toContain("padding-top:20px");
		expect(css).toContain("padding-right:2rem");
		expect(css).toContain("padding-bottom:var(--spacing-lg)");
		expect(css).toContain("padding-left:0");
	});

	it("drops values that are not valid lengths or colors", () => {
		const node = container({
			desktop: {
				background: "red;}</style><script>alert(1)</script>",
				margin: { t: "10px; color: red" },
				border: { color: "url(javascript:x)" },
			},
		});
		const css = generateCss([node]);
		expect(css).toBe("");
	});

	it("never emits a `<`", () => {
		const node = container({ desktop: { background: "#fff" } });
		expect(generateCss([node])).not.toContain("<");
	});

	it("skips nodes whose key is not plain alphanumeric", () => {
		const node = container({ desktop: { background: "#fff" } });
		node.key = 'x"]{}body{display:none';
		expect(generateCss([node])).toBe("");
	});

	it("applies text styles to containers only", () => {
		const style = { desktop: { color: "#111111", typography: { size: "18", weight: "700" } } };
		expect(generateCss([container(style)])).toContain("font-size:18px");
		expect(generateCss([container(style)])).toContain("font-weight:700");
		expect(generateCss([block(style)])).toBe("");
	});

	it("wraps tablet and mobile styles in the template's breakpoints", () => {
		const node = container({
			tablet: { padding: { t: "10" } },
			mobile: { padding: { t: "5" } },
		});
		const css = generateCss([node]);
		expect(css).toContain("@media (max-width:900px){");
		expect(css).toContain("@media (max-width:600px){");
	});

	it("hides on the public site and fades in the editor", () => {
		const node = container({ advanced: { hide: { mobile: true } } });
		expect(generateCss([node])).toContain("display:none!important");
		expect(generateCss([node], { edit: true })).toContain("opacity:.35!important");
		expect(generateCss([node], { edit: true })).not.toContain("display:none");
	});

	it("walks nested nodes", () => {
		const child = container({ desktop: { background: "#000" } });
		const parent = container();
		parent.children = [child];
		expect(generateCss([parent])).toContain(`[data-bd-container="${child.key}"]`);
	});
});

describe("elementAttributes", () => {
	it("keeps a valid id and valid classes only", () => {
		const node = container({
			advanced: { cssId: "hero-section", cssClasses: "card  2bad ok_one <x>" },
		});
		expect(elementAttributes(node)).toEqual({ id: "hero-section", classes: ["card", "ok_one"] });
	});

	it("drops an invalid id", () => {
		const node = container({ advanced: { cssId: "1-starts-with-digit" } });
		expect(elementAttributes(node).id).toBeUndefined();
	});
});

describe("bodyClasses", () => {
	it("names the entry by its singular collection and id, keeping the id's case", () => {
		expect(bodyClasses({ collection: "pages", id: "01ABCdef" })).toEqual(["page-01ABCdef"]);
		expect(bodyClasses({ collection: "posts", id: "01XYZ" })).toEqual(["post-01XYZ"]);
	});
});

describe("pageCssText", () => {
	it("keeps the editor's CSS but can never close the style element", () => {
		expect(pageCssText(".a { color: red; }")).toBe(".a { color: red; }");
		const css = pageCssText("a{} </style><script>alert(1)</script>");
		expect(css).not.toContain("<");
	});

	it("ignores anything that is not text and caps the length", () => {
		expect(pageCssText({ evil: true })).toBe("");
		expect(pageCssText("a".repeat(30_000))).toHaveLength(20_000);
	});
});

describe("missingLabel", () => {
	it("names the missing component from its block type", () => {
		expect(missingLabel("marketing_hero")).toBe("Missing component: Hero");
		expect(missingLabel("marketing_case_study")).toBe("Missing component: Case study");
	});
});
