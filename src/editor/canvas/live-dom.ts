/**
 * Projects the builder tree onto the live preview's DOM.
 *
 * The iframe shows the real page, server-rendered by `BuilderLayout.astro`,
 * where every node is a `display: contents` wrapper carrying `data-bd-key`.
 * Unsaved edits (reorder, nest, add, remove) are shown by rearranging those
 * wrappers so the preview follows the store without a server round trip.
 *
 * The DOM is always DERIVED from the tree: `applyTree` is idempotent and can
 * run after every change and after every iframe load. The store is the only
 * source of truth; after Save the iframe reloads and the server render takes
 * over again.
 *
 * Pure DOM: no React. Works on any `Document`, so it is testable in jsdom.
 */

import { cssColor, elementAttributes } from "../../render/styles";
import type { BuilderNode, BuilderTree } from "../store/tree";

const HOLDER_ID = "bd-removed-holder";

/** Hidden parking spot for nodes removed from the tree (undo brings them back). */
function holder(doc: Document): HTMLElement {
	let el = doc.getElementById(HOLDER_ID);
	if (!el) {
		el = doc.createElement("div");
		el.id = HOLDER_ID;
		el.hidden = true;
		el.style.display = "none";
		doc.body.appendChild(el);
	}
	return el;
}

function wrapperFor(doc: Document, node: BuilderNode): HTMLElement | null {
	const existing = doc.querySelector<HTMLElement>(`[data-bd-key="${CSS.escape(node.key)}"]`);
	if (existing) return existing;

	// A content block not placed yet is rendered by the server under
	// `data-bd-ref`; adopt it as this ref's wrapper.
	if (node.type === "content_ref") {
		const ref = doc.querySelector<HTMLElement>(
			`[data-bd-ref="${CSS.escape(String(node.props.ref_key))}"]:not([data-bd-key])`,
		);
		if (ref) {
			ref.setAttribute("data-bd-key", node.key);
			ref.setAttribute("data-bd-type", node.type);
			return ref;
		}
		// A block added in the editor (a duplicate) has no server render yet:
		// an empty wrapper is placed now and the live re-render fills it.
		// Same markup as BuilderNode.astro.
		const wrapper = doc.createElement("div");
		wrapper.className = "bd-element";
		wrapper.setAttribute("data-bd-key", node.key);
		wrapper.setAttribute("data-bd-type", node.type);
		wrapper.setAttribute("data-bd-ref", String(node.props.ref_key));
		return wrapper;
	}

	// A container added in the editor: same markup the server would render.
	if (node.type === "container") {
		const wrapper = doc.createElement("div");
		wrapper.className = "bd-wrap";
		wrapper.setAttribute("data-bd-key", node.key);
		wrapper.setAttribute("data-bd-type", node.type);
		const box = doc.createElement("div");
		box.className = "bd-container";
		box.setAttribute("data-bd-container", node.key);
		wrapper.appendChild(box);
		return wrapper;
	}

	// A heading added in the editor: same markup the server would render.
	if (node.type === "heading") {
		const wrapper = doc.createElement("div");
		wrapper.className = "bd-element";
		wrapper.setAttribute("data-bd-key", node.key);
		wrapper.setAttribute("data-bd-type", node.type);
		wrapper.setAttribute("data-bd-level", String(node.props.level ?? "h2"));
		const level = String(node.props.level ?? "h2") as `${"h" | "H"}[1-6]`;
		const el = doc.createElement(level);
		el.textContent = String(node.props.text ?? "");
		wrapper.appendChild(el);
		return wrapper;
	}

	// A text block added in the editor: same markup the server would render.
	if (node.type === "text") {
		const wrapper = doc.createElement("div");
		wrapper.className = "bd-element";
		wrapper.setAttribute("data-bd-key", node.key);
		wrapper.setAttribute("data-bd-type", node.type);
		const p = doc.createElement("p");
		p.textContent = String(node.props.content ?? "");
		wrapper.appendChild(p);
		return wrapper;
	}

	// An image block added in the editor: same markup the server would render.
	if (node.type === "image") {
		const wrapper = doc.createElement("div");
		wrapper.className = "bd-element";
		wrapper.setAttribute("data-bd-key", node.key);
		wrapper.setAttribute("data-bd-type", node.type);
		wrapper.setAttribute("data-bd-width", String(node.props.width ?? "auto"));
		wrapper.setAttribute("data-bd-height", String(node.props.height ?? "auto"));
		wrapper.setAttribute("data-bd-object-fit", String(node.props.object_fit ?? "cover"));
		if (node.props.image) {
			const imgSrc =
				typeof node.props.image === "object" && node.props.image !== null && "src" in node.props.image
					? String((node.props.image as { src: unknown }).src)
					: String(node.props.image);
			const img = doc.createElement("img");
			img.className = "bd-image";
			img.src = imgSrc;
			img.alt = String(node.props.alt ?? "");
			wrapper.appendChild(img);
		}
		return wrapper;
	}

	// A button block added in the editor: same markup the server would render.
	if (node.type === "button") {
		const wrapper = doc.createElement("div");
		wrapper.className = "bd-element bd-button";
		wrapper.setAttribute("data-bd-key", node.key);
		wrapper.setAttribute("data-bd-type", node.type);
		const a = doc.createElement("a");
		a.href = String(node.props.url ?? "#");
		a.textContent = String(node.props.label ?? "");
		wrapper.appendChild(a);
		return wrapper;
	}

	// A divider block added in the editor: same markup the server would render.
	if (node.type === "divider") {
		const wrapper = doc.createElement("div");
		wrapper.className = "bd-element";
		wrapper.setAttribute("data-bd-key", node.key);
		wrapper.setAttribute("data-bd-type", node.type);
		wrapper.setAttribute("data-bd-divider-color", String(node.props.color ?? "default"));
		wrapper.setAttribute("data-bd-divider-thickness", String(node.props.thickness ?? "md"));
		wrapper.setAttribute("data-bd-divider-style", String(node.props.style ?? "solid"));
		const hr = doc.createElement("hr");
		wrapper.appendChild(hr);
		return wrapper;
	}

	// A template reference added in the editor: same markup the server would render.
	if (node.type === "template_ref") {
		const wrapper = doc.createElement("div");
		wrapper.className = "bd-element bd-template";
		wrapper.setAttribute("data-bd-key", node.key);
		wrapper.setAttribute("data-bd-type", node.type);
		wrapper.setAttribute("data-template-id", String(node.props.ref_id ?? ""));
		return wrapper;
	}

	return null;
}

