/**
 * Structure panel: the tree navigator.
 *
 * Lists every node of the composition as an indented tree, mirroring the
 * Elementor Navigator. It is a second view of the same tree the canvas shows:
 *
 *   - Clicking a row selects the node; selecting in the canvas reveals the row.
 *   - Dragging a row reorders or re-nests the node, and the canvas follows.
 *
 * Lives in the outer (admin) React tree, so Kumo and Lingui are available. The
 * drag mechanism stays in `dnd/`: this file only spreads what `useTreeDrop`
 * and `useDragSource` return.
 */

import * as React from "react";
import { useLingui } from "@lingui/react";

import { requireWidget } from "../../schema/registry";
import {
	useDragSource,
	useTreeDrop,
	type DragPayload,
	type DropTarget,
	type TreeDrop,
} from "../dnd/index";
import type { TreeDropZone } from "../dnd/tree-drop";
import { ancestorsOf, type BuilderNode, type BuilderTree, type MoveIntent } from "../store/tree";

interface NavigatorProps {
	tree: BuilderTree;
	selectedKey: string | null;
	onSelect: (key: string) => void;
	onDropPayload: (payload: DragPayload, target: DropTarget) => void;
	/** Keyboard move of a node. Returns `true` when it applied. */
	onMove: (key: string, intent: MoveIntent) => boolean;
	onClose: () => void;
	/** Overrides a row's label (content refs show the block they point at). */
	labelFor?: (node: BuilderNode) => string | undefined;
	/** Renames a node (double-click on its label). Empty restores the default. */
	onRename?: (key: string, name: string) => void;
	/** Spread on the header: it moves the floating panel. */
	headerProps?: React.HTMLAttributes<HTMLElement>;
	/** Minimized: only the header and its tools are shown. */
	minimized?: boolean;
	onToggleMinimized?: () => void;
}

/** A row as rendered: the node plus where it sits in the visible list. */
interface VisibleRow {
	node: BuilderNode;
	depth: number;
	hasChildren: boolean;
	expanded: boolean;
}

/**
 * Flattens the tree, skipping the children of collapsed nodes.
 *
 * With a filter, only nodes whose label matches are listed, together with
 * their ancestors (opened, so the match is visible).
 */
function visibleRows(
	tree: BuilderTree,
	collapsed: ReadonlySet<string>,
	filter: string,
	labelOf: (node: BuilderNode) => string,
): VisibleRow[] {
	const needle = filter.trim().toLocaleLowerCase();
	const matches = (node: BuilderNode): boolean =>
		labelOf(node).toLocaleLowerCase().includes(needle) || node.children.some(matches);

	const rows: VisibleRow[] = [];
	const visit = (nodes: BuilderTree, depth: number) => {
		for (const node of nodes) {
			if (needle && !matches(node)) continue;
			const hasChildren = node.children.length > 0;
			const expanded = hasChildren && (needle ? true : !collapsed.has(node.key));
			rows.push({ node, depth, hasChildren, expanded });
			if (expanded) visit(node.children, depth + 1);
		}
	};
	visit(tree, 0);
	return rows;
}

