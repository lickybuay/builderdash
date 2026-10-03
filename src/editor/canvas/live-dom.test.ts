/**
 * Tests for the projection of the builder tree onto the live preview DOM.
 *
 * The preview shows the server render; `applyTree` must rearrange it to match
 * the store without losing nodes, and produce the same markup the server
 * would for nodes the editor adds.
 *
 * Run: pnpm test
 */

import { beforeEach, describe, expect, it } from "vitest";

import { createNode, type BuilderNode } from "../store/tree";
import { applyStyles, applyTree, markMissing } from "./live-dom";

/** A page as BuilderLayout renders it: two blocks inside <main>. */
function page(): Document {
	document.body.innerHTML = `
		<div data-bd-root>
			<header></header>
			<main data-bd-main>
				<div class="bd-element" data-bd-key="a" data-bd-type="content_ref" data-bd-ref="ka"><section>A</section></div>
				<div class="bd-element" data-bd-key="b" data-bd-type="content_ref" data-bd-ref="kb"><section>B</section></div>
			</main>
			<footer></footer>
		</div>`;
	return document;
}

function ref(key: string, refKey: string, parent: string | null = null): BuilderNode {
	const node = createNode("content_ref", parent);
	node.key = key;
	node.props = { ref_key: refKey };
	return node;
}

const order = (doc: Document) =>
	Array.from(doc.querySelector("main")!.children).map((el) => el.getAttribute("data-bd-key"));

describe("applyTree", () => {
	beforeEach(() => {
		document.head.innerHTML = "";
	});

	it("reorders wrappers to match the tree", () => {
		const doc = page();
		applyTree(doc, [ref("b", "kb"), ref("a", "ka")]);
		expect(order(doc)).toEqual(["b", "a"]);
	});

	it("is idempotent", () => {
		const doc = page();
		const tree = [ref("b", "kb"), ref("a", "ka")];
		applyTree(doc, tree);
		const html = doc.body.innerHTML;
		applyTree(doc, tree);
		expect(doc.body.innerHTML).toBe(html);
	});

	it("creates a container with the server's markup and nests into it", () => {
		const doc = page();
		const box = createNode("container", null);
		box.key = "box1";
		box.children = [ref("a", "ka", "box1")];
		applyTree(doc, [box, ref("b", "kb")]);

		const wrapper = doc.querySelector('[data-bd-key="box1"]')!;
		expect(wrapper.className).toBe("bd-wrap");
		const inner = wrapper.querySelector('[data-bd-container="box1"]')!;
		expect(inner.classList.contains("bd-container")).toBe(true);
		expect(inner.querySelector('[data-bd-key="a"]')).not.toBeNull();
	});

	it("parks removed nodes instead of destroying them", () => {
		const doc = page();
		applyTree(doc, [ref("a", "ka")]);
		expect(order(doc)).toEqual(["a"]);
		const parked = doc.getElementById("bd-removed-holder")!;
		expect(parked.querySelector('[data-bd-key="b"]')).not.toBeNull();

		applyTree(doc, [ref("a", "ka"), ref("b", "kb")]);
		expect(order(doc)).toEqual(["a", "b"]);
	});

	it("applies and clears CSS ID and classes from Extra", () => {
		const doc = page();
		const a = ref("a", "ka");
		a.style = { advanced: { cssId: "intro", cssClasses: "card wide" } };
		applyTree(doc, [a, ref("b", "kb")]);
		const el = doc.querySelector('[data-bd-key="a"]')!;
		expect(el.id).toBe("intro");
		expect(el.classList.contains("card")).toBe(true);

		applyTree(doc, [ref("a", "ka"), ref("b", "kb")]);
		expect(el.id).toBe("");
		expect(el.classList.contains("card")).toBe(false);
		expect(el.classList.contains("bd-element")).toBe(true);
	});

	it("gives a duplicated block an empty wrapper for the live render to fill", () => {
		const doc = page();
		applyTree(doc, [ref("a", "ka"), ref("c", "kc"), ref("b", "kb")]);
		const created = doc.querySelector('[data-bd-key="c"]')!;
		expect(created.className).toBe("bd-element");
		expect(created.getAttribute("data-bd-ref")).toBe("kc");
		expect(order(doc)).toEqual(["a", "c", "b"]);
	});
});

describe("applyStyles", () => {
	it("empties the server stylesheet and keeps one live copy", () => {
		const doc = page();
		const server = doc.createElement("style");
		server.id = "bd-styles";
		server.textContent = "[data-bd-key=a]{color:red}";
		doc.body.appendChild(server);

		applyStyles(doc, "x{color:blue}");
		applyStyles(doc, "x{color:green}");
		expect(server.textContent).toBe("");
		expect(doc.querySelectorAll("#bd-live-styles")).toHaveLength(1);
		expect(doc.getElementById("bd-live-styles")!.textContent).toBe("x{color:green}");
	});
});

describe("markMissing", () => {
	it("labels the wrapper of a block whose type is not available, and survives a re-render", () => {
		const doc = page();
		markMissing(doc, new Map([["ka", "Missing component: Hero"]]));
		const wrapper = doc.querySelector('[data-bd-ref="ka"]')!;
		expect(wrapper.getAttribute("data-bd-missing")).toBe("Missing component: Hero");
		expect(doc.querySelector('[data-bd-ref="kb"]')!.hasAttribute("data-bd-missing")).toBe(false);

		wrapper.innerHTML = "<section>re-rendered</section>";
		expect(wrapper.getAttribute("data-bd-missing")).toBe("Missing component: Hero");
	});
});
