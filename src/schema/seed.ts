/**
 * The seed schema the builder needs, generated from the widget registry.
 *
 * EmDash only stores block types the seed declares: a widget missing here can
 * be added in the builder but never saved ("block type … is unavailable").
 * Generating the seed from `WIDGETS` keeps every widget storable, and is what
 * `builderdash-setup` writes into a site's `seed/seed.json` (it imports this
 * module from `seed/seed.mjs`, so it has no runtime dependencies).
 */

import { blockTypeFor, PARENT_FIELD, WIDGETS } from "./registry";
import type { WidgetField } from "./types";

/** A field of an EmDash seed block type. */
export interface SeedField {
	slug: string;
	label: string;
	type: string;
	defaultValue?: unknown;
	validation?: Record<string, unknown>;
}

export interface SeedBlockType {
	slug: string;
	label: string;
	description?: string;
	category: string;
	currentVersion: number;
	versions: Array<{ version: number; fields: SeedField[] }>;
}

export interface BuilderSeedSchema {
	/** Fields every buildable collection gets. */
	fields: Array<Record<string, unknown>>;
	/** One block type per widget. */
	blockTypes: SeedBlockType[];
}

/** Widget field type → EmDash block field type. */
const STORED_TYPE: Record<WidgetField["type"], string> = {
	string: "string",
	text: "text",
	url: "string",
	number: "number",
	boolean: "boolean",
	select: "select",
	image: "image",
	color: "string",
};

function seedField(field: WidgetField): SeedField {
	const out: SeedField = { slug: field.slug, label: field.label, type: STORED_TYPE[field.type] };
	if (field.type === "select") {
		if (field.default !== undefined) out.defaultValue = field.default;
		out.validation = { options: field.options ?? [] };
	}
	return out;
}

/** The parent pointer every block type carries (the hierarchy lives in it). */
const PARENT: SeedField = { slug: PARENT_FIELD, label: "Parent", type: "string", validation: { maxLength: 32 } };

/**
 * Seed fields and block types for the builder. `includeContentRef: false` is
 * for a collection whose entries have no content blocks of their own to place
 * (templates).
 */
export function builderSeedSchema(options: { includeContentRef?: boolean } = {}): BuilderSeedSchema {
	const includeContentRef = options.includeContentRef ?? true;
	const widgets = WIDGETS.filter((widget) => includeContentRef || widget.type !== "content_ref");
	const blockTypes: SeedBlockType[] = widgets.map((widget) => ({
		slug: blockTypeFor(widget.type),
		label: widget.label,
		description: `${widget.label} element of the BuilderDash page builder`,
		category: "Builder",
		currentVersion: 1,
		versions: [{ version: 1, fields: [...widget.fields.map(seedField), PARENT] }],
	}));
	return {
		fields: [
			{
				slug: "builder_layout",
				label: "Builder layout",
				type: "blocks",
				validation: { allowedTypes: blockTypes.map((type) => type.slug), maxItems: 100 },
			},
			{ slug: "builder_styles", label: "Builder styles", type: "json" },
		],
		blockTypes,
	};
}
