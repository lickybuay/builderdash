/**
 * The builder's CSS generator: node styles → one stylesheet.
 *
 * Shared by the public render (`BuilderLayout.astro`, saved styles) and the
 * editor (`LiveCanvas`, unsaved styles), so the preview and the site never
 * disagree.
 *
 * Safety: `builder_styles` is JSON anyone with content access can write, and
 * the output lands inside a <style>. So nothing is copied through: only the
 * properties listed here are emitted, every value must match a strict pattern,
 * node keys must be plain alphanumerics, and the result never contains `<`.
 */

import type { AdvancedValues, BuilderNode, BuilderTree, StyleValues } from "../editor/store/tree";

/** Breakpoints, matching the marketing template's own layout changes. */
export const BREAKPOINT_MAX = { tablet: 900, mobile: 600 } as const;

const KEY = /^[a-z0-9]+$/;
const LENGTH = /^(-?\d+(\.\d+)?(px|rem|em|%|vw|vh)?|auto|0)$/;
const TOKEN = /^var\(--[a-z0-9-]+\)$/;
const COLOR = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|transparent|currentColor)$/;
const WEIGHT = /^[1-9]00$/;
const NUMBER = /^\d+(\.\d+)?$/;
const ALIGN = /^(left|center|right|justify|start|end)$/;
const INTEGER = /^-?\d{1,5}$/;
export const CSS_IDENT = /^[A-Za-z][\w-]{0,63}$/;

/**
 * Node types that take text styles (font, color): containers and text widgets
 * (heading, text box). Content blocks and decorative widgets set their own
 * type sizes and colors, so on them these would be silently overridden.
 */
export const TEXT_STYLED_TYPES: ReadonlySet<string> = new Set(["container", "heading", "text"]);

const BARE_NUMBER = /^-?\d+(\.\d+)?$/;

// ---------------------------------------------------------------------------
// Value validators, shared by the CSS generator, the inline styles, the canvas
// projection and the Inspector's own inline validation (see
// `.claude/rules/color-fields.md` and `value-fields.md`). Each returns the CSS
// value to write, or `null` when it must be dropped.
// ---------------------------------------------------------------------------

/** Keyword sizes accepted where a length is. */
const SIZE_KEYWORD = /^(auto|fit-content|min-content|max-content)$/;
/** Functions a "custom" length may use; anything else (url(), expression()…) is rejected. */
const CUSTOM_FUNCTIONS: ReadonlySet<string> = new Set(["calc", "min", "max", "clamp", "var"]);
const CUSTOM_MAX = 200;

/**
 * A "custom" length, as Elementor's custom unit: `calc()`, `min()`, `max()`,
 * `clamp()` over lengths, numbers and `var(--token)`. Only those functions,
 * balanced parentheses, and no character that could end the declaration.
 */
export function cssExpression(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed === "" || trimmed.length > CUSTOM_MAX) return null;
	if (!/^(calc|min|max|clamp)\(/.test(trimmed)) return null;
	if (!/^[a-z0-9.%+\-*/,\s()]+$/i.test(trimmed)) return null;
	for (const match of trimmed.matchAll(/([a-z-]+)\(/gi)) {
		if (!CUSTOM_FUNCTIONS.has(match[1]!.toLowerCase())) return null;
	}
	// var() only as var(--name).
	for (const match of trimmed.matchAll(/var\(([^)]*)\)/gi)) {
		if (!/^--[a-z0-9-]+$/i.test(match[1]!.trim())) return null;
	}
	// A comment would swallow the rules after it (another node's `hide`).
	if (/\/\*|\*\//.test(trimmed)) return null;
	// One function call: the outer parenthesis closes exactly at the end, so
	// nothing trails it (`calc(1px) url`).
	let depth = 0;
	for (let i = 0; i < trimmed.length; i++) {
		const char = trimmed[i];
		if (char === "(") depth += 1;
		else if (char === ")") depth -= 1;
		if (depth < 0) return null;
		if (depth === 0 && char === ")" && i !== trimmed.length - 1) return null;
	}
	return depth === 0 ? trimmed : null;
}

/**
 * A validated length. A bare number means pixels, as in Elementor (`20` →
 * `20px`): unitless lengths are invalid CSS and the browser would silently
 * drop the declaration. `negative: false` rejects negatives (padding, sizes,
 * border width, radius).
 */
export function cssLength(value: unknown, options: { negative?: boolean } = {}): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (TOKEN.test(trimmed)) return trimmed;
	if (SIZE_KEYWORD.test(trimmed)) return trimmed;
	const expression = cssExpression(trimmed);
	if (expression) return expression;
	if (!LENGTH.test(trimmed)) return null;
	if (options.negative === false && trimmed.startsWith("-")) return null;
	return BARE_NUMBER.test(trimmed) && Number(trimmed) !== 0 ? `${trimmed}px` : trimmed;
}

