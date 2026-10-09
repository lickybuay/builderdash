import { describe, expect, it } from "vitest";

import { blockTypeFor, WIDGETS } from "./registry";
import { builderSeedSchema } from "./seed";

describe("builderSeedSchema", () => {
	it("declares a block type for every widget, all allowed in the layout field", () => {
		const { fields, blockTypes } = builderSeedSchema();
		const slugs = blockTypes.map((type) => type.slug);
		expect(slugs).toEqual(WIDGETS.map((widget) => blockTypeFor(widget.type)));
		const layout = fields.find((field) => field.slug === "builder_layout") as {
			validation: { allowedTypes: string[] };
		};
		expect(layout.validation.allowedTypes).toEqual(slugs);
	});

	it("stores colors and URLs as strings, keeps select defaults and adds the parent pointer", () => {
		const { blockTypes } = builderSeedSchema();
		const container = blockTypes.find((type) => type.slug === "builder_container")!.versions[0]!.fields;
		expect(container.find((field) => field.slug === "background_color")?.type).toBe("string");
		expect(container.find((field) => field.slug === "gap")).toMatchObject({ type: "select", defaultValue: "md" });
		const button = blockTypes.find((type) => type.slug === "builder_button")!.versions[0]!.fields;
		expect(button.find((field) => field.slug === "url")?.type).toBe("string");
		for (const type of blockTypes) {
			expect(type.versions[0]!.fields.some((field) => field.slug === "parent_key")).toBe(true);
		}
	});

	it("can leave content refs out (templates have no content blocks to place)", () => {
		const { blockTypes } = builderSeedSchema({ includeContentRef: false });
		expect(blockTypes.some((type) => type.slug === "builder_content_ref")).toBe(false);
	});
});
