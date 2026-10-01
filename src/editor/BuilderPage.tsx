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
import { useLingui } from "@lingui/react";

import { widgetsByCategory } from "../schema/registry";
import type { NodeType } from "../schema/types";
import { Canvas } from "./canvas/Canvas";
import { useDragSource, type DragPayload, type DropTarget } from "./dnd/index";
import { Navigator } from "./navigator/Navigator";
import { findNode, type BuilderTree } from "./store/tree";
import { initialStateFrom, nodeCount, useBuilder } from "./store/useBuilder";
import { useBuilderEntry } from "./useBuilderEntry";

export function BuilderPage(): React.JSX.Element {
	const { i18n } = useLingui();
	const { collection, entryId } = readEntryRef();

	const { entry, blocks, styles, isLoading, error, save, saving } = useBuilderEntry(
		collection,
		entryId,
	);

	const initial = React.useMemo(
		() => initialStateFrom(blocks, styles),
		// Rebuild only when the entry identity or its stored layers change.
		[entry?.id, blocks, styles],
	);

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader />
			</div>
		);
	}

	if (error || !entry) {
		return (
			<Empty
				title={i18n._("This entry could not be loaded")}
				description={error ?? undefined}
			/>
		);
	}

	return (
		<BuilderShell
			initial={initial}
			entryTitle={typeof entry.data?.title === "string" ? entry.data.title : ""}
			saving={saving}
			onSave={save}
		/>
	);
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
	saving: boolean;
	onSave: (payload: {
		blocks: unknown[];
		styles: Record<string, unknown>;
	}) => Promise<void>;
}

