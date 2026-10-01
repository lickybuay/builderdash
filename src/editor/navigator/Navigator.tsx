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
}

/** A row as rendered: the node plus where it sits in the visible list. */
interface VisibleRow {
	node: BuilderNode;
	depth: number;
	hasChildren: boolean;
	expanded: boolean;
}

/** Flattens the tree, skipping the children of collapsed nodes. */
function visibleRows(tree: BuilderTree, collapsed: ReadonlySet<string>): VisibleRow[] {
	const rows: VisibleRow[] = [];
	const visit = (nodes: BuilderTree, depth: number) => {
		for (const node of nodes) {
			const hasChildren = node.children.length > 0;
			const expanded = hasChildren && !collapsed.has(node.key);
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
}: NavigatorProps): React.JSX.Element {
	const { i18n } = useLingui();
	const listRef = React.useRef<HTMLDivElement | null>(null);
	const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());
	const [focusedKey, setFocusedKey] = React.useState<string | null>(null);

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
	const rows = visibleRows(tree, collapsed);

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
			onSelect(row.node.key);
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
			className="flex w-64 shrink-0 flex-col border-s border-kumo-line bg-kumo-base"
		>
			<div className="flex items-center justify-between border-b border-kumo-line px-3 py-2">
				<h2 className="text-xs font-semibold tracking-wide text-kumo-subtle uppercase">
					{i18n._("Structure")}
				</h2>
				<button
					type="button"
					onClick={onClose}
					aria-label={i18n._("Close structure panel")}
					className="rounded px-1 text-kumo-subtle hover:bg-kumo-tint"
				>
					<span aria-hidden="true">&times;</span>
				</button>
			</div>

			{rows.length === 0 ? (
				<p className="px-3 py-4 text-xs text-kumo-subtle">
					{i18n._("Nothing on the page yet.")}
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
							onSelect={onSelect}
							onFocus={setFocusedKey}
							onKeyDown={handleKeyDown}
						/>
					))}
				</div>
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
}: NavigatorRowProps): React.JSX.Element {
	const { i18n } = useLingui();
	const { node, depth, hasChildren, expanded } = row;
	const widget = requireWidget(node.type);
	const dragProps = useDragSource({ kind: "existing", nodeKey: node.key });

	// Every row would otherwise read "Container"; the direction tells them apart.
	const detail = typeof node.props.direction === "string" ? node.props.direction : null;

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
			{...dragProps}
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
			<span className="truncate">{widget.label}</span>
			{detail && <span className="truncate text-kumo-subtle">· {detail}</span>}
		</div>
	);
}
