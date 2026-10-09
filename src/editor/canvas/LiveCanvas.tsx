/**
 * Live canvas: the real page, in an iframe.
 *
 * Replaces the Shadow DOM canvas. The iframe loads the entry's preview URL, so
 * it shows the DRAFT rendered by the site itself (its header, its content
 * blocks, its CSS) through `BuilderLayout.astro`. `?_builder` puts that render
 * in edit mode.
 *
 * - Unsaved edits are projected onto the iframe DOM by `applyTree`.
 * - Clicking selects the innermost node; selection and hover are drawn as
 *   overlays inside the iframe document.
 * - Links and forms do not navigate while editing.
 * - Cmd/Ctrl+S/Z/Y typed inside the iframe reach the shell's shortcuts.
 * - Every load asks for a fresh preview URL: tokens expire (1h by default).
 *
 * Same origin: the admin reads `iframe.contentDocument` directly.
 */

import * as React from "react";
import { getPreviewUrl } from "@emdash-cms/admin";

import type { BuilderNode, BuilderTree, Breakpoint } from "../store/tree";
import { ancestorsOf, findNode } from "../store/tree";
import {
	attachFrameDrop,
	resolveAt,
	beginDrag,
	currentDragPayload,
	endDrag,
	useDragState,
	type DragPayload,
	type DropTarget,
	type FrameDropLine,
} from "../dnd/index";
import { generateCss, pageCssText } from "../../render/styles";
import { elementShortcut, type ElementShortcut } from "../context-menu/shortcuts";
import { applyStyles, applyTree, markMissing, nodeRect, readTokens } from "./live-dom";

