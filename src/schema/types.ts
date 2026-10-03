/**
 * Widget registry types.
 *
 * A `WidgetDefinition` is the single source of truth for each node type: the
 * palette entry, the seed block types, the default values and the render all
 * derive from it.
 *
 * ## Scope
 *
 * Right now the registry declares ONE widget: the container. The goal of this
 * stage is to prove the skeleton — the workspace, the tree, the drag of a
 * container into the canvas, and a save/load round trip. Widgets are added at a
 * later stage; adding one must never require touching the canvas.
 *
 * See `docs/02-data-contract.md`.
 */

/** Node types the builder knows about. */
export type NodeType =
	| "container"
	| "content_ref"
	| "heading"
	| "text"
	| "image"
	| "button"
	| "divider"
	| "template_ref";

/**
 * Field types a widget can declare.
 *
 * A deliberate subset of EmDash block field types: `json`, `reference`, `slug`
 * and nested `blocks` are forbidden inside a block, so the registry never
 * offers them.
 */
export type WidgetFieldType =
	| "string"
	| "text"
	| "url"
	| "number"
	| "boolean"
	| "select"
	| "image"
	| "color";

/** A widget field: becomes a column on the block type. */
export interface WidgetField {
	/** Prop name in the tree and column on the stored block. */
	slug: string;
	label: string;
	type: WidgetFieldType;
	required?: boolean;
	/** Choices for `select`. */
	options?: string[];
	/** Value written when the node is created. */
	default?: unknown;
}

/** A widget declaration. */
export interface WidgetDefinition {
	type: NodeType;
	/** Label shown in the palette. */
	label: string;
	/** Icon name from the admin icon set. */
	icon: string;
	/** Grouping in the palette. */
	category: string;
	/** `true` when the node accepts children. */
	container?: boolean;
	/** Allowed child types. Absent means none. */
	accepts?: NodeType[];
	/** `true` when the node can be dropped at the canvas root. */
	topLevel?: boolean;
	/** Not offered in the palette: created by the builder itself. */
	internal?: boolean;
	fields: WidgetField[];
}

/** Palette categories, in display order. */
export const WIDGET_CATEGORIES = ["Structure", "Basic", "Content"] as const;

export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number];