/** Keeps a container's attributes in step with its props. */
function syncContainer(wrapper: HTMLElement, node: BuilderNode): HTMLElement | null {
	const box = wrapper.querySelector<HTMLElement>(`[data-bd-container="${CSS.escape(node.key)}"]`);
	if (!box) return null;
	box.setAttribute("data-gap", String(node.props.gap ?? "md"));
	box.setAttribute("data-direction", String(node.props.direction ?? "column"));
	// Same validation as the server render: what the preview shows is what ships.
	box.style.backgroundColor = cssColor(node.props.background_color) ?? "";
	return box;
}

/** Keeps a heading node's attributes and text in step with its props. */
function syncHeading(wrapper: HTMLElement, node: BuilderNode): void {
	wrapper.setAttribute("data-bd-level", String(node.props.level ?? "h2"));
	const inner = wrapper.querySelector("h1,h2,h3,h4,h5,h6");
	if (inner) {
		inner.textContent = String(node.props.text ?? "");
	} else {
		const level = String(node.props.level ?? "h2") as `${"h" | "H"}[1-6]`;
		const el = wrapper.ownerDocument.createElement(level);
		el.textContent = String(node.props.text ?? "");
		wrapper.appendChild(el);
	}
}

/** Keeps a text node's attributes and content in step with its props. */
function syncText(wrapper: HTMLElement, node: BuilderNode): void {
	const inner = wrapper.querySelector("p");
	if (inner) {
		inner.textContent = String(node.props.content ?? "");
	} else {
		const p = wrapper.ownerDocument.createElement("p");
		p.textContent = String(node.props.content ?? "");
		wrapper.appendChild(p);
	}
}