interface LiveCanvasProps {
	collection: string;
	entryId: string;
	tree: BuilderTree;
	/** The page's custom CSS, applied after the generated styles. */
	pageCss: string;
	/** Placed blocks whose type is not available: block key → label. */
	missing: ReadonlyMap<string, string>;
	breakpoint: Breakpoint;
	selectedKey: string | null;
	onSelect: (key: string | null) => void;
	/** Inline text edit of a content block field, typed in the preview. */
	onEditContent: (blockKey: string, field: string, value: unknown) => void;
	/** A drop inside the preview: from the palette or a node's handle. */
	onDropPayload: (payload: DragPayload, target: DropTarget) => void;
	/**
	 * A "+" in the preview: open the elements panel so the next element lands
	 * at `target`. `select` is the node to select alongside (an empty container).
	 */
	onRequestInsert: (target: DropTarget, select?: string) => void;
	/**
	 * The "+" on a container's hover tab: a new empty container at `target`
	 * (above the hovered one), as Elementor makes space for a new container.
	 */
	onAddContainer: (target: DropTarget) => void;
	/** The "×" on a container's hover tab. */
	onRemove: (key: string) => void;
	/** Right-click on a node (or the Menu key): its context menu, at a point of the admin's viewport. */
	onContextMenu: (key: string, x: number, y: number) => void;
	/** An element shortcut typed while focus is inside the preview. */
	onShortcut: (action: ElementShortcut) => void;
	/** Content blocks with pending edits applied: what the preview must show. */
	contentBlocks: ReadonlyArray<{ _key: string; _type: string }>;
	/** Content blocks as stored: what the server render of the draft shows. */
	storedContent: ReadonlyArray<{ _key: string; _type: string }>;
	/** Bumped by the shell after a save: the iframe reloads the server render. */
	reloadToken: number;
	/** The site's design tokens, read from the page once it loads. */
	onTokens?: (tokens: string[]) => void;
	/** Label drawn on the selection badge. */
	labelFor: (node: BuilderNode) => string;
	/** Pre-resolved strings, so this component needs no i18n provider. */
	strings: {
		loading: string;
		failed: string;
		/** The end-of-page placeholder's text ("Drag widget here"). */
		dropHere: string;
		/** "+" buttons: add an element. */
		add: string;
		/** The hover tab's "+": add a container above. */
		addContainer: string;
		/** The hover tab's drag handle. */
		move: string;
		/** The hover tab's "×". */
		remove: string;
		/** The "×" after one click: click again to delete. */
		confirmRemove: string;
	};
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Inline icons for the canvas chrome, drawn with `currentColor`. */
const ICONS = {
	plus: "M8 3v10M3 8h10",
	grip: "M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01",
	close: "M4 4l8 8M12 4l-8 8",
} as const;

function icon(doc: Document, name: keyof typeof ICONS): SVGSVGElement {
	const svg = doc.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 16 16");
	svg.setAttribute("aria-hidden", "true");
	const path = doc.createElementNS(SVG_NS, "path");
	path.setAttribute("d", ICONS[name]);
	svg.appendChild(path);
	return svg;
}

/** Chrome the editor adds to the page: never a node, never a selection. */
const CHROME = "#bd-overlay, #bd-appender";

function inChrome(target: EventTarget | null): boolean {
	// The node lives in the iframe's realm: check the shape, not `instanceof`.
	const el = target as Element | null;
	return !!el && typeof el.closest === "function" && el.closest(CHROME) !== null;
}

/** The container a hover over `key` belongs to: the node itself or its nearest container ancestor. */
function containerAround(tree: BuilderTree, key: string): BuilderNode | null {
	const node = findNode(tree, key);
	if (!node) return null;
	if (node.type === "container") return node;
	const chain = ancestorsOf(tree, key);
	for (let i = chain.length - 1; i >= 0; i--) {
		if (chain[i]!.type === "container") return chain[i]!;
	}
	return null;
}

/** Where `node` sits: its parent and its index among its siblings. */
function slotOf(tree: BuilderTree, node: BuilderNode): DropTarget {
	const siblings = node.parent === null ? tree : (findNode(tree, node.parent)?.children ?? []);
	return { parentKey: node.parent, index: Math.max(0, siblings.findIndex((sibling) => sibling.key === node.key)) };
}

/**
 * Preview viewport per device. Desktop fills the canvas but never drops below
 * a real desktop width: on a small window the page keeps its desktop layout
 * and the canvas scrolls horizontally, instead of turning responsive.
 */
const VIEWPORTS: Record<Breakpoint, React.CSSProperties> = {
	desktop: { width: "100%", minWidth: 1280 },
	tablet: { width: 768 },
	mobile: { width: 390 },
};

const OVERLAY_CSS = `
#bd-overlay { position: absolute; inset: 0 auto auto 0; pointer-events: none; z-index: 2147483647; }
#bd-overlay .bd-box { position: absolute; border-radius: 4px; transition: all .08s ease-out; }
#bd-overlay .bd-hover { outline: 1px dashed #6366f1; outline-offset: -1px; }
#bd-overlay .bd-selected { outline: 2px solid #2563eb; outline-offset: -2px; }
#bd-overlay .bd-badge { position: absolute; transform: translateY(-100%); padding: 2px 8px; font: 600 11px/1.6 system-ui, sans-serif; color: #fff; background: #2563eb; border-radius: 4px 4px 0 0; white-space: nowrap; pointer-events: auto; cursor: grab; user-select: none; }
#bd-drop-line { position: absolute; height: 4px; border-radius: 2px; background: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, .25); pointer-events: none; z-index: 2147483647; display: none; }
[data-bd-edit] a, [data-bd-edit] button { cursor: default; }
/* Container hover tab: "+" (add above), drag handle, "×". Sits inside the
   container's top edge, so the pointer reaches it without leaving the container. */
#bd-overlay .bd-tab { all: unset; position: absolute; transform: translateX(-50%); display: flex; gap: 2px; padding: 2px 10px; background: #2563eb; color: #fff; border-radius: 0 0 8px 8px; pointer-events: auto; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
#bd-overlay .bd-tab-button { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 22px; height: 20px; border-radius: 4px; cursor: pointer; }
#bd-overlay .bd-tab-button:hover { background: rgba(255,255,255,.2); }
#bd-overlay .bd-tab-button.bd-tab-grip { cursor: grab; }
#bd-overlay .bd-tab-button.bd-tab-confirm { display: flex; align-items: center; white-space: nowrap; width: auto; gap: 4px; padding: 0 6px; background: #dc2626; font: 600 11px/1 system-ui, sans-serif; }
#bd-overlay .bd-tab-button.bd-tab-confirm:hover { background: #b91c1c; }
#bd-overlay svg, #bd-appender svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; }
/* While dragging, the canvas chrome must not swallow the drop. */
[data-bd-dragging] #bd-overlay * { pointer-events: none !important; }
/* End-of-page placeholder, as in Elementor: drop here, or "+" to add. */
#bd-appender { all: unset; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; margin: 24px; min-height: 160px; padding: 24px; border: 2px dashed rgba(148,163,184,.6); border-radius: 6px; background: rgba(148,163,184,.06); color: rgb(148,163,184); font: italic 400 15px/1.4 system-ui, sans-serif; }
#bd-appender.bd-appender-over { border-color: #2563eb; background: rgba(37,99,235,.08); }
#bd-appender .bd-appender-add { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: rgba(148,163,184,.25); color: inherit; cursor: pointer; }
#bd-appender .bd-appender-add:hover { background: #2563eb; color: #fff; }
#bd-appender .bd-appender-add:focus-visible, #bd-overlay .bd-tab-button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
#bd-appender .bd-appender-add svg { width: 20px; height: 20px; }
#bd-appender p { all: unset; }
/* An empty container shows where to click to add into it. */
[data-bd-edit] .bd-container:empty::after { content: "+"; display: flex; align-items: center; justify-content: center; width: 100%; min-height: 64px; font: 300 28px/1 system-ui, sans-serif; color: color-mix(in srgb, currentColor 45%, transparent); cursor: pointer; }
[data-bd-editing] { outline: 2px dashed #2563eb; outline-offset: 2px; cursor: text; }
/* EmDash's own floating edit toolbar competes with the builder's selection. */
#emdash-toolbar { display: none !important; }
`;

export function LiveCanvas({
	collection,
	entryId,
	tree,
	pageCss,
	missing,
	breakpoint,
	selectedKey,
	onSelect,
	onDropPayload,
	onRequestInsert,
	onAddContainer,
	onRemove,
	onContextMenu,
	onShortcut,
	onEditContent,
	contentBlocks,
	storedContent,
	reloadToken,
	onTokens,
	labelFor,
	strings,
}: LiveCanvasProps): React.JSX.Element {
	const frameRef = React.useRef<HTMLIFrameElement | null>(null);
	const [src, setSrc] = React.useState<string | null>(null);
	const [failed, setFailed] = React.useState(false);
	const [loadedAt, setLoadedAt] = React.useState(0);
	const hoverKey = React.useRef<string | null>(null);
	// The container whose "×" was clicked once and awaits the confirming click.
	const confirmKey = React.useRef<string | null>(null);
	const confirmTimer = React.useRef<number | undefined>(undefined);

	// What each content block currently looks like in the preview, as JSON:
	// starts as the stored draft on every load, then follows each re-render.
	const rendered = React.useRef(new Map<string, string>());

	const onTokensRef = React.useRef(onTokens);
	onTokensRef.current = onTokens;
	const storedRef = React.useRef(storedContent);
	storedRef.current = storedContent;

	// Latest values for the listeners attached to the iframe document.
	const latest = React.useRef({
		tree,
		pageCss,
		missing,
		selectedKey,
		onSelect,
		labelFor,
		onDropPayload,
		onRequestInsert,
		onAddContainer,
		onRemove,
		onContextMenu,
		onShortcut,
		onEditContent,
		contentBlocks,
		strings,
	});
	latest.current = {
		tree,
		pageCss,
		missing,
		selectedKey,
		onSelect,
		labelFor,
		onDropPayload,
		onRequestInsert,
		onAddContainer,
		onRemove,
		onContextMenu,
		onShortcut,
		onEditContent,
		contentBlocks,
		strings,
	};

	// The text element being edited in place, if any. While it is active the
	// block is not re-rendered, so the caret is never lost mid-typing.
	const inline = React.useRef<{ blockKey: string; el: HTMLElement; stop: () => void } | null>(null);
	const [inlineEndedAt, setInlineEndedAt] = React.useState(0);

	// A fresh preview URL per load: an expired token would silently fall back
	// to the published page. Templates are not routable, so their preview is a
	// route the site provides: `/templates/<id>/preview`, which renders their
	// layout with the site's header, footer and styles.
	React.useEffect(() => {
		let cancelled = false;
		setFailed(false);
		if (collection === "templates") {
			// With an id: that template's draft. Without: the blank canvas for a
			// new one, so the builder has the site chrome and an empty <main> to
			// drop widgets into (instead of hanging on "loading").
			const query = entryId ? `id=${encodeURIComponent(entryId)}&` : "";
			setSrc(`/template-preview?${query}_builder=1&_draft=1`);
			return;
		}
		getPreviewUrl(collection, entryId)
			.then((preview) => {
				if (cancelled) return;
				if (!preview?.url) {
					setFailed(true);
					return;
				}
				const url = new URL(preview.url, window.location.origin);
				url.searchParams.set("_builder", "1");
				url.searchParams.set("_draft", "1");
				setSrc(url.toString());
			})
			.catch(() => !cancelled && setFailed(true));
		return () => {
			cancelled = true;
		};
	}, [collection, entryId, reloadToken]);

	const drawOverlay = React.useCallback(() => {
		const doc = frameRef.current?.contentDocument;
		if (!doc?.body) return;
		// Mid-drag the handle is the drag source: rebuilding it would abort
		// the drag. The overlay catches up on the next change.
		if (currentDragPayload()) return;
		let overlay = doc.getElementById("bd-overlay");
		if (!overlay) {
			overlay = doc.createElement("div");
			overlay.id = "bd-overlay";
			doc.body.appendChild(overlay);
		}
		overlay.replaceChildren();
		const scrollX = doc.defaultView?.scrollX ?? 0;
		const scrollY = doc.defaultView?.scrollY ?? 0;

		const dragHandle = (el: HTMLElement, key: string) => {
			el.draggable = true;
			el.addEventListener("dragstart", (event) => {
				beginDrag({ kind: "existing", nodeKey: key });
				event.dataTransfer?.setData("text/plain", key);
				if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
			});
			el.addEventListener("dragend", () => {
				endDrag();
				drawOverlay();
			});
		};

		/**
		 * The hover tab's grip: a drag driven by mouse events, not native drag
		 * and drop (which does not reliably start from the overlay inside the
		 * iframe). Same targets and insertion line as a native drop; Esc cancels.
		 */
		const pointerHandle = (el: HTMLElement, key: string) => {
			el.addEventListener("mousedown", (down) => {
				if (down.button !== 0) return;
				down.preventDefault();
				const win = doc.defaultView;
				const line = doc.getElementById("bd-drop-line");
				const payload: DragPayload = { kind: "existing", nodeKey: key };
				let active = false;
				let target: DropTarget | null = null;

				const finish = (drop: boolean) => {
					doc.removeEventListener("mousemove", onMove);
					doc.removeEventListener("mouseup", onUp);
					doc.removeEventListener("keydown", onKey);
					doc.documentElement.style.removeProperty("cursor");
					if (!active) return;
					// The mouseup's click would select whatever sits under the drop.
					const swallow = (event: Event) => {
						event.preventDefault();
						event.stopPropagation();
					};
					win?.addEventListener("click", swallow, { capture: true, once: true });
					setTimeout(() => win?.removeEventListener("click", swallow, { capture: true }), 0);
					if (drop && target) latest.current.onDropPayload(payload, target);
					endDrag();
				};
				const onMove = (event: MouseEvent) => {
					if (!active) {
						if (Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < 4) return;
						active = true;
						beginDrag(payload);
						// Hit tests must see the page, not the overlay.
						doc.documentElement.setAttribute("data-bd-dragging", "");
						doc.documentElement.style.cursor = "grabbing";
					}
					const at = resolveAt(doc, event.clientX, event.clientY, latest.current.tree);
					target = at?.target ?? null;
					if (!line) return;
					if (!at) {
						line.style.display = "none";
						return;
					}
					Object.assign(line.style, {
						display: "block",
						top: `${at.line.top}px`,
						left: `${at.line.left}px`,
						width: `${at.line.width}px`,
					});
				};
				const onUp = () => finish(true);
				const onKey = (event: KeyboardEvent) => {
					if (event.key === "Escape") finish(false);
				};
				doc.addEventListener("mousemove", onMove);
				doc.addEventListener("mouseup", onUp);
				doc.addEventListener("keydown", onKey);
			});
		};

		const box = (key: string | null, className: string, badge?: string, handle?: boolean) => {
			if (!key) return;
			const wrapper = doc.querySelector(`[data-bd-key="${CSS.escape(key)}"]`);
			const rect = wrapper && nodeRect(wrapper);
			if (!rect) return;
			const el = doc.createElement("div");
			el.className = `bd-box ${className}`;
			Object.assign(el.style, {
				top: `${rect.top + scrollY}px`,
				left: `${rect.left + scrollX}px`,
				width: `${rect.width}px`,
				height: `${rect.height}px`,
			});
			overlay!.appendChild(el);
			if (badge) {
				const tag = doc.createElement("div");
				tag.className = "bd-badge";
				tag.textContent = badge;
				if (handle && key) {
					// The badge is the node's drag handle, as in Elementor.
					dragHandle(tag, key);
					tag.title = "Drag to move";
				}
				Object.assign(tag.style, {
					top: `${Math.max(rect.top + scrollY, 18)}px`,
					left: `${rect.left + scrollX}px`,
				});
				overlay!.appendChild(tag);
			}
		};

		const { tree: currentTree, selectedKey: selected, labelFor: label } = latest.current;
		if (hoverKey.current !== selected) box(hoverKey.current, "bd-hover");
		const selectedNode = selected ? findNode(currentTree, selected) : null;
		box(selected, "bd-selected", selectedNode ? label(selectedNode) : undefined, true);

		// The hovered container's tab, as in Elementor: "+" makes a new empty
		// container above it, the grip drags it, "×" removes it. Mouse-only:
		// the overlay is rebuilt on every move, so it cannot hold focus.
		const container = hoverKey.current ? containerAround(currentTree, hoverKey.current) : null;
		if (confirmKey.current && confirmKey.current !== container?.key) confirmKey.current = null;
		const wrapper = container && doc.querySelector(`[data-bd-key="${CSS.escape(container.key)}"]`);
		const rect = wrapper && nodeRect(wrapper);
		if (container && rect) {
			const { strings: text } = latest.current;
			const tab = doc.createElement("div");
			tab.className = "bd-tab";
			Object.assign(tab.style, {
				top: `${rect.top + scrollY}px`,
				left: `${rect.left + scrollX + rect.width / 2}px`,
			});
			const button = (name: keyof typeof ICONS, label: string) => {
				const el = doc.createElement("button");
				el.type = "button";
				el.className = "bd-tab-button";
				el.title = label;
				el.setAttribute("aria-label", label);
				el.appendChild(icon(doc, name));
				tab.appendChild(el);
				return el;
			};
			button("plus", text.addContainer).addEventListener("click", () => {
				hoverKey.current = null;
				latest.current.onAddContainer(slotOf(latest.current.tree, container));
			});
			const grip = button("grip", text.move);
			grip.classList.add("bd-tab-grip");
			pointerHandle(grip, container.key);
			// "×" asks first: the first click turns it into "Delete?", a second
			// click removes. Moving to another container or waiting cancels.
			const close = button("close", text.remove);
			if (confirmKey.current === container.key) {
				close.classList.add("bd-tab-confirm");
				close.title = text.confirmRemove;
				close.setAttribute("aria-label", text.confirmRemove);
				close.append(text.confirmRemove);
			}
			close.addEventListener("click", () => {
				window.clearTimeout(confirmTimer.current);
				if (confirmKey.current !== container.key) {
					confirmKey.current = container.key;
					confirmTimer.current = window.setTimeout(() => {
						confirmKey.current = null;
						drawOverlay();
					}, 4000);
					drawOverlay();
					return;
				}
				confirmKey.current = null;
				hoverKey.current = null;
				latest.current.onRemove(container.key);
			});
			overlay.appendChild(tab);
		}
	}, []);

	/**
	 * The end-of-page placeholder: kept as the last child of <main> after every
	 * projection of the tree. Added by the editor only, so the public render
	 * never has it. Drops on it land at the end of the page (frame-drop resolves
	 * any non-node target inside <main> to the root's end).
	 */
	const ensureAppender = React.useCallback((doc: Document) => {
		const main = doc.querySelector("main[data-bd-main]");
		if (!main) return;
		let appender = doc.getElementById("bd-appender");
		if (!appender) {
			const { strings: text } = latest.current;
			appender = doc.createElement("div");
			appender.id = "bd-appender";
			const add = doc.createElement("button");
			add.type = "button";
			add.className = "bd-appender-add";
			add.title = text.add;
			add.setAttribute("aria-label", text.add);
			add.appendChild(icon(doc, "plus"));
			add.addEventListener("click", () => {
				latest.current.onRequestInsert({ parentKey: null, index: latest.current.tree.length });
			});
			const hint = doc.createElement("p");
			hint.textContent = text.dropHere;
			appender.append(add, hint);
			const el = appender;
			el.addEventListener("dragover", () => el.classList.add("bd-appender-over"));
			el.addEventListener("dragleave", (event) => {
				if (!el.contains(event.relatedTarget as Node | null)) el.classList.remove("bd-appender-over");
			});
			el.addEventListener("drop", () => el.classList.remove("bd-appender-over"));
		}
		if (main.lastElementChild !== appender) main.appendChild(appender);
	}, []);

	// Wire the iframe document once per load.
	const handleLoad = React.useCallback(() => {
		const frame = frameRef.current;
		const doc = frame?.contentDocument;
		const win = frame?.contentWindow;
		if (!doc || !win) return;

		// Not a builder render (no layout, 404, expired token): say so.
		if (!doc.querySelector("[data-bd-root]")) {
			setFailed(true);
			return;
		}

		const style = doc.createElement("style");
		style.textContent = OVERLAY_CSS;
		doc.head.appendChild(style);

		const keyAt = (target: EventTarget | null): string | null => {
			// The node lives in the iframe's realm, so `instanceof Element` from
			// this window would be false: check the shape instead.
			const el = target as Element | null;
			if (!el || typeof el.closest !== "function") return null;
			// Inside an embedded template, the element to select is the
			// reference itself: the template's own nodes are edited in the template.
			const embedded = el.closest('[data-bd-type="template_ref"]');
			if (embedded) return embedded.getAttribute("data-bd-key");
			return el.closest("[data-bd-key]")?.getAttribute("data-bd-key") ?? null;
		};

		/**
		 * The element showing one text field of a content block: an explicit
		 * `data-bd-field` when the component declares it, else the innermost
		 * element under the pointer whose text is exactly a field's value.
		 * No change to the site's components is required.
		 */
		const fieldAt = (
			target: Element,
		): { blockKey: string; field: string; el: HTMLElement } | null => {
			const wrapper = target.closest("[data-bd-ref]");
			const blockKey = wrapper?.getAttribute("data-bd-ref");
			if (!wrapper || !blockKey) return null;
			const block = latest.current.contentBlocks.find((candidate) => candidate._key === blockKey) as
				| Record<string, unknown>
				| undefined;
			if (!block) return null;

			const declared = target.closest<HTMLElement>("[data-bd-field]");
			if (declared && wrapper.contains(declared)) {
				return { blockKey, field: declared.getAttribute("data-bd-field")!, el: declared };
			}

			const texts = Object.entries(block).filter(
				([field, value]) => !field.startsWith("_") && typeof value === "string" && value.trim() !== "",
			) as Array<[string, string]>;
			for (let el: Element | null = target; el && el !== wrapper; el = el.parentElement) {
				const text = (el.textContent ?? "").trim();
				const match = texts.find(([, value]) => value.trim() === text);
				if (match) return { blockKey, field: match[0], el: el as HTMLElement };
			}
			return null;
		};

		const startInline = (
			hit: { blockKey: string; field: string; el: HTMLElement },
			x: number,
			y: number,
		) => {
			if (inline.current?.el === hit.el) return;
			inline.current?.stop();
			const { el, blockKey, field } = hit;
			el.setAttribute("contenteditable", "plaintext-only");
			el.setAttribute("data-bd-editing", "");
			el.focus();
			// Caret where the user clicked.
			const range = doc.caretRangeFromPoint?.(x, y);
			if (range) {
				const selection = win.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
			}
			const onInput = () => latest.current.onEditContent(blockKey, field, el.innerText);
			const onKey = (event: KeyboardEvent) => {
				// Enter or Esc finish; Shift+Enter keeps a line break.
				if ((event.key === "Enter" && !event.shiftKey) || event.key === "Escape") {
					event.preventDefault();
					el.blur();
				}
			};
			const stop = () => {
				el.removeEventListener("input", onInput);
				el.removeEventListener("keydown", onKey);
				el.removeEventListener("blur", stop);
				el.removeAttribute("contenteditable");
				el.removeAttribute("data-bd-editing");
				if (inline.current?.el === el) inline.current = null;
				// Let the site re-render the block with the final value.
				setInlineEndedAt(Date.now());
			};
			el.addEventListener("input", onInput);
			el.addEventListener("keydown", onKey);
			el.addEventListener("blur", stop);
			inline.current = { blockKey, el, stop };
		};

		doc.addEventListener(
			"click",
			(event) => {
				// Editing, not browsing: nothing in the page navigates or submits.
				// The editor's own chrome (hover tab, placeholder) handles its clicks.
				if (inChrome(event.target)) return;
				event.preventDefault();
				event.stopPropagation();
				const target = event.target as Element | null;
				if (inline.current && target && inline.current.el.contains(target)) return;
				const key = keyAt(target);
				// An empty container's "+": select it and open the elements panel
				// to add into it.
				const emptyBox =
					target && typeof target.matches === "function" && target.matches(".bd-container:empty")
						? target.getAttribute("data-bd-container")
						: null;
				if (emptyBox) {
					inline.current?.stop();
					latest.current.onRequestInsert({ parentKey: emptyBox, index: 0 }, emptyBox);
					return;
				}
				latest.current.onSelect(key);
				// A click on a text field edits it in place, as in Elementor.
				const hit = target && typeof target.closest === "function" ? fieldAt(target) : null;
				if (hit) startInline(hit, event.clientX, event.clientY);
				else inline.current?.stop();
			},
			true,
		);
		doc.addEventListener("submit", (event) => event.preventDefault(), true);
		doc.addEventListener("mouseover", (event) => {
			// Reaching the hover tab keeps its container hovered.
			if (inChrome(event.target)) return;
			const key = keyAt(event.target);
			if (key !== hoverKey.current) {
				hoverKey.current = key;
				drawOverlay();
			}
		});
		doc.addEventListener("mouseleave", () => {
			hoverKey.current = null;
			drawOverlay();
		});

		// Shortcuts typed inside the iframe go to the shell.
		// A point of the iframe, in the admin's viewport.
		const toAdmin = (x: number, y: number) => {
			const rect = frame.getBoundingClientRect();
			return { x: rect.left + x, y: rect.top + y };
		};

		// Right-click on a node: the element's context menu. Cmd+right-click (the
		// Mac's Ctrl+click IS a right-click) and text being edited keep the
		// browser's own menu.
		doc.addEventListener("contextmenu", (event) => {
			if (event.metaKey) return;
			const target = event.target as Element | null;
			if (inline.current && target && inline.current.el.contains(target)) return;
			if (inChrome(target)) return;
			const key = keyAt(target);
			if (!key) return;
			event.preventDefault();
			inline.current?.stop();
			const at = toAdmin(event.clientX, event.clientY);
			latest.current.onContextMenu(key, at.x, at.y);
		});

		// Element shortcuts, decided HERE: the inline edit and the page's text
		// selection live in this document, not in the shell's.
		doc.addEventListener("keydown", (event) => {
			const active = doc.activeElement as HTMLElement | null;
			const editing =
				!!inline.current ||
				!!active?.isContentEditable ||
				["INPUT", "TEXTAREA", "SELECT"].includes(active?.tagName ?? "");
			const selected = latest.current.selectedKey;
			if (!editing && selected && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
				event.preventDefault();
				const wrapper = doc.querySelector(`[data-bd-key="${CSS.escape(selected)}"]`);
				const rect = wrapper && nodeRect(wrapper);
				const at = toAdmin(rect ? rect.left + 8 : 8, rect ? rect.top + 8 : 8);
				latest.current.onContextMenu(selected, at.x, at.y);
				return;
			}
			const action = elementShortcut(event, editing, win.getSelection());
			if (action) {
				if (!selected) return;
				event.preventDefault();
				latest.current.onShortcut(action);
				return;
			}
		});

		doc.addEventListener("keydown", (event) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			if (!["s", "z", "y"].includes(event.key)) return;
			event.preventDefault();
			// Undo/redo/save act on the store: finish the inline edit first so
			// the block re-renders from the store's value.
			inline.current?.stop();
			window.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: event.key,
					metaKey: event.metaKey,
					ctrlKey: event.ctrlKey,
					shiftKey: event.shiftKey,
				}),
			);
		});

		// Drops inside the page: from the palette, or a node's handle.
		let dropLine = doc.getElementById("bd-drop-line");
		if (!dropLine) {
			dropLine = doc.createElement("div");
			dropLine.id = "bd-drop-line";
			doc.body.appendChild(dropLine);
		}
		const line = dropLine;
		attachFrameDrop(doc, {
			getTree: () => latest.current.tree,
			onDrop: (payload, target) => latest.current.onDropPayload(payload, target),
			onLine: (at: FrameDropLine | null) => {
				if (!at) {
					line.style.display = "none";
					return;
				}
				Object.assign(line.style, {
					display: "block",
					top: `${at.top}px`,
					left: `${at.left}px`,
					width: `${at.width}px`,
				});
			},
		});

		win.addEventListener("scroll", drawOverlay, { passive: true });
		win.addEventListener("resize", drawOverlay);

		applyTree(doc, latest.current.tree);
		ensureAppender(doc);
		markMissing(doc, latest.current.missing);
		applyStyles(
			doc,
			generateCss(latest.current.tree, { edit: true }) + pageCssText(latest.current.pageCss),
		);
		onTokensRef.current?.(readTokens(doc));
		rendered.current = new Map(storedRef.current.map((block) => [block._key, JSON.stringify(block)]));
		setFailed(false);
		setLoadedAt(Date.now());
	}, [drawOverlay, ensureAppender]);

	// A drag that ends anywhere (drop, Esc, outside) hides the insertion line
	// and lets the selection overlay catch up.
	const { payload: dragging } = useDragState();
	React.useEffect(() => {
		const doc = frameRef.current?.contentDocument;
		// Mid-drag the canvas chrome lets drops through (see OVERLAY_CSS).
		doc?.documentElement.toggleAttribute("data-bd-dragging", !!dragging);
		if (dragging) return;
		const line = doc?.getElementById("bd-drop-line");
		if (line) line.style.display = "none";
		doc?.getElementById("bd-appender")?.classList.remove("bd-appender-over");
		drawOverlay();
	}, [dragging, drawOverlay]);

	// Content edits are drawn by the site itself: a block whose fields differ
	// from what the preview shows is re-rendered by the site's render route
	// and swapped in. Covers edits, undo/redo and reloads alike.
	React.useEffect(() => {
		if (!loadedAt) return;
		const timer = window.setTimeout(async () => {
			const doc = frameRef.current?.contentDocument;
			if (!doc) return;
			for (const block of contentBlocks) {
				// The block being typed into already shows its text.
				if (inline.current?.blockKey === block._key) continue;
				const json = JSON.stringify(block);
				if (rendered.current.get(block._key) === json) continue;
				rendered.current.set(block._key, json);
				try {
					const response = await fetch("/builder-render", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ block }),
					});
					if (!response.ok) continue;
					const html = await response.text();
					// A newer edit already went out for this block.
					if (rendered.current.get(block._key) !== json) continue;
					const wrapper = doc.querySelector(`[data-bd-ref="${CSS.escape(block._key)}"]`);
					if (wrapper) wrapper.innerHTML = html;
					drawOverlay();
				} catch {
					rendered.current.delete(block._key);
				}
			}
		}, 300);
		return () => window.clearTimeout(timer);
	}, [contentBlocks, loadedAt, inlineEndedAt, drawOverlay]);

	// Every tree change is projected onto the page, then the overlay redrawn.
	React.useEffect(() => {
		const doc = frameRef.current?.contentDocument;
		if (!doc || !loadedAt) return;
		applyTree(doc, tree);
		ensureAppender(doc);
		markMissing(doc, missing);
		applyStyles(doc, generateCss(tree, { edit: true }) + pageCssText(pageCss));
		drawOverlay();
	}, [tree, pageCss, missing, loadedAt, drawOverlay, ensureAppender]);

	// A template picked for a Template element shows right away, before Save:
	// its rendered markup and generated CSS are read from the site's template
	// preview route (the same render the server does) and placed in the
	// reference. Clicks inside still select the reference (see `keyAt`).
	const embedded = React.useRef(new Map<string, Promise<{ html: string; css: string } | null>>());
	React.useEffect(() => {
		const doc = frameRef.current?.contentDocument;
		if (!doc || !loadedAt) return;
		const refs: Array<{ key: string; refId: string }> = [];
		const visit = (nodes: BuilderTree) => {
			for (const node of nodes) {
				const refId = String(node.props.ref_id ?? "");
				if (node.type === "template_ref" && refId) refs.push({ key: node.key, refId });
				visit(node.children);
			}
		};
		visit(tree);
		let cancelled = false;
		for (const { key, refId } of refs) {
			const wrapper = doc.querySelector<HTMLElement>(`[data-bd-key="${CSS.escape(key)}"]`);
			if (!wrapper) continue;
			if (wrapper.getAttribute("data-template-id") === refId && wrapper.childElementCount > 0) continue;
			let load = embedded.current.get(refId);
			if (!load) {
				load = fetch(`/template-preview?id=${encodeURIComponent(refId)}&_builder=1&_draft=1`)
					.then((response) => (response.ok ? response.text() : null))
					.then((text) => {
						if (!text) return null;
						const page = new DOMParser().parseFromString(text, "text/html");
						const main = page.querySelector("main[data-bd-main]");
						if (!main) return null;
						return { html: main.innerHTML, css: page.getElementById("bd-styles")?.textContent ?? "" };
					})
					.catch(() => null);
				embedded.current.set(refId, load);
			}
			void load.then((result) => {
				if (cancelled || !result) return;
				// The node may have been re-pointed meanwhile.
				const current = findNode(latest.current.tree, key);
				if (!current || String(current.props.ref_id ?? "") !== refId) return;
				wrapper.innerHTML = result.html;
				wrapper.setAttribute("data-template-id", refId);
				wrapper.removeAttribute("data-bd-missing");
				const styleId = `bd-embedded-${refId}`;
				if (!doc.getElementById(styleId)) {
					const style = doc.createElement("style");
					style.id = styleId;
					// Same text the server writes into <style>; `<` is never part of it.
					style.textContent = result.css.replace(/</g, "");
					doc.head.appendChild(style);
				}
				drawOverlay();
			});
		}
		return () => {
			cancelled = true;
		};
	}, [tree, loadedAt, drawOverlay]);

	React.useEffect(() => {
		drawOverlay();
		if (!selectedKey) return;
		const doc = frameRef.current?.contentDocument;
		const wrapper = doc?.querySelector(`[data-bd-key="${CSS.escape(selectedKey)}"]`);
		const first = wrapper?.firstElementChild;
		// Selecting from the panel brings the element to the middle of the
		// preview, as Elementor's navigator does.
		first?.scrollIntoView?.({ block: "center", behavior: "smooth" });
	}, [selectedKey, drawOverlay]);

	return (
		<div className="flex h-full min-h-0 flex-col bg-kumo-canvas">
			{failed && (
				<p className="px-4 py-2 text-xs text-kumo-subtle" role="status">
					{strings.failed}
				</p>
			)}
			{!src && !failed && (
				<p className="px-4 py-2 text-xs text-kumo-subtle" role="status">
					{strings.loading}
				</p>
			)}
			{src && (
				// Horizontal scroll lives here; vertical scroll is the page's own,
				// inside the iframe.
				<div className="min-h-0 flex-1" style={{ overflowX: "auto", overflowY: "hidden" }}>
					<iframe
						ref={frameRef}
						key={src}
						src={src}
						title="Live preview"
						onLoad={handleLoad}
						className="border-0 bg-white"
						style={{
							...VIEWPORTS[breakpoint],
							display: "block",
							height: "100%",
							marginInline: "auto",
						}}
					/>
				</div>
			)}
		</div>
	);
}
