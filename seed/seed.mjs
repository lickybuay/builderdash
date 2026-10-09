//#region src/schema/registry.ts
const WIDGETS = [
	{
		type: "container",
		label: "Container",
		icon: "rows",
		category: "Structure",
		container: true,
		accepts: [
			"container",
			"content_ref",
			"template_ref",
			"heading",
			"text",
			"image",
			"button",
			"divider"
		],
		topLevel: true,
		fields: [
			{
				slug: "gap",
				label: "Gap",
				type: "select",
				options: [
					"none",
					"sm",
					"md",
					"lg"
				],
				default: "md"
			},
			{
				slug: "direction",
				label: "Direction",
				type: "select",
				options: ["column", "row"],
				default: "column"
			},
			{
				slug: "background_color",
				label: "Background",
				type: "color"
			}
		]
	},
	{
		type: "heading",
		label: "Heading",
		icon: "heading",
		category: "Basic",
		topLevel: true,
		fields: [{
			slug: "text",
			label: "Text",
			type: "string",
			required: true
		}, {
			slug: "level",
			label: "Level",
			type: "select",
			options: [
				"h1",
				"h2",
				"h3",
				"h4",
				"h5",
				"h6"
			],
			default: "h2"
		}]
	},
	{
		type: "text",
		label: "Text",
		icon: "text-aa",
		category: "Basic",
		topLevel: true,
		fields: [{
			slug: "content",
			label: "Content",
			type: "text",
			required: true
		}]
	},
	{
		type: "image",
		label: "Image",
		icon: "image",
		category: "Basic",
		topLevel: true,
		fields: [
			{
				slug: "image",
				label: "Image",
				type: "image",
				default: {}
			},
			{
				slug: "alt",
				label: "Alt text",
				type: "string"
			},
			{
				slug: "width",
				label: "Width",
				type: "select",
				options: [
					"auto",
					"full",
					"half",
					"third"
				],
				default: "auto"
			},
			{
				slug: "height",
				label: "Height",
				type: "select",
				options: [
					"auto",
					"short",
					"medium",
					"tall"
				],
				default: "auto"
			},
			{
				slug: "object_fit",
				label: "Object fit",
				type: "select",
				options: [
					"cover",
					"contain",
					"fill"
				],
				default: "cover"
			}
		]
	},
	{
		type: "button",
		label: "Button",
		icon: "arrow-right",
		category: "Basic",
		topLevel: true,
		fields: [{
			slug: "label",
			label: "Label",
			type: "string",
			required: true
		}, {
			slug: "url",
			label: "URL",
			type: "url",
			default: "#"
		}]
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
				options: [
					"default",
					"brand",
					"accent",
					"muted",
					"clear"
				],
				default: "default"
			},
			{
				slug: "thickness",
				label: "Thickness",
				type: "select",
				options: [
					"sm",
					"md",
					"lg"
				],
				default: "md"
			},
			{
				slug: "style",
				label: "Style",
				type: "select",
				options: [
					"solid",
					"dashed",
					"dotted"
				],
				default: "solid"
			}
		]
	},
	{
		type: "content_ref",
		label: "Content block",
		icon: "squares-four",
		category: "Content",
		topLevel: true,
		internal: true,
		fields: [{
			slug: "ref_key",
			label: "Content block",
			type: "string",
			required: true
		}]
	},
	{
		type: "template_ref",
		label: "Template",
		icon: "squares",
		category: "Content",
		internal: true,
		topLevel: true,
		fields: [
			{
				slug: "ref_id",
				label: "Template",
				type: "string",
				required: true,
				default: ""
			},
			{
				slug: "css_id",
				label: "CSS ID",
				type: "string"
			},
			{
				slug: "css_classes",
				label: "CSS Classes",
				type: "string"
			}
		]
	}
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
const PARENT_FIELD = "parent_key";
/** Type index for O(1) lookups. */
const BY_TYPE = new Map(WIDGETS.map((widget) => [widget.type, widget]));
/** The EmDash block type name for a node. */
function blockTypeFor(type) {
	return `builder_${type}`;
}

//#endregion
//#region src/schema/seed.ts
/**
* The seed schema the builder needs, generated from the widget registry.
*
* EmDash only stores block types the seed declares: a widget missing here can
* be added in the builder but never saved ("block type … is unavailable").
* Generating the seed from `WIDGETS` keeps every widget storable, and is what
* `builderdash-setup` writes into a site's `seed/seed.json` (it imports this
* module from `seed/seed.mjs`, so it has no runtime dependencies).
*/
/** Widget field type → EmDash block field type. */
const STORED_TYPE = {
	string: "string",
	text: "text",
	url: "string",
	number: "number",
	boolean: "boolean",
	select: "select",
	image: "image",
	color: "string"
};
function seedField(field) {
	const out = {
		slug: field.slug,
		label: field.label,
		type: STORED_TYPE[field.type]
	};
	if (field.type === "select") {
		if (field.default !== void 0) out.defaultValue = field.default;
		out.validation = { options: field.options ?? [] };
	}
	return out;
}
/** The parent pointer every block type carries (the hierarchy lives in it). */
const PARENT = {
	slug: PARENT_FIELD,
	label: "Parent",
	type: "string",
	validation: { maxLength: 32 }
};
/**
* Seed fields and block types for the builder. `includeContentRef: false` is
* for a collection whose entries have no content blocks of their own to place
* (templates).
*/
function builderSeedSchema(options = {}) {
	const includeContentRef = options.includeContentRef ?? true;
	const blockTypes = WIDGETS.filter((widget) => includeContentRef || widget.type !== "content_ref").map((widget) => ({
		slug: blockTypeFor(widget.type),
		label: widget.label,
		description: `${widget.label} element of the BuilderDash page builder`,
		category: "Builder",
		currentVersion: 1,
		versions: [{
			version: 1,
			fields: [...widget.fields.map(seedField), PARENT]
		}]
	}));
	return {
		fields: [{
			slug: "builder_layout",
			label: "Builder layout",
			type: "blocks",
			validation: {
				allowedTypes: blockTypes.map((type) => type.slug),
				maxItems: 100
			}
		}, {
			slug: "builder_styles",
			label: "Builder styles",
			type: "json"
		}],
		blockTypes
	};
}

//#endregion
export { builderSeedSchema };