/** Keeps an image node's attributes in step with its props. */
function syncImage(wrapper: HTMLElement, node: BuilderNode): void {
	wrapper.setAttribute("data-bd-width", String(node.props.width ?? "auto"));
	wrapper.setAttribute("data-bd-height", String(node.props.height ?? "auto"));
	wrapper.setAttribute("data-bd-object-fit", String(node.props.object_fit ?? "cover"));
	const img = wrapper.querySelector("img");
	if (img) {
		const imgSrc =
			typeof node.props.image === "object" && node.props.image !== null && "src" in node.props.image
				? String((node.props.image as { src: unknown }).src)
				: String(node.props.image);
		img.src = imgSrc ?? "";
		img.alt = String(node.props.alt ?? "");
	}
}

/** Keeps a button node's attributes and label in step with its props. */
function syncButton(wrapper: HTMLElement, node: BuilderNode): void {
	const inner = wrapper.querySelector("a");
	if (inner) {
		inner.href = String(node.props.url ?? "#");
		inner.textContent = String(node.props.label ?? "");
	}
}

/** Keeps a divider node's attributes in step with its props. */
function syncDivider(wrapper: HTMLElement, node: BuilderNode): void {
	wrapper.setAttribute("data-bd-divider-color", String(node.props.color ?? "default"));
	wrapper.setAttribute("data-bd-divider-thickness", String(node.props.thickness ?? "md"));
	wrapper.setAttribute("data-bd-divider-style", String(node.props.style ?? "solid"));
}

/**
 * Applies a node's Extra settings (CSS ID, classes) to the element its styles
 * hit, as the server does. Classes added before are tracked so a removed one
 * goes away.
 */
function syncAttributes(el: Element, node: BuilderNode): void {
	const { id, classes } = elementAttributes(node);
	if (id) el.id = id;
	else el.removeAttribute("id");
	const previous = (el.getAttribute("data-bd-classes") ?? "").split(" ").filter(Boolean);
	for (const name of previous) el.classList.remove(name);
	for (const name of classes) el.classList.add(name);
	if (classes.length > 0) el.setAttribute("data-bd-classes", classes.join(" "));
	else el.removeAttribute("data-bd-classes");
}

/** Appends the wrappers of `nodes`, in order, into `parent` (before `before`). */
function place(
	doc: Document,
	parent: Element,
	nodes: BuilderTree,
	seen: Set<string>,
	before: Node | null = null,
): void {
	for (const node of nodes) {
		const wrapper = wrapperFor(doc, node);
		if (!wrapper) continue;
		seen.add(node.key);
		parent.insertBefore(wrapper, before);
		if (node.type === "container") {
			const box = syncContainer(wrapper, node);
			if (box) {
				syncAttributes(box, node);
				place(doc, box, node.children, seen);
			}
		} else if (node.type === "heading") {
			syncAttributes(wrapper, node);
			syncHeading(wrapper, node);
		} else if (node.type === "text") {
			syncAttributes(wrapper, node);
			syncText(wrapper, node);
		} else if (node.type === "image") {
			syncAttributes(wrapper, node);
			syncImage(wrapper, node);
		} else if (node.type === "button") {
			syncAttributes(wrapper, node);
			syncButton(wrapper, node);
		} else if (node.type === "divider") {
			syncAttributes(wrapper, node);
			syncDivider(wrapper, node);
		} else if (node.type === "template_ref") {
			syncAttributes(wrapper, node);
			place(doc, wrapper, node.children, seen);
		} else {
			syncAttributes(wrapper, node);
		}
	}
}

