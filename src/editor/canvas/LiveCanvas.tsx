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
import { findNode } from "../store/tree";
import {
	attachFrameDrop,
	beginDrag,
	currentDragPayload,
	endDrag,
	useDragState,
	type DragPayload,
	type DropTarget,
	type FrameDropLine,
} from "../dnd/index";
import { generateCss, pageCssText } from "../../render/styles";
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
	strings: { loading: string; failed: string };
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
		onEditContent,
		contentBlocks,
	});
	latest.current = { tree, pageCss, missing, selectedKey, onSelect, labelFor, onDropPayload, onEditContent, contentBlocks };

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
					tag.draggable = true;
					tag.title = "Drag to move";
					tag.addEventListener("dragstart", (event) => {
						beginDrag({ kind: "existing", nodeKey: key });
						event.dataTransfer?.setData("text/plain", key);
						if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
					});
					tag.addEventListener("dragend", () => {
						endDrag();
						drawOverlay();
					});
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
				event.preventDefault();
				event.stopPropagation();
				const target = event.target as Element | null;
				if (inline.current && target && inline.current.el.contains(target)) return;
				latest.current.onSelect(keyAt(target));
				// A click on a text field edits it in place, as in Elementor.
				const hit = target && typeof target.closest === "function" ? fieldAt(target) : null;
				if (hit) startInline(hit, event.clientX, event.clientY);
				else inline.current?.stop();
			},
			true,
		);
		doc.addEventListener("submit", (event) => event.preventDefault(), true);
		doc.addEventListener("mouseover", (event) => {
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
		markMissing(doc, latest.current.missing);
		applyStyles(
			doc,
			generateCss(latest.current.tree, { edit: true }) + pageCssText(latest.current.pageCss),
		);
		onTokensRef.current?.(readTokens(doc));
		rendered.current = new Map(storedRef.current.map((block) => [block._key, JSON.stringify(block)]));
		setFailed(false);
		setLoadedAt(Date.now());
	}, [drawOverlay]);

	// A drag that ends anywhere (drop, Esc, outside) hides the insertion line
	// and lets the selection overlay catch up.
	const { payload: dragging } = useDragState();
	React.useEffect(() => {
		if (dragging) return;
		const line = frameRef.current?.contentDocument?.getElementById("bd-drop-line");
		if (line) line.style.display = "none";
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
		markMissing(doc, missing);
		applyStyles(doc, generateCss(tree, { edit: true }) + pageCssText(pageCss));
		drawOverlay();
	}, [tree, pageCss, missing, loadedAt, drawOverlay]);

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
