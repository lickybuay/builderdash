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
		// A container holds containers. That is the whole structure at this
		// stage: nesting is what proves the tree, the drag and the render work.
		accepts: ["container"],
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
		if (field.default !== undefined) props[field.slug] = field.default;
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
		widgets: WIDGETS.filter((widget) => widget.category === category),
	})).filter((group) => group.widgets.length > 0);
}

/** `true` when `childType` may live inside `parentType`. */
export function canContain(parentType: NodeType, childType: NodeType): boolean {
	return BY_TYPE.get(parentType)?.accepts?.includes(childType) ?? false;
}

/** The EmDash block type name for a node. */
export function blockTypeFor(type: NodeType): string {
	return `builder_${type}`;
}
