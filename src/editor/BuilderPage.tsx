/**
 * Builder page: the minimal shell.
 *
 * Timeline is deliberately small. This stage proves three things and nothing
 * else:
 *
 *   1. The workspace exists: a toolbar, a palette, a canvas.
 *   2. A container can be dragged in, nested and reordered.
 *   3. The tree round-trips through storage.
 *
 * There is no inspector, no styling engine and one single widget. Those arrive
 * once the skeleton is proven. If adding a widget later requires touching this
 * file, the skeleton is wrong.
 */

import * as React from "react";
import { Button, Empty, Loader } from "@cloudflare/kumo";
import { createContent, getDraftStatus, type ContentItem } from "@emdash-cms/admin";
import { useLingui } from "@lingui/react";

import { requireWidget, canContain, widgetsByCategory } from "../schema/registry";
import { PLUGIN_ID } from "../plugin-id";
import type { NodeType } from "../schema/types";
import { missingLabel } from "../render/styles";
import { LiveCanvas } from "./canvas/LiveCanvas";
import { copyNode, copyStyle, readClipboard, styleWithoutId } from "./clipboard";
import { ContextMenu, type ContextMenuItem } from "./context-menu/ContextMenu";
import { elementShortcut, type ElementShortcut } from "./context-menu/shortcuts";
import { DetailsPanel } from "./details/DetailsPanel";
import { useDragSource, type DragPayload, type DropTarget } from "./dnd/index";
import { FloatingPanel } from "./navigator/FloatingPanel";
import { Navigator } from "./navigator/Navigator";
import { findNode, walk, type BuilderNode, type BuilderTree } from "./store/tree";
import { deserializeEntry, type StoredBlock, type StoredStyles } from "./store/serialize";
import { createBlockValue, fieldsOf, missingRequired, type BlockTypeDef } from "./store/block-values";
import { fetchTemplate } from "./templates/useTemplates";
import {
	contentBlockLabel,
	reconcileWithContent,
	type ContentBlock,
} from "./store/content";
import { Inspector, type StoredContentBlock } from "./inspector/Inspector";
import {
	initialStateFrom,
	newContentKey,
	nodeCount,
	useBuilder,
	type ContentBlockValue,
} from "./store/useBuilder";
import { TemplateInserter } from "./template-inserter/TemplateInserter";
import { SaveAsTemplateModal } from "./save-as-template/SaveAsTemplateModal";
import {
	useBuilderAvailability,
	useCollectionInfo,
	useContentBlockTypes,
	usePublicUrl,
} from "./useBuilderAvailability";
import { useBuilderEntry, BLOCKS_FIELD, STYLES_FIELD, type BuilderEntryState } from "./useBuilderEntry";

export function BuilderPage(): React.JSX.Element {
	const { i18n } = useLingui();
	const { collection, entryId } = readEntryRef();

	const entryState = useBuilderEntry(collection, entryId);
	const { titleField } = useCollectionInfo(collection);
	const { entry, blocks, styles, isLoading, loadError } = entryState;
	const availability = useBuilderAvailability(collection);

	const content: ContentBlock[] | undefined = entry?.data?.content;

	// The page's existing content (header, content blocks, footer) enters the
	// tree here. A tree that had to change is dirty, so Save persists it.
	const initial = React.useMemo(() => {
		const base = initialStateFrom(blocks, styles, entry?.data?.content);
		const { tree, changed } = reconcileWithContent(base.tree, content);
		return { ...base, tree, dirty: changed };
	},
		// Rebuild only when the entry identity or its stored layers change.
		[entry?.id, blocks, styles, content],
	);

	// "Hero", "FAQ"… for the refs, from the block types they point at.
	const contentLabels = React.useMemo(() => {
		const labels: Record<string, string> = {};
		for (const block of content ?? []) labels[block._key] = contentBlockLabel(block._type);
		return labels;
	}, [content]);

	// Without the builder fields the canvas would load empty and saving would
	// fail with a server error, so say so up front.
	if (availability === "unavailable") {
		return (
			<Empty
				title={i18n._("This collection has no builder fields")}
				description={i18n._(
					"Add builder_layout and builder_styles to the {collection} collection to edit it with the builder.",
					{ collection },
				)}
			/>
		);
	}

	if (isLoading || availability === "loading") {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader />
			</div>
		);
	}

	if (loadError || !entry) {
		// New template: blank canvas, ready to create.
		if (collection === "templates" && !loadError) {
			return (
				<BuilderShell
					key={`new-${collection}`}
					initial={initialStateFrom([], {}, [])}
					entryTitle=""
					contentLabels={{}}
					content={[]}
					entryState={{
						entry: null,
						blocks: null,
						styles: null,
						isLoading: false,
						loadError: null,
						actionError: null,
						clearActionError: () => {},
						saving: false,
						generation: 0,
						save: () => Promise.reject(new Error("No entry")),
						publish: () => Promise.resolve(),
						discard: () => Promise.resolve(),
						schedule: () => Promise.resolve(),
						unschedule: () => Promise.resolve(),
						updateMeta: () => Promise.resolve(),
					}}
					collection={collection}
					entryId=""
					entrySlug={null}
				/>
			);
		}
		return (
			<Empty
				title={i18n._("This entry could not be loaded")}
				description={loadError ?? undefined}
			/>
		);
	}

	return (
		<BuilderShell
			// A discarded draft replaces the stored layout: start the editor over.
			key={entryState.generation}
			initial={initial}
			entryTitle={entryTitleOf(entry.data as Record<string, unknown> | undefined, titleField)}
			contentLabels={contentLabels}
			content={entry.data?.content ?? []}
			entryState={entryState}
			collection={collection}
			entryId={entry.id}
			entrySlug={entry.slug}
		/>
	);
}

function entryTitleOf(data: Record<string, unknown> | undefined, titleField: string): string {
	const value = data?.[titleField];
	return typeof value === "string" ? value : "";
}

