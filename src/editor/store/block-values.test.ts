/**
 * Tests for new content blocks: created valid, and the pre-save check.
 *
 * The block types mirror the marketing template's seed: a required list with
 * a minimum, select options on sub-fields, defaults.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { createBlockValue, missingRequired, type BlockTypeDef } from "./block-values";

const features: BlockTypeDef = {
	slug: "marketing_features",
	label: "Features",
	currentVersion: 1,
	versions: [
		{
			version: 1,
			fields: [
				{ slug: "anchor_id", label: "Anchor ID", type: "string" },
				{ slug: "headline", label: "Headline", type: "string", required: true },
				{ slug: "subheadline", label: "Subheadline", type: "text" },
				{
					slug: "features",
					label: "Features",
					type: "repeater",
					required: true,
					validation: {
						minItems: 1,
						maxItems: 12,
						subFields: [
							{ slug: "icon", label: "Icon", type: "select", required: true, options: ["zap", "shield"] },
							{ slug: "title", label: "Title", type: "string", required: true },
							{ slug: "description", label: "Description", type: "text", required: true },
						],
					},
				},
			],
		},
	],
};

const hero: BlockTypeDef = {
	slug: "marketing_hero",
	label: "Hero",
	currentVersion: 2,
	versions: [
		{ version: 1, fields: [] },
		{
			version: 2,
			fields: [
				{ slug: "headline", label: "Headline", type: "string", required: true },
				{ slug: "centered", label: "Centered", type: "boolean", defaultValue: false },
				{ slug: "size", label: "Size", type: "select", required: true, validation: { options: ["md", "lg"] } },
			],
		},
	],
};

describe("createBlockValue", () => {
	it("creates a block that already passes the required rules", () => {
		const block = createBlockValue(features, "k1");
		expect(block).toEqual({
			_type: "marketing_features",
			_version: 1,
			_key: "k1",
			headline: "Headline",
			features: [{ icon: "zap", title: "Title", description: "Description" }],
		});
		expect(missingRequired(block, features.versions[0]!.fields)).toBeNull();
	});

	it("uses the active version, defaults and field-level select options", () => {
		expect(createBlockValue(hero, "k2")).toEqual({
			_type: "marketing_hero",
			_version: 2,
			_key: "k2",
			headline: "Headline",
			centered: false,
			size: "md",
		});
	});
});

describe("missingRequired", () => {
	const fields = features.versions[0]!.fields;

	it("points at an empty required field", () => {
		const block = { ...createBlockValue(features, "k"), headline: "" };
		expect(missingRequired(block, fields)).toBe("headline");
	});

	it("points at a list below its minimum, and inside list items", () => {
		expect(missingRequired({ ...createBlockValue(features, "k"), features: [] }, fields)).toBe("features");
		const block = createBlockValue(features, "k");
		block.features = [{ icon: "zap", title: "", description: "x" }];
		expect(missingRequired(block, fields)).toBe("features[0].title");
	});
});