/** A color: hex (3–8 digits), rgb(a)/hsl(a), transparent, currentColor or var(--token). */
export function cssColor(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return COLOR.test(trimmed) || TOKEN.test(trimmed) ? trimmed : null;
}

/** Font weight: 100–900, normal/bold, or a theme token. */
export function cssWeight(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return WEIGHT.test(trimmed) || /^(normal|bold)$/.test(trimmed) || TOKEN.test(trimmed) ? trimmed : null;
}

/** Line height: a unitless number (preferred), a non-negative length, `normal` or a token. */
export function cssLineHeight(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (NUMBER.test(trimmed) || trimmed === "normal" || TOKEN.test(trimmed)) return trimmed;
	if (trimmed === "auto") return null;
	return cssLength(trimmed, { negative: false });
}

/** z-index: an integer (negatives allowed). */
export function cssZIndex(value: unknown): string | null {
	return typeof value === "string" && INTEGER.test(value.trim()) ? value.trim() : null;
}

/**
 * Box shadow: `none`, a theme token, or one or more layers of
 * `[inset] x y [blur] [spread] [color]`, each part validated on its own.
 */
export function cssShadow(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed === "none" || TOKEN.test(trimmed)) return trimmed;
	if (trimmed === "" || trimmed.length > CUSTOM_MAX * 2) return null;
	const layers = splitTopLevel(trimmed, ",");
	if (!layers) return null;
	for (const layer of layers) {
		const parts = splitTopLevel(layer.trim(), " ");
		if (!parts) return null;
		let lengths = 0;
		let colors = 0;
		let inset = 0;
		for (const part of parts.filter(Boolean)) {
			if (part === "inset") inset += 1;
			else if (cssColor(part) && !LENGTH.test(part)) colors += 1;
			else if (cssLength(part)) lengths += 1;
			else return null;
		}
		if (inset > 1 || colors > 1 || lengths < 2 || lengths > 4) return null;
	}
	return trimmed;
}

/** Splits on `separator` outside parentheses; `null` when they do not balance. */
function splitTopLevel(text: string, separator: string): string[] | null {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const char of text) {
		if (char === "(") depth += 1;
		else if (char === ")") depth -= 1;
		if (depth < 0) return null;
		if (char === separator && depth === 0) {
			parts.push(current);
			current = "";
		} else current += char;
	}
	if (depth !== 0) return null;
	parts.push(current);
	return parts;
}

const length = (value: unknown) => cssLength(value);
const positive = (value: unknown) => cssLength(value, { negative: false });
const color = cssColor;

/** Declarations for one style set, validated. */
function declarations(style: StyleValues | undefined, node: BuilderNode): string[] {
	if (!style) return [];
	const out: string[] = [];
	const push = (property: string, value: string | null) => {
		if (value !== null) out.push(`${property}:${value}`);
	};
	for (const [box, prefix] of [
		[style.margin, "margin"],
		[style.padding, "padding"],
	] as const) {
		if (!box) continue;
		// Margins may be negative; padding never.
		const side = prefix === "margin" ? length : positive;
		push(`${prefix}-top`, side(box.t));
		push(`${prefix}-right`, side(box.r));
		push(`${prefix}-bottom`, side(box.b));
		push(`${prefix}-left`, side(box.l));
	}
	push("width", positive(style.size?.width));
	push("max-width", positive(style.size?.maxWidth));
	push("min-height", positive(style.size?.height));
	push("background", color(style.background));
	push("border-width", positive(style.border?.width));
	if (positive(style.border?.width)) out.push("border-style:solid");
	push("border-radius", positive(style.border?.radius));
	push("border-color", color(style.border?.color));
	push("box-shadow", cssShadow(style.shadow));
	const align = style.typography?.align;
	push("text-align", typeof align === "string" && ALIGN.test(align) ? align : null);

	if (TEXT_STYLED_TYPES.has(node.type)) {
		push("color", color(style.color));
		push("font-size", positive(style.typography?.size));
		push("font-weight", cssWeight(style.typography?.weight));
		push("line-height", cssLineHeight(style.typography?.lineHeight));
		push("letter-spacing", length(style.typography?.letterSpacing));
	}
	return out;
}