/**
 * Reads the entry reference from the URL.
 *
 * A plugin page is not a typed TanStack route, so the params are read straight
 * from the location. Falls back to the `pages` collection, which is what the
 * marketing template ships with.
 */
function readEntryRef(): { collection: string; entryId: string | undefined } {
	if (typeof window === "undefined") return { collection: "pages", entryId: undefined };
	const search = new URLSearchParams(window.location.search);
	return {
		collection: search.get("collection") ?? "pages",
		entryId: search.get("id") ?? undefined,
	};
}

interface BuilderShellProps {
	initial: ReturnType<typeof initialStateFrom>;
	entryTitle: string;
	contentLabels: Record<string, string>;
	/** The entry's stored content blocks, as loaded or last saved. */
	content: StoredContentBlock[];
	entryState: BuilderEntryState;
	collection: string;
	/** Empty string when creating a new entry; real ID when editing. */
	entryId: string;
	entrySlug: string | null;
}

function BuilderShell({
	initial,
	entryTitle,
	contentLabels,
	content,
	entryState,
	collection,
	entryId,
	entrySlug,
}: BuilderShellProps): React.JSX.Element {
	const publicUrl = usePublicUrl(collection, entrySlug, entryId || "0");
	const { i18n } = useLingui();
	const builder = useBuilder(initial);
	const selected = builder.selectedKey ? findNode(builder.tree, builder.selectedKey) : null;
	const [structureOpen, setStructureOpen] = usePanelOpen(STRUCTURE_OPEN_KEY);
	const [sidebarOpen, setSidebarOpen] = usePanelOpen(SIDEBAR_OPEN_KEY);
	const [detailsOpen, setDetailsOpen] = usePanelOpen(DETAILS_OPEN_KEY);
	const [structureExpanded, setStructureExpanded] = usePanelOpen(STRUCTURE_EXPANDED_KEY);
	const [adding, setAdding] = React.useState(false);
	const [inserterOpen, setInserterOpen] = React.useState(false);
	const [saveAsOpen, setSaveAsOpen] = React.useState(false);
	const [templateError, setTemplateError] = React.useState<string | null>(null);
	const info = useCollectionInfo(collection);
	const entry = entryState.entry;
	const { saving } = entryState;
	const isNew = !entryId;

	// The slug is part of the draft: it travels with Save.
	const [slug, setSlug] = React.useState(entrySlug ?? "");
	const slugDirty = slug !== (entrySlug ?? "");
	// The title too: a data field of the draft, saved with Save.
	const [title, setTitle] = React.useState(entryTitle);
	const titleDirty = title !== entryTitle;
	const dirty = builder.dirty || slugDirty || titleDirty;
	const draftStatus = entry ? getDraftStatus(entry as unknown as ContentItem) : "unpublished";
	const [publishing, setPublishing] = React.useState(false);

	// Nothing selected (a click outside any element): the palette shows, ready
	// to add. Selecting an element shows its settings; the palette steps aside.
	const showPalette = adding || !selected;
	// Where the next palette click lands when a "+" in the preview asked for a
	// spot (end of page, above a container, inside an empty one). Null: the
	// click follows the selection (`clickTarget`).
	const [insertAt, setInsertAt] = React.useState<DropTarget | null>(null);
	// Set when a "+" selects a node itself, so the effect below keeps the panel.
	const keepAdding = React.useRef(false);
	React.useEffect(() => {
		if (keepAdding.current) {
			keepAdding.current = false;
			return;
		}
		if (builder.selectedKey) setAdding(false);
		setInsertAt(null);
	}, [builder.selectedKey]);
	React.useEffect(() => {
		if (!showPalette) setInsertAt(null);
	}, [showPalette]);
	// Bumped to focus the palette's search box; back to 0 once the spot is
	// used or dropped, so a later remount of the palette does not steal focus.
	const [paletteFocus, setPaletteFocus] = React.useState(0);
	React.useEffect(() => {
		if (!insertAt) setPaletteFocus(0);
	}, [insertAt]);
	const requestInsert = (target: DropTarget, select?: string) => {
		if (select !== undefined && select !== builder.selectedKey) {
			keepAdding.current = true;
			builder.select(select);
		}
		setInsertAt(target);
		setSidebarOpen(true);
		setAdding(true);
		setPaletteFocus((count) => count + 1);
	};
	// The hover tab's "+": an empty container at `target`, selected, with the
	// elements panel open to fill it.
	const addContainerAt = (target: DropTarget) => {
		const key = builder.addNode("container", target.parentKey, target.index);
		if (key) requestInsert({ parentKey: key, index: 0 }, key);
	};
	// The content blocks with every pending edit applied: what the Inspector
	// shows, what the preview renders and what Save writes.
	const mergedContent = builder.content as StoredContentBlock[];
	const blockFor = (node: { type: string; props: Record<string, unknown> } | null) =>
		node?.type === "content_ref"
			? (mergedContent.find((block) => block._key === node.props.ref_key) ?? null)
			: null;

	// The builder fills the window below the admin header, so the live preview
	// scrolls inside its iframe instead of the admin page growing with it.
	const shellRef = React.useRef<HTMLDivElement | null>(null);
	const [shellHeight, setShellHeight] = React.useState<number | string>("100%");
	React.useLayoutEffect(() => {
		const measure = () => {
			const top = shellRef.current?.getBoundingClientRect().top ?? 0;
			setShellHeight(Math.max(320, window.innerHeight - top - 8));
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);

	// The site's design tokens, read from the live preview once it loads.
	const [tokens, setTokens] = React.useState<string[]>([]);

	// Bumped after each save so the live preview reloads the server render.
	const [reloadToken, setReloadToken] = React.useState(0);

	// The site's block types: offered in the palette, and the Inspector's schema.
	const blockTypes = useContentBlockTypes(collection);
	const insertBlock = React.useCallback(
		(slug: string, parentKey: string | null, index?: number) => {
			const type = blockTypes.allowed.find((candidate) => candidate.slug === slug);
			if (!type) return;
			builder.addContentBlock(createBlockValue(type, newContentKey()), parentKey, index);
		},
		[blockTypes.allowed, builder],
	);
	// A click inserts inside the selected container, after the selected block,
	// or at the end of the page.
	const insertFromPalette = (payload: DragPayload) => {
		if (payload.kind !== "new") return;
		if (insertAt) {
			// A spot picked with a "+" in the preview: placed as a drop there
			// would be (a widget at the root gets its container).
			setInsertAt(null);
			handleDrop(payload, insertAt);
			return;
		}
		const at = clickTarget(builder.tree, selected);
		if (payload.blockType) insertBlock(payload.blockType, at.parentKey, at.index);
		else builder.addNode(payload.nodeType, at.parentKey, at.index);
	};

	// Insert a template's widgets at the click target.
	//
	// Two modes, mirroring Elementor:
	//   - "copy" (default): the template's nodes are cloned with fresh keys, so
	//     editing the original later does not touch this instance.
	//   - "global": a live `template_ref` is placed; the render expands it, so
	//     editing the original updates every instance. Used for repeated parts
	//     (a header, a CTA band).
	// The template's own `builder_layout` is the source (not `content`, which is
	// the marketing blocks the template may carry alongside).
	const insertTemplate = React.useCallback(
		async (
			templateId: string,
			at?: { parentKey: string | null; index?: number },
			mode: "copy" | "global" = "copy",
		) => {
			setTemplateError(null);
			const target = at ?? clickTarget(builder.tree, selected);
			if (mode === "global") {
				builder.insertTemplate(templateId, target.parentKey, target.index);
				return;
			}
			try {
				const template = await fetchTemplate(templateId);
				const layout = template.builder_layout ?? [];
				if (layout.length === 0) {
					setTemplateError(i18n._("That template is empty."));
					return;
				}
				const { tree: source } = deserializeEntry(
					layout as unknown as StoredBlock[],
					(template.builder_styles ?? {}) as StoredStyles,
				);
				if (source.length === 0) {
					setTemplateError(i18n._("That template has no layout to insert."));
					return;
				}
				// The template's own CSS ID/classes land on the copy's root node,
				// the way Elementor attaches a saved template's wrapper settings.
				// Only when the template has a single root, so nothing is guessed.
				const root = source[0]!;
				if (source.length === 1 && (template.css_id || template.css_classes)) {
					root.style = {
						...root.style,
						advanced: {
							...root.style.advanced,
							...(template.css_id ? { cssId: template.css_id } : {}),
							...(template.css_classes ? { cssClasses: template.css_classes } : {}),
						},
					};
				}
				builder.insertSubtree(source, target.parentKey, target.index);
			} catch (cause) {
				setTemplateError(cause instanceof Error ? cause.message : i18n._("Failed to insert template"));
			}
		},
		[builder, selected, i18n],
	);

	// Placed blocks whose type the page may no longer use (disabled in the
	// schema): shown as "Missing component" in the preview and in Structure.
	const missing = React.useMemo(() => {
		const map = new Map<string, string>();
		if (blockTypes.known.length === 0) return map;
		const allowed = new Set(blockTypes.allowed.map((type) => type.slug));
		for (const block of mergedContent) {
			if (!allowed.has(block._type)) map.set(block._key, missingLabel(block._type));
		}
		return map;
	}, [blockTypes, mergedContent]);

	const labelFor = React.useCallback(
		(node: { type: string; props: Record<string, unknown>; name?: string }) =>
			node.name
				? node.name
				: node.type === "content_ref"
				? (() => {
						const block = mergedContent.find((candidate) => candidate._key === node.props.ref_key);
						if (!block) return i18n._("Missing block");
						return (
							missing.get(block._key) ??
							blockTypes.known.find((type) => type.slug === block._type)?.label ??
							contentBlockLabel(block._type)
						);
					})()
				: requireWidget(node.type as NodeType).label,
		[mergedContent, missing, blockTypes.known, i18n],
	);

	const handleDrop = React.useCallback(
		(payload: DragPayload, target: DropTarget) => {
			// Auto-wrap: if dropping at root and the dragged type is not a
			// container, create a container and nest inside it.
			if (target.parentKey === null && payload.kind === "new") {
				if (payload.blockType) {
					// Content block: always wrap at root.
					const blockDef = blockTypes.allowed.find(
						(t) => t.slug === payload.blockType,
					);
					if (blockDef) {
						const block = createBlockValue(blockDef, newContentKey());
						builder.autoWrapBlock(block, target.index);
						return;
					}
				} else if (payload.nodeType !== "container" && canContain("container", payload.nodeType)) {
					// Regular widget at root: wrap in a container.
					builder.autoWrapNode(payload.nodeType, target.index);
					return;
				}
			}
			if (payload.kind === "new" && payload.blockType) {
				insertBlock(payload.blockType, target.parentKey, target.index);
				return;
			}
			if (payload.kind === "new") {
				builder.addNode(payload.nodeType, target.parentKey, target.index);
				return;
			}
			if (payload.kind === "template") {
				void insertTemplate(payload.templateId, target);
				return;
			}
			builder.moveExisting(payload.nodeKey, target.parentKey, target.index);
		},
		[builder, insertBlock, insertTemplate, blockTypes.allowed],
	);

	// A block with an empty required field would make the server reject the
	// whole save (layout included), so it is caught here and pointed at.
	const [checkError, setCheckError] = React.useState<string | null>(null);
	const handleSave = React.useCallback(async () => {
		setCheckError(null);
		if (builder.contentTouched) {
			for (const block of builder.content) {
				const type = blockTypes.known.find((candidate) => candidate.slug === block._type);
				if (!type) continue;
				const fields = fieldsOf(type, typeof block._version === "number" ? block._version : undefined);
				const missing = missingRequired(block, fields);
				if (!missing) continue;
				const ref = refFor(builder.tree, block._key);
				if (ref) builder.select(ref.key);
				const top = fields.find((field) => field.slug === missing.split("[")[0]);
				const message = i18n._("{block}: fill in {field} before saving.", {
					block: type.label,
					field: top?.label ?? missing,
				});
				setCheckError(message);
				throw new Error(message);
			}
		}
		const payload = builder.toSerializable();
		const saved = await entryState.save({
			blocks: payload.blocks,
			styles: payload.styles,
			...(builder.contentTouched ? { content: builder.content } : {}),
			...(slugDirty ? { slug } : {}),
			...(titleDirty ? { data: { [info.titleField]: title } } : {}),
		});
		setReloadToken((token) => token + 1);
		builder.markSaved();
		return saved;
	}, [builder, entryState, slug, slugDirty, title, titleDirty, info.titleField, blockTypes.known, i18n]);

	// Publish saves first, then publishes that exact revision.
	const handlePublish = React.useCallback(async () => {
		setPublishing(true);
		try {
			const saved = dirty ? await handleSave() : null;
			await entryState.publish(saved?._rev);
		} catch {
			// Shown in the error bar; the editor keeps its state.
		} finally {
			setPublishing(false);
		}
	}, [dirty, handleSave, entryState]);

	// Create a new entry (templates only). Calls the admin API, then navigates
	// to the builder with the new entry ID so the entry loads and the shell
	// switches to edit mode.
	const handleCreate = React.useCallback(async () => {
		const currentTitle = title || i18n._("Untitled");
		const slug = currentTitle
			.toLowerCase()
			.replace(/[^\w\s-]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.slice(0, 100);
		try {
			// Persist what was built on the blank canvas: without this, the
			// widgets added before Create would be lost on navigation.
			const payload = builder.toSerializable();
			const created = await createContent(collection, {
				slug: slug || "untitled",
				data: {
					title: currentTitle,
					[BLOCKS_FIELD]: payload.blocks,
					[STYLES_FIELD]: payload.styles,
					content: builder.content,
				},
			});
			// Navigate to the builder with the new entry ID.
			const params = new URLSearchParams({
				collection,
				id: created.id,
			});
			window.location.href = `/_emdash/admin/plugins/${PLUGIN_ID}/builder?${params.toString()}`;
		} catch {
			// Shown in the error bar; the editor keeps its state.
		}
	}, [collection, title, i18n, PLUGIN_ID, builder]);

	// --- Element actions: the context menu, its shortcuts, the hover tab. ---
	// Content refs place a block of the entry: duplicating or deleting one acts
	// on the block too, and a container carries the blocks of its subtree.
	const blocksIn = (node: BuilderNode) => {
		const refs = new Set<string>();
		walk([node], (current) => {
			if (current.type === "content_ref") refs.add(String(current.props.ref_key));
		});
		return mergedContent.filter((block) => refs.has(block._key)) as ContentBlockValue[];
	};
	const slotAfter = (node: BuilderNode) => {
		const siblings = node.parent === null ? builder.tree : (findNode(builder.tree, node.parent)?.children ?? []);
		return siblings.findIndex((sibling) => sibling.key === node.key) + 1;
	};
	const elementActions = {
		duplicate: (key: string) => {
			const node = findNode(builder.tree, key);
			if (!node) return;
			if (node.type === "content_ref") builder.duplicateContent(key);
			else builder.pasteSubtree([node], blocksIn(node), node.parent, slotAfter(node));
		},
		remove: (key: string) => {
			const node = findNode(builder.tree, key);
			if (!node) return;
			if (node.type === "content_ref") builder.removeContent(key);
			else builder.removeSubtree(key);
		},
		copy: (key: string) => {
			const node = findNode(builder.tree, key);
			if (node) copyNode(node, mergedContent as ContentBlockValue[]);
		},
		// Inside a container that accepts everything copied, else after the node.
		paste: (key: string | null) => {
			if (!blockTypes.ready) return;
			const clip = readClipboard(blockTypes.allowed);
			if (clip.nodes.length === 0) return;
			const node = key ? findNode(builder.tree, key) : null;
			if (!node) {
				builder.pasteSubtree(clip.nodes, clip.content, null, undefined, { wrapAtRoot: true });
				return;
			}
			const inside =
				node.type === "container" && clip.nodes.every((copied) => canContain("container", copied.type));
			if (inside) builder.pasteSubtree(clip.nodes, clip.content, node.key);
			else builder.pasteSubtree(clip.nodes, clip.content, node.parent, slotAfter(node), { wrapAtRoot: true });
		},
		copyStyle: (key: string) => {
			const node = findNode(builder.tree, key);
			if (node) copyStyle(node);
		},
		// Only between elements of the same type: the style keys are the type's.
		pasteStyle: (key: string) => {
			const node = findNode(builder.tree, key);
			const style = readClipboard(blockTypes.allowed).style;
			if (!node || !style || style.type !== node.type) return;
			builder.setStyle(key, styleWithoutId(style.style));
		},
		resetStyle: (key: string) => builder.setStyle(key, {}),
	};

	const [menu, setMenu] = React.useState<{
		key: string;
		x: number;
		y: number;
		returnFocus: HTMLElement | null;
	} | null>(null);
	const openMenu = (key: string, x: number, y: number, returnFocus?: HTMLElement | null) => {
		builder.select(key);
		setMenu({ key, x, y, returnFocus: returnFocus ?? (document.activeElement as HTMLElement | null) });
	};
	const closeMenu = React.useCallback(() => setMenu(null), []);
	const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
	const shortcut = (keys: string, aria: string) => ({
		label: mac ? keys : keys.replace("⌘", "Ctrl+").replace("⇧", "Shift+"),
		aria: mac ? aria : aria.replace("Meta", "Control"),
	});
	const menuItems = (key: string): ContextMenuItem[] => {
		const node = findNode(builder.tree, key);
		const clip = readClipboard(blockTypes.allowed);
		return [
			{
				id: "duplicate",
				label: i18n._("Duplicate"),
				shortcut: shortcut("⌘D", "Meta+D"),
				run: () => elementActions.duplicate(key),
			},
			{
				id: "copy",
				label: i18n._("Copy"),
				shortcut: shortcut("⌘C", "Meta+C"),
				separated: true,
				run: () => elementActions.copy(key),
			},
			{
				id: "paste",
				label: i18n._("Paste"),
				shortcut: shortcut("⌘V", "Meta+V"),
				disabled: !blockTypes.ready || clip.nodes.length === 0,
				run: () => elementActions.paste(key),
			},
			{
				id: "copy-style",
				label: i18n._("Copy style"),
				run: () => elementActions.copyStyle(key),
			},
			{
				id: "paste-style",
				label: i18n._("Paste style"),
				shortcut: shortcut("⌘⇧V", "Meta+Shift+V"),
				disabled: !clip.style || clip.style.type !== node?.type,
				run: () => elementActions.pasteStyle(key),
			},
			{
				id: "reset-style",
				label: i18n._("Reset style"),
				disabled: !node || Object.keys(node.style).length === 0,
				run: () => elementActions.resetStyle(key),
			},
			{
				id: "delete",
				label: i18n._("Delete"),
				shortcut: shortcut("⌫", "Delete"),
				danger: true,
				separated: true,
				run: () => elementActions.remove(key),
			},
		];
	};

	/** A shortcut on the selected element, from the shell or the preview. */
	const runShortcut = (action: ElementShortcut) => {
		const key = builder.selectedKey;
		if (!key) return;
		if (action === "duplicate") elementActions.duplicate(key);
		else if (action === "copy") elementActions.copy(key);
		else if (action === "paste") elementActions.paste(key);
		else if (action === "pasteStyle") elementActions.pasteStyle(key);
		else if (action === "delete") elementActions.remove(key);
	};
	const runShortcutRef = React.useRef(runShortcut);
	runShortcutRef.current = runShortcut;

	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			// Typing in a field, or focus inside the preview (it handles its own).
			const active = document.activeElement as HTMLElement | null;
			const editable =
				!!active &&
				(active.isContentEditable ||
					active.tagName === "IFRAME" ||
					["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName));
			const action = elementShortcut(event, editable, window.getSelection());
			// Delete/Backspace on a focused button or control is not meant for the
			// element: only with focus on the page itself or a Structure row.
			const deleteTarget =
				!active || active === document.body || active.getAttribute("role") === "treeitem";
			if (action === "delete" && !deleteTarget) return;
			if (action) {
				event.preventDefault();
				runShortcutRef.current(action);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	// Ctrl/Cmd+S saves. Undo/redo keep the shortcuts people already have in
	// their fingers; the buttons come with the fuller toolbar later.
	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const mod = event.metaKey || event.ctrlKey;
			if (!mod) return;
			if (event.key === "s") {
				event.preventDefault();
				if (dirty) void handleSave().catch(() => undefined);
			} else if (event.key === "z" && !event.shiftKey) {
				event.preventDefault();
				builder.undo();
			} else if ((event.key === "z" && event.shiftKey) || event.key === "y") {
				event.preventDefault();
				builder.redo();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [handleSave, builder, dirty]);

	return (
			<div ref={shellRef} className="flex min-h-0 flex-col bg-kumo-canvas" style={{ height: shellHeight }}>
				<header className="flex shrink-0 items-center gap-3 border-b border-kumo-line bg-kumo-base px-4 py-2">
					<button
						type="button"
						onClick={() => setSidebarOpen(!sidebarOpen)}
						aria-expanded={sidebarOpen}
						aria-controls="bd-sidebar"
						title={sidebarOpen ? i18n._("Hide panel") : i18n._("Show panel")}
						aria-label={sidebarOpen ? i18n._("Hide panel") : i18n._("Show panel")}
						className="flex items-center justify-center rounded px-1 py-1 text-kumo-subtle hover:bg-kumo-tint"
					>
						<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<rect x="3" y="4" width="18" height="16" rx="2" />
							<path d="M9 4v16" />
							{sidebarOpen && <path d="M5.5 8h1.5M5.5 11h1.5" />}
						</svg>
					</button>
					<div className="flex min-w-0 flex-col">
						<span className="truncate text-sm font-semibold text-kumo-strong">
							{title || i18n._("Untitled")}
						</span>
						<span className="text-xs text-kumo-subtle">
							{i18n._("{count} containers", { count: nodeCount(builder.tree) })}
						</span>
					</div>

					<DeviceSwitcher value={builder.breakpoint} onChange={builder.setBreakpoint} />

					<div className="flex items-center gap-2">
						{isNew && (
							<Button
								type="button"
								size="sm"
								variant="primary"
								disabled={publishing || saving}
								onClick={() => void handleCreate()}
							>
								{i18n._("Create")}
							</Button>
						)}
						{!isNew && (
							<Button
								type="button"
								size="sm"
								variant="secondary"
								title={i18n._("Open the published page in a new tab")}
								onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
							>
								{i18n._("View page")}
							</Button>
						)}
						<Button
							type="button"
							size="sm"
							variant="secondary"
							disabled={!dirty || saving || publishing}
							onClick={() => void handleSave().catch(() => undefined)}
						>
							{saving && !publishing
								? i18n._("Saving…")
								: dirty
									? i18n._("Save")
									: i18n._("Saved")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="primary"
							disabled={isNew || publishing || saving || (!dirty && draftStatus === "published")}
							onClick={() => void handlePublish()}
						>
							{publishing
								? i18n._("Publishing…")
								: draftStatus === "unpublished"
									? i18n._("Publish")
									: i18n._("Publish changes")}
						</Button>
					</div>
					<button
						type="button"
						onClick={() => setStructureOpen(!structureOpen)}
						aria-pressed={structureOpen}
						aria-controls="bd-structure"
						title={structureOpen ? i18n._("Hide structure") : i18n._("Show structure")}
						aria-label={structureOpen ? i18n._("Hide structure") : i18n._("Show structure")}
						className={[
							"flex items-center justify-center rounded px-1 py-1 hover:bg-kumo-tint",
							structureOpen ? "text-kumo-strong" : "text-kumo-subtle",
						].join(" ")}
					>
						<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<rect x="3" y="3" width="7" height="5" rx="1" />
							<rect x="12" y="10" width="9" height="5" rx="1" />
							<rect x="12" y="17" width="9" height="5" rx="1" />
							<path d="M6.5 8v11.5H12M6.5 12.5H12" />
						</svg>
					</button>
					<button
						type="button"
						onClick={() => setInserterOpen(true)}
						title={i18n._("Insert a saved template into this layout")}
						aria-label={i18n._("Insert template")}
						className="flex items-center justify-center rounded px-1 py-1 text-kumo-subtle hover:bg-kumo-tint"
					>
						<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<rect x="3" y="3" width="14" height="14" rx="2" />
							<path d="M12 12l4 4M16 12v4h-4" />
							<path d="M19 9v8a2 2 0 0 1-2 2h-8" />
						</svg>
					</button>
					<button
						type="button"
						onClick={() => setSaveAsOpen(true)}
						title={i18n._("Save current layout as a reusable template")}
						aria-label={i18n._("Save as template")}
						className="flex items-center justify-center rounded px-1 py-1 text-kumo-subtle hover:bg-kumo-tint"
					>
						<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<rect x="3" y="3" width="7" height="7" rx="1" />
							<rect x="14" y="3" width="7" height="7" rx="1" />
							<rect x="3" y="14" width="7" height="7" rx="1" />
							<rect x="14" y="14" width="7" height="7" rx="1" />
						</svg>
					</button>
					{/* Mirror of the left panel toggle, for the Details panel. */}
					<button
						type="button"
						onClick={() => setDetailsOpen(!detailsOpen)}
						aria-expanded={detailsOpen}
						aria-controls="bd-details"
						title={detailsOpen ? i18n._("Hide details") : i18n._("Show details")}
						aria-label={detailsOpen ? i18n._("Hide details") : i18n._("Show details")}
						className="flex items-center justify-center rounded px-1 py-1 text-kumo-subtle hover:bg-kumo-tint"
					>
						<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<rect x="3" y="4" width="18" height="16" rx="2" />
							<path d="M15 4v16" />
							{detailsOpen && <path d="M17 8h1.5M17 11h1.5" />}
						</svg>
					</button>
				</header>

				{checkError || entryState.actionError || templateError ? (
					<div role="alert" className="flex shrink-0 items-center gap-3 border-b border-kumo-line bg-kumo-base px-4 py-2 text-sm text-kumo-danger">
						<span className="min-w-0 flex-1">{checkError ?? entryState.actionError ?? templateError}</span>
						<button
							type="button"
							onClick={() => {
								setCheckError(null);
								setTemplateError(null);
								entryState.clearActionError();
							}}
							aria-label={i18n._("Dismiss")}
							className="rounded px-1 text-kumo-subtle hover:bg-kumo-tint"
						>
							<span aria-hidden="true">&times;</span>
						</button>
					</div>
				) : null}

				<div className="flex min-h-0 flex-1">
					{sidebarOpen ? (
						<aside
							id="bd-sidebar"
							aria-label={i18n._("Elements")}
							className="flex w-72 shrink-0 flex-col border-e border-kumo-line bg-kumo-base"
						>
							{/* Only needed over the Inspector: with nothing selected the list is already shown. */}
							{selected ? (
							<div className="shrink-0 border-b border-kumo-line p-3">
								<Button
									type="button"
									size="sm"
									variant={showPalette ? "secondary" : "primary"}
									className="w-full justify-center"
									aria-expanded={showPalette}
									onClick={() => setAdding(!adding)}
								>
									{showPalette ? i18n._("Close") : i18n._("+ Add element")}
								</Button>
							</div>
							) : null}
							<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					{showPalette ? (
						<Palette
								blockTypes={blockTypes.allowed}
								onInsert={insertFromPalette}
								onOpenInserter={() => setInserterOpen(true)}
								focusToken={paletteFocus}
							/>
					) : selected ? (
						<Inspector
							key={selected.key}
							node={selected}
							block={blockFor(selected)}
							blockTypes={blockTypes.known}
							title={labelFor(selected)}
							editUrl={`/_emdash/admin/content/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}`}
							onEditContent={builder.editContent}
							onDuplicate={() => elementActions.duplicate(selected.key)}
							onRemove={() => elementActions.remove(selected.key)}
							onUpdateProps={(patch) => builder.updateProps(selected.key, patch)}
							breakpoint={builder.breakpoint}
							tokens={tokens}
							onUpdateStyle={(target, patch) => builder.updateStyle(selected.key, target, patch)}
							onBack={() => builder.select(null)}
						/>
					) : null}
							</div>
						</aside>
					) : null}

					<main className="relative min-w-0 flex-1 overflow-hidden">
						<LiveCanvas
							collection={collection}
							entryId={entryId}
							tree={builder.tree}
							pageCss={builder.pageCss}
							missing={missing}
							breakpoint={builder.breakpoint}
							selectedKey={builder.selectedKey}
							onSelect={builder.select}
							onDropPayload={handleDrop}
							onRequestInsert={requestInsert}
							onAddContainer={addContainerAt}
							onRemove={elementActions.remove}
							onContextMenu={(key, x, y) => openMenu(key, x, y, null)}
							onShortcut={(action) => runShortcutRef.current(action)}
							reloadToken={reloadToken}
							onTokens={setTokens}
							contentBlocks={mergedContent}
							onEditContent={builder.editContent}
							storedContent={content}
							labelFor={labelFor}
							strings={{
								loading: i18n._("Loading the live preview…"),
								failed: i18n._(
									"The live preview is unavailable. Save the page, then reload.",
								),
								dropHere: i18n._("Drag widget here"),
								add: i18n._("Add element"),
								addContainer: i18n._("Add container above"),
								move: i18n._("Drag to move"),
								remove: i18n._("Delete"),
								confirmRemove: i18n._("Delete?"),
							}}
						/>
						{structureOpen && (
							<FloatingPanel storageKey={STRUCTURE_POSITION_KEY} width={256}>
								{(handleProps) => (
									<Navigator
										tree={builder.tree}
										selectedKey={builder.selectedKey}
										onSelect={builder.select}
										onDropPayload={handleDrop}
										onMove={builder.moveByKeyboard}
										onClose={() => setStructureOpen(false)}
										labelFor={labelFor}
										onRename={builder.renameNode}
										onContextMenu={openMenu}
										headerProps={handleProps}
										minimized={!structureExpanded}
										onToggleMinimized={() => setStructureExpanded(!structureExpanded)}
									/>
								)}
							</FloatingPanel>
						)}
					</main>

					{detailsOpen && (
						<DetailsPanel
							entry={entry}
							supportsDrafts={info.supportsDrafts}
							hasSeo={info.hasSeo}
							timezone={info.timezone}
							contentLocale={entry?.locale}
							slug={slug}
							onSlugChange={setSlug}
							title={title}
							onTitleChange={setTitle}
							onDiscard={() => void entryState.discard().catch(() => undefined)}
							onSchedule={entryState.schedule}
							onUnschedule={entryState.unschedule}
							onUpdateMeta={entryState.updateMeta}
							pageCss={builder.pageCss}
							onPageCssChange={builder.setPageCss}
						/>
					)}
				</div>

				{menu && findNode(builder.tree, menu.key) ? (
					<ContextMenu
						x={menu.x}
						y={menu.y}
						label={i18n._("Element actions")}
						items={menuItems(menu.key)}
						onClose={closeMenu}
						returnFocus={menu.returnFocus}
					/>
				) : null}

				{/* Template inserter modal */}
				<TemplateInserter
					open={inserterOpen}
					onOpenChange={setInserterOpen}
					onInsert={(templateId, mode) => void insertTemplate(templateId, undefined, mode)}
					onNew={() => setSaveAsOpen(true)}
				/>

				{/* Save-as-template modal */}
				<SaveAsTemplateModal
					open={saveAsOpen}
					onOpenChange={setSaveAsOpen}
					tree={builder.tree}
					selection={selected}
					onSaved={() => {
						setSaveAsOpen(false);
						setInserterOpen(true);
					}}
				/>
			</div>
	);
}

/** Inline device icons (monitor, tablet, phone), sized to the toolbar. */
const DEVICE_ICONS: Record<"desktop" | "tablet" | "mobile", React.JSX.Element> = {
	desktop: (
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
			<rect x="2" y="4" width="20" height="13" rx="2" />
			<path d="M8 21h8M12 17v4" />
		</svg>
	),
	tablet: (
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
			<rect x="4" y="2" width="16" height="20" rx="2" />
			<path d="M11 18h2" />
		</svg>
	),
	mobile: (
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
			<rect x="7" y="2" width="10" height="20" rx="2" />
			<path d="M11 18h2" />
		</svg>
	),
};

/** Desktop / tablet / mobile preview switch, as in Elementor's top bar. */
function DeviceSwitcher({
	value,
	onChange,
}: {
	value: "desktop" | "tablet" | "mobile";
	onChange: (device: "desktop" | "tablet" | "mobile") => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const labels = {
		desktop: i18n._("Desktop"),
		tablet: i18n._("Tablet"),
		mobile: i18n._("Mobile"),
	};
	return (
		<div
			role="radiogroup"
			aria-label={i18n._("Preview device")}
			className="mx-auto flex items-center gap-1 rounded border border-kumo-line bg-kumo-control p-0.5"
		>
			{(["desktop", "tablet", "mobile"] as const).map((device) => (
				<button
					key={device}
					type="button"
					role="radio"
					aria-checked={value === device}
					aria-label={labels[device]}
					title={labels[device]}
					onClick={() => onChange(device)}
					className={[
						"flex items-center justify-center rounded px-2 py-1",
						value === device ? "bg-kumo-tint text-kumo-strong" : "text-kumo-subtle hover:bg-kumo-tint",
					].join(" ")}
				>
					{DEVICE_ICONS[device]}
				</button>
			))}
		</div>
	);
}

const STRUCTURE_OPEN_KEY = "builderdash:structure-open";
const SIDEBAR_OPEN_KEY = "builderdash:sidebar-open";
const DETAILS_OPEN_KEY = "builderdash:details-open";
const STRUCTURE_EXPANDED_KEY = "builderdash:structure-expanded";
const STRUCTURE_POSITION_KEY = "builderdash:structure-position";

/**
 * Open/closed state of a side panel (Structure, the left sidebar), remembered
 * per browser.
 *
 * A viewer convenience only: storage may be unavailable (private mode, blocked
 * site data), so every access is guarded and the panel defaults to open.
 */
function usePanelOpen(storageKey: string): [boolean, (open: boolean) => void] {
	const [open, setOpen] = React.useState(() => {
		try {
			return window.localStorage.getItem(storageKey) !== "false";
		} catch {
			return true;
		}
	});

	const update = React.useCallback((next: boolean) => {
		setOpen(next);
		try {
			window.localStorage.setItem(storageKey, String(next));
		} catch {
			// Not persisted; the panel still toggles for this session.
		}
	}, [storageKey]);

	return [open, update];
}

/** The content ref that places the block `blockKey`, anywhere in the tree. */
function refFor(tree: BuilderTree, blockKey: string): BuilderNode | null {
	for (const node of tree) {
		if (node.type === "content_ref" && node.props.ref_key === blockKey) return node;
		const inner = refFor(node.children, blockKey);
		if (inner) return inner;
	}
	return null;
}

/**
 * Where a palette click lands: inside the selected container, right after a
 * selected node that cannot hold it, else at the end of the page.
 */
function clickTarget(
	tree: BuilderTree,
	selected: BuilderNode | null,
): { parentKey: string | null; index?: number } {
	if (selected) {
		if (selected.type === "container") return { parentKey: selected.key };
		const siblings = selected.parent === null ? tree : (findNode(tree, selected.parent)?.children ?? []);
		return { parentKey: selected.parent, index: siblings.findIndex((node) => node.key === selected.key) + 1 };
	}
	return { parentKey: null };
}

/**
 * The palette.
 *
 * Reads the registry, so it lists whatever widgets exist without changing. At
 * this stage that is one entry, which is the point: the structure is what is
 * being tested.
 */
interface PaletteEntry {
	id: string;
	label: string;
	category: string;
	payload: DragPayload;
	description?: string;
	/** Special entry: opens a flow instead of inserting a node. */
	action?: "templates";
}

function Palette({
	blockTypes,
	onInsert,
	onOpenInserter,
	focusToken = 0,
}: {
	/** The site's block types the page may use (Hero, FAQ…). */
	blockTypes: BlockTypeDef[];
	onInsert: (payload: DragPayload) => void;
	/** Opens the template inserter, for the "Template" entry. */
	onOpenInserter: () => void;
	/** Each change focuses the search box (a "+" in the preview opened the panel). */
	focusToken?: number;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const searchRef = React.useRef<HTMLInputElement | null>(null);
	React.useEffect(() => {
		if (focusToken > 0) searchRef.current?.focus();
	}, [focusToken]);
	const entries = React.useMemo<PaletteEntry[]>(
		() => [
			...widgetsByCategory().flatMap((group) =>
				group.widgets.map((widget) => ({
					id: widget.type,
					label: widget.label,
					category: group.category,
					payload: { kind: "new", nodeType: widget.type } as DragPayload,
				})),
			),
			...blockTypes.map((type) => ({
				id: `block:${type.slug}`,
				label: type.label,
				category: type.category || i18n._("Blocks"),
				description: type.description,
				payload: { kind: "new", nodeType: "content_ref", blockType: type.slug } as DragPayload,
			})),
			{
				id: "templates",
				label: i18n._("Template"),
				category: i18n._("Reusable"),
				description: i18n._("Insert a saved template"),
				payload: { kind: "new", nodeType: "container" } as DragPayload,
				action: "templates",
			},
		],
		[blockTypes, i18n],
	);
	const [filter, setFilter] = React.useState("");
	const needle = filter.trim().toLocaleLowerCase();
	const shown = entries.filter((entry) => entry.label.toLocaleLowerCase().includes(needle));
	const categories = [...new Set(shown.map((entry) => entry.category))];

	return (
		<div aria-label={i18n._("Blocks")} role="group">
			<div className="border-b border-kumo-line px-3 py-2">
				<input
					ref={searchRef}
					type="search"
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					placeholder={i18n._("Search elements…")}
					aria-label={i18n._("Search elements")}
					className="w-full rounded border border-kumo-line bg-kumo-control px-2 py-1.5 text-xs text-kumo-default"
				/>
			</div>
			{shown.length === 0 ? (
				<p className="px-3 py-4 text-xs text-kumo-subtle">{i18n._("No element matches.")}</p>
			) : null}

			{categories.map((category) => (
				<div key={category} className="px-3 py-3">
					<h3 className="mb-2 text-xs font-semibold tracking-wide text-kumo-subtle uppercase">{category}</h3>
					<ul className="grid grid-cols-2 gap-2">
						{shown
							.filter((entry) => entry.category === category)
							.map((entry) => (
								<PaletteItem key={entry.id} entry={entry} onInsert={onInsert} onOpenInserter={onOpenInserter} />
							))}
					</ul>
				</div>
			))}
		</div>
	);
}

function PaletteItem({
	entry,
	onInsert,
	onOpenInserter,
}: {
	entry: PaletteEntry;
	onInsert: (payload: DragPayload) => void;
	onOpenInserter: () => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const dragProps = useDragSource(entry.payload);

	// The template entry opens the inserter instead of dropping a node: there
	// is no single "template widget" to place, the user picks one.
	if (entry.action === "templates") {
		return (
			<li>
				<button
					type="button"
					onClick={onOpenInserter}
					title={entry.description || i18n._("Insert a saved template")}
					className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border border-kumo-line bg-kumo-control px-2 py-3 text-center transition-colors hover:border-kumo-fill-hover hover:bg-kumo-tint"
				>
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-kumo-subtle">
						<rect x="3" y="3" width="7" height="7" rx="1" />
						<rect x="14" y="3" width="7" height="7" rx="1" />
						<rect x="3" y="14" width="7" height="7" rx="1" />
						<rect x="14" y="14" width="7" height="7" rx="1" />
					</svg>
					<span className="text-xs font-medium text-kumo-strong">{entry.label}</span>
				</button>
			</li>
		);
	}

	return (
		<li>
			<button
				type="button"
				{...dragProps}
				onClick={() => onInsert(entry.payload)}
				title={entry.description || i18n._("Click to insert, or drag onto the canvas")}
				className="flex w-full cursor-grab flex-col items-center gap-1 rounded-lg border border-kumo-line bg-kumo-control px-2 py-3 text-center transition-colors hover:border-kumo-fill-hover hover:bg-kumo-tint"
			>
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-kumo-subtle">
					{entry.payload.kind === "new" && entry.payload.blockType ? (
						<>
							<rect x="3" y="4" width="18" height="16" rx="2" />
							<path d="M7 9h10M7 13h6" />
						</>
					) : (
						<>
							<rect x="3" y="3" width="18" height="18" rx="2" />
							<path d="M3 12h18M12 3v18" />
						</>
					)}
				</svg>
				<span className="text-xs font-medium text-kumo-strong">{entry.label}</span>
			</button>
		</li>
	);
}