export function applyTree(doc: Document, tree: BuilderTree): void {
	const main = doc.querySelector("main[data-bd-main]");
	if (!main) return;

	const seen = new Set<string>();
	// Layout nodes go first in <main>; content blocks the tree does not place
	// yet (server-rendered under `data-bd-ref`) stay after them.
	const firstUnplaced = main.querySelector(":scope > [data-bd-ref]:not([data-bd-key])");
	place(doc, main, tree, seen, firstUnplaced);

	// Wrappers whose node left the tree are parked, not destroyed.
	for (const wrapper of Array.from(doc.querySelectorAll<HTMLElement>("[data-bd-key]"))) {
		const key = wrapper.getAttribute("data-bd-key")!;
		if (!seen.has(key) && wrapper.parentElement?.id !== HOLDER_ID) {
			holder(doc).appendChild(wrapper);
		}
	}
}

/**
 * The box a node occupies on screen. Wrappers are `display: contents` and have
 * no box of their own, so this is the union of their children's boxes.
 */
export function nodeRect(wrapper: Element): DOMRect | null {
	// A block wrapper is a real box (margin aside, its rect is the node's).
	const view = wrapper.ownerDocument.defaultView;
	if (view && view.getComputedStyle(wrapper).display !== "contents") {
		const own = wrapper.getBoundingClientRect();
		if (own.width > 0 || own.height > 0) return own;
	}
	let top = Infinity;
	let left = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const child of Array.from(wrapper.children)) {
		const rect = child.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) continue;
		top = Math.min(top, rect.top);
		left = Math.min(left, rect.left);
		right = Math.max(right, rect.right);
		bottom = Math.max(bottom, rect.bottom);
	}
	if (!Number.isFinite(top)) return null;
	return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * The site's design tokens: every custom property declared on `:root`, read
 * from the page's stylesheets (inside `@layer` and `@media` blocks too).
 * `getComputedStyle` cannot enumerate custom properties, hence the walk.
 * Cross-origin sheets (web fonts) throw on access and are skipped.
 */
export function readTokens(doc: Document): string[] {
	const names = new Set<string>();
	const visit = (rules: CSSRuleList) => {
		for (const rule of Array.from(rules)) {
			const style = (rule as CSSStyleRule).style;
			const selector = (rule as CSSStyleRule).selectorText;
			if (style && selector && /(^|,)\s*:root\b/.test(selector)) {
				for (let i = 0; i < style.length; i++) {
					const name = style.item(i);
					if (name.startsWith("--")) names.add(name);
				}
			}
			const nested = (rule as CSSGroupingRule).cssRules;
			if (nested) visit(nested);
		}
	};
	for (const sheet of Array.from(doc.styleSheets)) {
		try {
			visit(sheet.cssRules);
		} catch {
			// Cross-origin stylesheet: not readable, not ours.
		}
	}
	return [...names].sort();
}

/** Keeps the editor's own copy of the node stylesheet in the page. */
export function applyStyles(doc: Document, css: string): void {
	// The server's copy reflects the saved styles; the editor owns the CSS
	// from now on, so a cleared value disappears immediately.
	const server = doc.getElementById("bd-styles");
	if (server && server.textContent) server.textContent = "";
	let live = doc.getElementById("bd-live-styles");
	if (!live) {
		live = doc.createElement("style");
		live.id = "bd-live-styles";
		doc.head.appendChild(live);
	}
	if (live.textContent !== css) live.textContent = css;
}

/**
 * Marks placed blocks whose type the page can no longer use: the preview's
 * CSS (see BuilderLayout) hides their content and shows the label. The mark
 * is an attribute on the wrapper, so it survives a live re-render.
 */
export function markMissing(doc: Document, missing: ReadonlyMap<string, string>): void {
	for (const wrapper of doc.querySelectorAll<HTMLElement>(".bd-element[data-bd-ref]")) {
		const label = missing.get(wrapper.getAttribute("data-bd-ref") ?? "");
		if (label) wrapper.setAttribute("data-bd-missing", label);
	}
}
