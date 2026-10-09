/**
 * Tests for how `applyTree` treats a server-rendered template reference.
 *
 * The nodes inside the wrapper belong to the referenced template, not to the
 * edited tree: they must stay in place, and the wrapper reports its state
 * through `data-bd-missing`.
 *
 * Run: pnpm test
 */

import { beforeEach, describe, expect, it } from "vitest";

import { createNode, type BuilderNode } from "../store/tree";
import { applyTree } from "./live-dom";

function refNode(key: string, refId: string): BuilderNode {
	const node = createNode("template_ref", null);
	node.key = key;
	node.props = { ref_id: refId };
	return node;
}

function page(templateId: string, inner: string): Document {
	document.body.innerHTML = `
		<div data-bd-root>
			<main data-bd-main>
				<div class="bd-element" data-bd-key="r" data-bd-type="template_ref" data-template-id="${templateId}">${inner}</div>
			</main>
		</div>`;
	return document;
}

const INNER = `<div class="bd-element" data-bd-key="inner" data-bd-type="heading"><h2>Inside</h2></div>`;

describe("applyTree with a template reference", () => {
	beforeEach(() => {
		document.head.innerHTML = "";
	});

	it("keeps nodes rendered inside the reference where they are", () => {
		const doc = page("X", INNER);
		applyTree(doc, [refNode("r", "X")]);
		const inner = doc.querySelector('[data-bd-key="inner"]')!;
		expect(inner.parentElement).toBe(doc.querySelector('[data-bd-type="template_ref"]'));
	});

	it("asks for a template when ref_id is empty", () => {
		const doc = page("", "");
		applyTree(doc, [refNode("r", "")]);
		expect(doc.querySelector('[data-bd-key="r"]')!.getAttribute("data-bd-missing")).toBe(
			"Choose a template in the Inspector",
		);
	});

	it("shows no notice when the rendered template matches ref_id", () => {
		const doc = page("X", INNER);
		applyTree(doc, [refNode("r", "X")]);
		expect(doc.querySelector('[data-bd-key="r"]')!.hasAttribute("data-bd-missing")).toBe(false);
	});

	it("shows a loading notice when another template was rendered", () => {
		const doc = page("X", INNER);
		applyTree(doc, [refNode("r", "Y")]);
		expect(doc.querySelector('[data-bd-key="r"]')!.getAttribute("data-bd-missing")).toBe("Loading the template…");
	});
});