function BuilderShell({
	initial,
	entryTitle,
	saving,
	onSave,
}: BuilderShellProps): React.JSX.Element {
	const { i18n } = useLingui();
	const builder = useBuilder(initial);
	const selected = builder.selectedKey ? findNode(builder.tree, builder.selectedKey) : null;
	const [structureOpen, setStructureOpen] = useStructurePanelOpen();

	const handleDrop = React.useCallback(
		(payload: DragPayload, target: DropTarget) => {
			if (payload.kind === "new") {
				builder.addNode(payload.nodeType, target.parentKey, target.index);
				return;
			}
			builder.moveExisting(payload.nodeKey, target.parentKey, target.index);
		},
		[builder],
	);

	const handleSave = React.useCallback(async () => {
		const payload = builder.toSerializable();
		await onSave({ blocks: payload.blocks, styles: payload.styles });
		builder.markSaved();
	}, [builder, onSave]);

	// Ctrl/Cmd+S saves. Undo/redo keep the shortcuts people already have in
	// their fingers; the buttons come with the fuller toolbar later.
	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const mod = event.metaKey || event.ctrlKey;
			if (!mod) return;
			if (event.key === "s") {
				event.preventDefault();
				void handleSave();
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
	}, [handleSave, builder]);

	return (
			<div className="flex h-full min-h-0 flex-col bg-kumo-canvas">
				<header className="flex shrink-0 items-center gap-3 border-b border-kumo-line bg-kumo-base px-4 py-2">
					<div className="flex min-w-0 flex-col">
						<span className="truncate text-sm font-semibold text-kumo-strong">
							{entryTitle || i18n._("Untitled")}
						</span>
						<span className="text-xs text-kumo-subtle">
							{i18n._("{count} containers", { count: nodeCount(builder.tree) })}
						</span>
					</div>

					<div className="ms-auto flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="secondary"
							aria-expanded={structureOpen}
							aria-controls="bd-structure"
							onClick={() => setStructureOpen(!structureOpen)}
						>
							{i18n._("Structure")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="secondary"
							disabled={!selected}
							onClick={() => selected && builder.remove(selected.key)}
						>
							{i18n._("Delete")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="primary"
							disabled={!builder.dirty || saving}
							onClick={() => void handleSave()}
						>
							{saving
								? i18n._("Saving…")
								: builder.dirty
									? i18n._("Save")
									: i18n._("Saved")}
						</Button>
					</div>
				</header>

				<div className="flex min-h-0 flex-1">
					<Palette onInsert={(type) => builder.addNode(type, selectedTarget(builder.tree, selected), undefined)} />

					<main className="min-w-0 flex-1 overflow-auto">
						<Canvas
							tree={builder.tree}
							breakpoint={builder.breakpoint}
							selectedKey={builder.selectedKey}
							onSelect={builder.select}
							onDropPayload={handleDrop}
							onMove={builder.moveByKeyboard}
							ariaLabel={(label) => i18n._("Select {label}", { label })}
						/>
					</main>

					{structureOpen && (
						<Navigator
							tree={builder.tree}
							selectedKey={builder.selectedKey}
							onSelect={builder.select}
							onDropPayload={handleDrop}
							onMove={builder.moveByKeyboard}
							onClose={() => setStructureOpen(false)}
						/>
					)}
				</div>
			</div>
	);
}

const STRUCTURE_OPEN_KEY = "builderdash:structure-open";

/**
 * Open/closed state of the Structure panel, remembered per browser.
 *
 * A viewer convenience only: storage may be unavailable (private mode, blocked
 * site data), so every access is guarded and the panel defaults to open.
 */
function useStructurePanelOpen(): [boolean, (open: boolean) => void] {
	const [open, setOpen] = React.useState(() => {
		try {
			return window.localStorage.getItem(STRUCTURE_OPEN_KEY) !== "false";
		} catch {
			return true;
		}
	});

	const update = React.useCallback((next: boolean) => {
		setOpen(next);
		try {
			window.localStorage.setItem(STRUCTURE_OPEN_KEY, String(next));
		} catch {
			// Not persisted; the panel still toggles for this session.
		}
	}, []);

	return [open, update];
}

/** Where a palette click lands: inside the selection, else the last container. */
function selectedTarget(tree: BuilderTree, selected: { key: string } | null): string | null {
	if (selected) return selected.key;
	const last = lastContainer(tree);
	return last ? last.key : null;
}

function lastContainer(tree: BuilderTree) {
	for (let i = tree.length - 1; i >= 0; i--) {
		const node = tree[i]!;
		if (node.type === "container") return node;
	}
	return null;
}

/**
 * The palette.
 *
 * Reads the registry, so it lists whatever widgets exist without changing. At
 * this stage that is one entry, which is the point: the structure is what is
 * being tested.
 */
function Palette({ onInsert }: { onInsert: (type: NodeType) => void }): React.JSX.Element {
	const { i18n } = useLingui();
	const groups = React.useMemo(() => widgetsByCategory(), []);

	return (
		<aside
			aria-label={i18n._("Blocks")}
			className="flex w-48 shrink-0 flex-col overflow-y-auto border-e border-kumo-line bg-kumo-base"
		>
			<div className="border-b border-kumo-line px-3 py-2">
				<h2 className="text-xs font-semibold tracking-wide text-kumo-subtle uppercase">
					{i18n._("Blocks")}
				</h2>
			</div>

			{groups.map((group) => (
				<div key={group.category} className="px-3 py-3">
					<ul className="flex flex-col gap-2">
						{group.widgets.map((widget) => (
							<PaletteItem
								key={widget.type}
								type={widget.type}
								label={widget.label}
								icon={widget.icon}
								onInsert={onInsert}
							/>
						))}
					</ul>
				</div>
			))}
		</aside>
	);
}

function PaletteItem({
	type,
	label,
	icon,
	onInsert,
}: {
	type: NodeType;
	label: string;
	icon: string;
	onInsert: (type: NodeType) => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const dragProps = useDragSource({ kind: "new", nodeType: type });

	return (
		<li>
			<button
				type="button"
				{...dragProps}
				onClick={() => onInsert(type)}
				title={i18n._("Click to insert, or drag onto the canvas")}
				className="flex w-full cursor-grab items-center gap-2 rounded-lg border border-kumo-line bg-kumo-control px-2 py-2 text-start transition-colors hover:border-kumo-fill-hover hover:bg-kumo-tint"
			>
				<span aria-hidden="true" className="text-base text-kumo-subtle" data-icon={icon}>
					&#9638;
				</span>
				<span className="text-xs font-medium text-kumo-strong">{label}</span>
			</button>
		</li>
	);
}