export function Navigator({
	tree,
	selectedKey,
	onSelect,
	onDropPayload,
	onMove,
	onClose,
	labelFor,
	onRename,
	headerProps,
	minimized = false,
	onToggleMinimized,
}: NavigatorProps): React.JSX.Element {
	const { i18n } = useLingui();
	const listRef = React.useRef<HTMLDivElement | null>(null);
	const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());
	const [focusedKey, setFocusedKey] = React.useState<string | null>(null);
	const [filter, setFilter] = React.useState("");

	// Choosing an element clears the filter: the full tree comes back with the
	// element revealed, and the preview scrolls to it.
	const choose = React.useCallback(
		(key: string) => {
			setFilter("");
			onSelect(key);
		},
		[onSelect],
	);

	/** Every node that has children, for "collapse all". */
	const parents = React.useMemo(() => {
		const keys: string[] = [];
		const visit = (nodes: BuilderTree) => {
			for (const node of nodes) {
				if (node.children.length > 0) keys.push(node.key);
				visit(node.children);
			}
		};
		visit(tree);
		return keys;
	}, [tree]);

	// One toggle: everything open → collapse all; anything closed → expand all.
	const allExpanded = parents.every((key) => !collapsed.has(key));

	const expand = React.useCallback((keys: readonly string[]) => {
		setCollapsed((current) => {
			if (!keys.some((key) => current.has(key))) return current;
			const next = new Set(current);
			for (const key of keys) next.delete(key);
			return next;
		});
	}, []);

	const toggle = (key: string) => {
		setCollapsed((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	// A drop "inside" a collapsed row would hide the node it just placed, so
	// the target is opened on drop.
	const handleDrop = React.useCallback(
		(payload: DragPayload, target: DropTarget) => {
			onDropPayload(payload, target);
			if (target.parentKey) expand([target.parentKey]);
		},
		[onDropPayload, expand],
	);

	const drop = useTreeDrop(tree, handleDrop);
	const labelOf = (node: BuilderNode) => labelFor?.(node) ?? requireWidget(node.type).label;
	const rows = visibleRows(tree, collapsed, filter, labelOf);

	// A selection made in the canvas must be visible here: open its ancestors
	// and bring the row into view.
	// Read through a ref so a later tree edit does not reopen a branch the user
	// collapsed on purpose: only a new selection reveals.
	const treeRef = React.useRef(tree);
	treeRef.current = tree;

	React.useEffect(() => {
		if (!selectedKey) return;
		expand(ancestorsOf(treeRef.current, selectedKey).map((node) => node.key));
		setFocusedKey(selectedKey);
	}, [selectedKey, expand]);

	React.useEffect(() => {
		if (!selectedKey) return;
		const row = listRef.current?.querySelector<HTMLElement>(
			`[data-nav-key="${CSS.escape(selectedKey)}"]`,
		);
		row?.scrollIntoView({ block: "nearest" });
	}, [selectedKey, rows.length]);

	const rovingKey =
		focusedKey && rows.some((row) => row.node.key === focusedKey)
			? focusedKey
			: (rows[0]?.node.key ?? null);

	const focusRow = (key: string) => {
		setFocusedKey(key);
		listRef.current?.querySelector<HTMLElement>(`[data-nav-key="${CSS.escape(key)}"]`)?.focus();
	};

	/**
	 * Tree keyboard pattern (WAI-ARIA): Up/Down move focus, Right opens or goes
	 * to the first child, Left closes or goes to the parent, Enter/Space select.
	 * Alt+Up/Down reorder, mirroring the canvas arrows. Left/Right swap in RTL.
	 */
	const handleKeyDown = (event: React.KeyboardEvent, row: VisibleRow, at: number) => {
		const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
		const key = event.key;
		const forward = rtl ? "ArrowLeft" : "ArrowRight";
		const backward = rtl ? "ArrowRight" : "ArrowLeft";

		if (event.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
			event.preventDefault();
			onMove(row.node.key, key === "ArrowUp" ? "up" : "down");
			return;
		}

		if (key === "ArrowDown" || key === "ArrowUp") {
			event.preventDefault();
			const next = rows[at + (key === "ArrowDown" ? 1 : -1)];
			if (next) focusRow(next.node.key);
		} else if (key === forward) {
			event.preventDefault();
			if (row.hasChildren && !row.expanded) toggle(row.node.key);
			else if (row.expanded) focusRow(row.node.children[0]!.key);
		} else if (key === backward) {
			event.preventDefault();
			if (row.expanded) toggle(row.node.key);
			else if (row.node.parent) focusRow(row.node.parent);
		} else if (key === "Enter" || key === " ") {
			event.preventDefault();
			choose(row.node.key);
		} else if (key === "Home" && rows[0]) {
			event.preventDefault();
			focusRow(rows[0].node.key);
		} else if (key === "End" && rows.length > 0) {
			event.preventDefault();
			focusRow(rows[rows.length - 1]!.node.key);
		}
	};

	return (
		<aside
			id="bd-structure"
			aria-label={i18n._("Structure")}
			className="flex min-h-0 w-full flex-col bg-kumo-base"
		>
			<div
				{...headerProps}
				title={i18n._("Drag to move. Double-click to put it back.")}
				className="flex items-center justify-between border-b border-kumo-line px-3 py-2"
			>
				<h2 className="text-xs font-semibold tracking-wide text-kumo-subtle uppercase">
					{i18n._("Structure")}
				</h2>
				<button
					type="button"
					onClick={() => setCollapsed(allExpanded ? new Set(parents) : new Set())}
					title={allExpanded ? i18n._("Collapse all") : i18n._("Expand all")}
					aria-label={allExpanded ? i18n._("Collapse all") : i18n._("Expand all")}
					className="ms-auto me-1 rounded px-1 text-xs text-kumo-subtle hover:bg-kumo-tint"
				>
					<span aria-hidden="true">{allExpanded ? "\u229F" : "\u229E"}</span>
				</button>
				{onToggleMinimized ? (
					<button
						type="button"
						onClick={onToggleMinimized}
						aria-expanded={!minimized}
						title={minimized ? i18n._("Restore") : i18n._("Minimize")}
						aria-label={minimized ? i18n._("Restore structure panel") : i18n._("Minimize structure panel")}
						className="me-1 flex items-center rounded px-1 py-1 text-kumo-subtle hover:bg-kumo-tint"
					>
						<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							{minimized ? <rect x="5" y="5" width="14" height="14" rx="1" /> : <path d="M5 12h14" />}
						</svg>
					</button>
				) : null}
				<button
					type="button"
					onClick={onClose}
					aria-label={i18n._("Close structure panel")}
					className="rounded px-1 text-kumo-subtle hover:bg-kumo-tint"
				>
					<span aria-hidden="true">&times;</span>
				</button>
			</div>

			{minimized ? null : (
			<>
			<div className="border-b border-kumo-line px-3 py-2">
				<input
					type="search"
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					placeholder={i18n._("Filter elements…")}
					aria-label={i18n._("Filter elements")}
					className="w-full rounded border border-kumo-line bg-kumo-control px-2 py-1.5 text-xs text-kumo-default"
				/>
			</div>

			{rows.length === 0 ? (
				<p className="px-3 py-4 text-xs text-kumo-subtle">
					{filter ? i18n._("No element matches.") : i18n._("Nothing on the page yet.")}
				</p>
			) : (
				<div
					ref={listRef}
					role="tree"
					aria-label={i18n._("Page structure")}
					className="flex-1 overflow-y-auto py-1"
					{...drop.listProps}
				>
					{rows.map((row, at) => (
						<NavigatorRow
							key={row.node.key}
							row={row}
							position={at}
							selected={row.node.key === selectedKey}
							tabbable={row.node.key === rovingKey}
							zone={drop.zoneFor(row.node.key)}
							drop={drop}
							onToggle={toggle}
							onSelect={choose}
							onFocus={setFocusedKey}
							onKeyDown={handleKeyDown}
							label={labelOf(row.node)}
							onRename={onRename}
						/>
					))}
				</div>
			)}
			</>
			)}
		</aside>
	);
}

interface NavigatorRowProps {
	row: VisibleRow;
	position: number;
	selected: boolean;
	tabbable: boolean;
	zone: TreeDropZone | null;
	drop: TreeDrop;
	onToggle: (key: string) => void;
	onSelect: (key: string) => void;
	onFocus: (key: string) => void;
	onKeyDown: (event: React.KeyboardEvent, row: VisibleRow, at: number) => void;
	label?: string;
	onRename?: (key: string, name: string) => void;
}

function NavigatorRow({
	row,
	position,
	selected,
	tabbable,
	zone,
	drop,
	onToggle,
	onSelect,
	onFocus,
	onKeyDown,
	label,
	onRename,
}: NavigatorRowProps): React.JSX.Element {
	const { i18n } = useLingui();
	const { node, depth, hasChildren, expanded } = row;
	const widget = requireWidget(node.type);
	const dragProps = useDragSource({ kind: "existing", nodeKey: node.key });
	const [renaming, setRenaming] = React.useState(false);
	const shown = label ?? widget.label;

	const finishRename = (value: string | null) => {
		setRenaming(false);
		if (value !== null && value.trim() !== shown) onRename?.(node.key, value);
	};

	return (
		<div
			role="treeitem"
			data-nav-key={node.key}
			aria-level={depth + 1}
			aria-selected={selected}
			aria-expanded={hasChildren ? expanded : undefined}
			tabIndex={tabbable ? 0 : -1}
			onClick={() => onSelect(node.key)}
			onFocus={() => onFocus(node.key)}
			onKeyDown={(event) => onKeyDown(event, row, position)}
			{...(renaming ? {} : dragProps)}
			{...drop.rowProps(node.key, expanded)}
			style={{ paddingInlineStart: `${8 + depth * 16}px` }}
			className={[
				"relative flex cursor-grab items-center gap-1.5 py-1.5 pe-2 text-xs outline-none select-none",
				"focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:ring-inset",
				selected ? "bg-kumo-tint font-semibold text-kumo-strong" : "text-kumo-default hover:bg-kumo-tint",
				zone === "inside" ? "ring-2 ring-kumo-brand ring-inset" : "",
			].join(" ")}
		>
			{zone === "before" && (
				<span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-kumo-brand" />
			)}
			{zone === "after" && (
				<span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-kumo-brand" />
			)}

			{hasChildren ? (
				<button
					type="button"
					tabIndex={-1}
					aria-label={expanded ? i18n._("Collapse") : i18n._("Expand")}
					onClick={(event) => {
						event.stopPropagation();
						onToggle(node.key);
					}}
					className="flex size-4 shrink-0 items-center justify-center text-kumo-subtle"
				>
					<span
						aria-hidden="true"
						className={expanded ? "rotate-90" : "rtl:-scale-x-100"}
						style={{ display: "inline-block", fontSize: "8px" }}
					>
						&#9654;
					</span>
				</button>
			) : (
				<span aria-hidden="true" className="size-4 shrink-0" />
			)}

			<span aria-hidden="true" className="text-kumo-subtle" data-icon={widget.icon}>
				&#9638;
			</span>
			{renaming ? (
				<input
					autoFocus
					defaultValue={shown}
					aria-label={i18n._("Element name")}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => {
						// Typing a name must not drive the tree's keyboard controls.
						event.stopPropagation();
						if (event.key === "Enter") finishRename(event.currentTarget.value);
						if (event.key === "Escape") finishRename(null);
					}}
					onBlur={(event) => finishRename(event.currentTarget.value)}
					className="min-w-0 flex-1 rounded border border-kumo-brand bg-kumo-control px-1 text-xs text-kumo-default"
				/>
			) : (
				<span
					className="truncate"
					title={onRename ? i18n._("Double-click to rename") : undefined}
					onDoubleClick={(event) => {
						if (!onRename) return;
						event.stopPropagation();
						setRenaming(true);
					}}
				>
					{shown}
				</span>
			)}
		</div>
	);
}