/** The element a node's styles apply to. */
export function selectorFor(node: BuilderNode): string {
	return node.type === "container"
		? `[data-bd-container="${node.key}"]`
		: `[data-bd-key="${node.key}"]`;
}

function walk(tree: BuilderTree, visit: (node: BuilderNode) => void): void {
	for (const node of tree) {
		visit(node);
		walk(node.children, visit);
	}
}

/** The text a placed block shows when its component is not available. */
export function missingLabel(blockType: string): string {
	const name = blockType.replace(/^[a-z]+_/, "").replace(/_/g, " ");
	return `Missing component: ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/** Longest custom CSS accepted, in characters. */
const PAGE_CSS_MAX = 20_000;

/**
 * The page's custom CSS, safe to place inside a `<style>` element.
 *
 * The CSS itself is the editor's to write (it can restyle anything on the
 * page, as in Elementor). What is removed is every `<`, so the text can never
 * close the `<style>` element and start markup. CSS has no use for `<`.
 */
export function pageCssText(css: unknown): string {
	if (typeof css !== "string") return "";
	return css.slice(0, PAGE_CSS_MAX).replace(/</g, "");
}

/**
 * The stylesheet for a tree. In `edit` mode a hidden node stays visible but
 * faded, as in Elementor, so it can still be selected.
 */
export function generateCss(tree: BuilderTree, options: { edit?: boolean } = {}): string {
	const base: string[] = [];
	const media: Record<"tablet" | "mobile", string[]> = { tablet: [], mobile: [] };
	const hidden = options.edit
		? "opacity:.35!important;outline:1px dashed currentColor"
		: "display:none!important";

	walk(tree, (node) => {
		if (!KEY.test(node.key)) return;
		const selector = selectorFor(node);
		const desktop = declarations(node.style.desktop, node);
		const advanced: AdvancedValues | undefined = node.style.advanced;
		const zIndex = cssZIndex(advanced?.zIndex);
		if (zIndex !== null) desktop.push(`position:relative`, `z-index:${zIndex}`);
		if (desktop.length > 0) base.push(`${selector}{${desktop.join(";")}}`);
		for (const breakpoint of ["tablet", "mobile"] as const) {
			const rules = declarations(node.style[breakpoint], node);
			if (rules.length > 0) media[breakpoint].push(`${selector}{${rules.join(";")}}`);
		}

		const hide = advanced?.hide;
		if (hide?.desktop) base.push(`@media (min-width:${BREAKPOINT_MAX.tablet + 1}px){${selector}{${hidden}}}`);
		if (hide?.tablet) {
			base.push(
				`@media (max-width:${BREAKPOINT_MAX.tablet}px) and (min-width:${BREAKPOINT_MAX.mobile + 1}px){${selector}{${hidden}}}`,
			);
		}
		if (hide?.mobile) base.push(`@media (max-width:${BREAKPOINT_MAX.mobile}px){${selector}{${hidden}}}`);
	});

	const css = [
		...base,
		media.tablet.length ? `@media (max-width:${BREAKPOINT_MAX.tablet}px){${media.tablet.join("")}}` : "",
		media.mobile.length ? `@media (max-width:${BREAKPOINT_MAX.mobile}px){${media.mobile.join("")}}` : "",
	].join("");
	// Belt and braces: nothing above can produce `<`, and it must stay that way.
	return css.replace(/</g, "");
}

/** `id` and `class` for a node's element, from its validated Extra settings. */
export function elementAttributes(node: BuilderNode): { id?: string; classes: string[] } {
	const advanced = node.style?.advanced;
	const id = advanced?.cssId && CSS_IDENT.test(advanced.cssId) ? advanced.cssId : undefined;
	const classes = (advanced?.cssClasses ?? "")
		.split(/\s+/)
		.filter((name) => CSS_IDENT.test(name));
	return { id, classes };
}

/**
 * The builder's base stylesheet: the rules that make the generated markup look
 * like a layout, independent of any node's own styles.
 *
 * Shared by `BuilderLayout.astro` (the site render) and the editor's blob
 * canvas for templates (`LiveCanvas`), which has no site stylesheet of its own.
 * Keep it free of site tokens so it works anywhere: the site's tokens are
 * optional (`var(--x, fallback)`).
 */
export const BASE_CSS = `
.bd-wrap, [data-bd-key] { display: contents; }
.bd-element { display: block; }
.bd-container { display: flex; flex-direction: column; }
.bd-container[data-direction="row"] { flex-direction: row; flex-wrap: wrap; }
.bd-container[data-gap="none"] { gap: 0; }
.bd-container[data-gap="sm"] { gap: 0.5rem; }
.bd-container[data-gap="md"] { gap: 1rem; }
.bd-container[data-gap="lg"] { gap: 2rem; }

[data-bd-type="heading"] h1,
[data-bd-type="heading"] h2,
[data-bd-type="heading"] h3,
[data-bd-type="heading"] h4,
[data-bd-type="heading"] h5,
[data-bd-type="heading"] h6 { margin: 0 0 0.5rem; font-weight: var(--font-weight-display, 800); line-height: 1.15; }
[data-bd-type="heading"] h1 { font-size: var(--font-size-5xl, 3rem); }
[data-bd-type="heading"] h2 { font-size: var(--font-size-4xl, 2.25rem); }
[data-bd-type="heading"] h3 { font-size: var(--font-size-3xl, 1.875rem); }
[data-bd-type="heading"] h4 { font-size: var(--font-size-2xl, 1.5rem); }
[data-bd-type="heading"] h5 { font-size: var(--font-size-xl, 1.25rem); }
[data-bd-type="heading"] h6 { font-size: var(--font-size-lg, 1.125rem); }

[data-bd-type="text"] p { margin: 0; line-height: 1.7; color: var(--color-text, inherit); }

[data-bd-type="image"] { display: inline-block; vertical-align: middle; }
[data-bd-type="image"] img { display: block; max-width: 100%; height: auto; border-radius: var(--radius, 10px); }
[data-bd-type="image"][data-bd-width="100%"] { width: 100%; }
[data-bd-type="image"][data-bd-object-fit="contain"] img { object-fit: contain; }
[data-bd-type="image"][data-bd-object-fit="cover"] img { object-fit: cover; }
[data-bd-type="image"][data-bd-object-fit="fill"] img { object-fit: fill; }

[data-bd-type="button"] { display: inline-block; }
[data-bd-type="button"] a { display: inline-flex; align-items: center; justify-content: center; padding: 0.625rem 1.5rem; font-size: var(--font-size-sm, 0.875rem); font-weight: 600; line-height: 1; color: var(--color-on-brand, #fff); background: var(--gradient-brand-strong, #6366f1); border: none; border-radius: var(--radius, 10px); text-decoration: none; cursor: pointer; transition: opacity 0.15s ease; }
[data-bd-type="button"] a:hover { opacity: 0.9; }

[data-bd-type="divider"] hr { margin: 0; border: none; height: 2px; background: var(--color-border, #e5e7eb); }
[data-bd-divider-thickness="sm"][data-bd-type="divider"] hr { height: 1px; }
[data-bd-divider-thickness="md"][data-bd-type="divider"] hr { height: 2px; }
[data-bd-divider-thickness="lg"][data-bd-type="divider"] hr { height: 4px; }
[data-bd-divider-color="brand"][data-bd-type="divider"] hr { background: var(--color-brand, #6366f1); }
[data-bd-divider-color="accent"][data-bd-type="divider"] hr { background: var(--color-accent, #f472b6); }
[data-bd-divider-color="muted"][data-bd-type="divider"] hr { background: var(--color-muted, #9ca3af); }
[data-bd-divider-style="dashed"][data-bd-type="divider"] hr { border-top: 2px dashed var(--color-border, #e5e7eb); background: none; }
[data-bd-divider-style="dotted"][data-bd-type="divider"] hr { border-top: 2px dotted var(--color-border, #e5e7eb); background: none; }

[data-bd-edit] .bd-element[data-bd-missing] > * { display: none !important; }
[data-bd-edit] .bd-element[data-bd-missing]::before { content: attr(data-bd-missing); display: block; margin: 1rem; padding: 1.5rem; border: 2px dashed #f59e0b; border-radius: 8px; color: #b45309; background: #fffbeb; font: 600 14px/1.4 system-ui, sans-serif; text-align: center; }
[data-bd-edit] .bd-container:empty { min-height: 64px; outline: 1px dashed color-mix(in srgb, currentColor 30%, transparent); outline-offset: -1px; }
`.trim();
