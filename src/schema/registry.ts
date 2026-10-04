/**
 * Widget registry.
 *
 * Single source of truth. The palette, the seed block types, the defaults and
 * the render all read from here.
 *
 * Hard rule: a field that is not declared in `fields` is never written to
 * `props`. The inspector cannot invent props.
 */

import type { NodeType, WidgetDefinition } from "./types";
import { WIDGET_CATEGORIES } from "./types";

export const WIDGETS: readonly WidgetDefinition[] = [
	{
		type: "container",
		label: "Container",
		icon: "rows",
		category: "Structure",
		container: true,
		// Containers nest, and can hold the page's existing content blocks,
		// all basic widgets, and template references.
		accepts: ["container", "content_ref", "template_ref", "heading", "text", "image", "button", "divider"],
		topLevel: true,
		fields: [
			{
				slug: "gap",
				label: "Gap",
				type: "select",
				options: ["none", "sm", "md", "lg"],
				default: "md",
			},
			{
				slug: "direction",
				label: "Direction",
				type: "select",
				options: ["column", "row"],
				default: "column",
			},
			{
				slug: "background_color",
				label: "Background",
				type: "color",
			},
		],
	},
	{
		type: "heading",
		label: "Heading",
		icon: "heading",
		category: "Basic",
		topLevel: true,
		fields: [
			{ slug: "text", label: "Text", type: "string", required: true },
			{
				slug: "level",
				label: "Level",
				type: "select",
				options: ["h1", "h2", "h3", "h4", "h5", "h6"],
				default: "h2",
			},
		],
	},
	{
		type: "text",
		label: "Text",
		icon: "text-aa",
		category: "Basic",
		topLevel: true,
		fields: [
			{ slug: "content", label: "Content", type: "text", required: true },
		],
	},
	{
		type: "image",
		label: "Image",
		icon: "image",
		category: "Basic",
		topLevel: true,
		fields: [
			{ slug: "image", label: "Image", type: "image", default: {} },
			{ slug: "alt", label: "Alt text", type: "string" },
			{
				slug: "width",
				label: "Width",
				type: "select",
				options: ["auto", "full", "half", "third"],
				default: "auto",
			},
			{
				slug: "height",
				label: "Height",
				type: "select",
				options: ["auto", "short", "medium", "tall"],
				default: "auto",
			},
			{
				slug: "object_fit",
				label: "Object fit",
				type: "select",
				options: ["cover", "contain", "fill"],
				default: "cover",
			},
		],
	},
	{
		type: "button",
		label: "Button",
		icon: "arrow-right",
		category: "Basic",
		topLevel: true,
		fields: [
			{ slug: "label", label: "Label", type: "string", required: true },
			{ slug: "url", label: "URL", type: "url", default: "#" },
		],
	},
	{
		type: "divider",
		label: "Divider",
		icon: "minus",
		category: "Basic",
		topLevel: true,
		fields: [
			{
				slug: "color",
				label: "Color",
				type: "select",
				options: ["default", "brand", "accent", "muted", "clear"],
				default: "default",
			},
			{
				slug: "thickness",
				label: "Thickness",
				type: "select",
				options: ["sm", "md", "lg"],
				default: "md",
			},
			{
				slug: "style",
				label: "Style",
				type: "select",
				options: ["solid", "dashed", "dotted"],
				default: "solid",
			},
		],
	},
	{
		// A block that already lives in the entry's `content` field (a hero, an
		// FAQ…). The builder places it; its text is edited in the EmDash editor.
		type: "content_ref",
		label: "Content block",
		icon: "squares-four",
		category: "Content",
		topLevel: true,
		internal: true,
		fields: [{ slug: "ref_key", label: "Content block", type: "string", required: true }],
	},
	{
		// A reference to a reusable template from the Templates collection.
		//
		// Internal: inserting a template COPIES its widgets into the document
		// (see `insertSubtree`), which is what the inserter promises. A live
		// reference would need a re-fetch on every render, so it stays out of
		// the palette and is kept only so existing refs and old saves still
		// round-trip.
		type: "template_ref",
		label: "Template",
		icon: "squares",
		category: "Content",
		internal: true,
		topLevel: true,
		container: true,
		accepts: ["container", "heading", "text", "image", "button", "divider"],
		fields: [
			{ slug: "ref_id", label: "Template ID", type: "string", required: true },
			{ slug: "css_id", label: "CSS ID", type: "string" },
			{ slug: "css_classes", label: "CSS Classes", type: "string" },
		],
	},
];

/**
 * Field carrying the parent pointer.
 *
 * A stored block only accepts `_type`, `_version`, `_key` and the fields
 * declared on its block type, so the hierarchy cannot ride on a `_parent`
 * convention: EmDash rejects unknown keys with `VALIDATION_ERROR`.
 *
 * The field is declared on every container block type in the seed, and it is
 * marked as structural here so the serializer knows to write it and the
 * inspector knows never to show it.
 */
export const PARENT_FIELD = "parent_key";

/** Type index for O(1) lookups. */
const BY_TYPE: ReadonlyMap<NodeType, WidgetDefinition> = new Map(
	WIDGETS.map((widget) => [widget.type, widget]),
);

/** Returns the definition for a node type, or `undefined`. */
export function getWidget(type: NodeType): WidgetDefinition | undefined {
	return BY_TYPE.get(type);
}

/** Returns the definition or throws. Use when the type is already validated. */
export function requireWidget(type: NodeType): WidgetDefinition {
	const widget = BY_TYPE.get(type);
	if (!widget) throw new Error(`[builderdash] Unknown node type: "${type}"`);
	return widget;
}

/**
 * Builds the default props for a widget from its fields.
 * Only fields declaring a `default` are included.
 */
export function defaultProps(type: NodeType): Record<string, unknown> {
	const widget = BY_TYPE.get(type);
	if (!widget) return {};
	const props: Record<string, unknown> = {};
	for (const field of widget.fields) {
		if (field.default !== undefined) {
			props[field.slug] = field.default;
		} else if (field.required && (field.type === "string" || field.type === "text")) {
			// Required text fields get their label as a visible placeholder.
			props[field.slug] = field.label ?? field.slug;
		}
	}
	return props;
}

/** Widgets that can be dropped at the canvas root. */
export function topLevelWidgets(): WidgetDefinition[] {
	return WIDGETS.filter((widget) => widget.topLevel === true);
}

/** Widgets that can be dropped inside a container of this type. */
export function childWidgets(parentType: NodeType): WidgetDefinition[] {
	const parent = BY_TYPE.get(parentType);
	if (!parent?.accepts?.length) return [];
	return parent.accepts
		.map((type) => BY_TYPE.get(type))
		.filter((widget): widget is WidgetDefinition => widget !== undefined);
}

/** Widgets grouped by category, in declaration order. */
export function widgetsByCategory(): Array<{
	category: string;
	widgets: WidgetDefinition[];
}> {
	return WIDGET_CATEGORIES.map((category) => ({
		category,
		widgets: WIDGETS.filter((widget) => widget.category === category && !widget.internal),
	})).filter((group) => group.widgets.length > 0);
}

/** Every node type the registry knows, used to accept stored blocks. */
export function knownTypes(): NodeType[] {
	return WIDGETS.map((widget) => widget.type);
}

/** `true` when `childType` may live inside `parentType`. */
export function canContain(parentType: NodeType, childType: NodeType): boolean {
	return BY_TYPE.get(parentType)?.accepts?.includes(childType) ?? false;
}

/** The EmDash block type name for a node. */
export function blockTypeFor(type: NodeType): string {
	return `builder_${type}`;
}
