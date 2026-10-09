/**
 * Tests for the template-reference picker's candidate filter.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { embeddableTemplates, type TemplateSummary } from "./useTemplates";

function t(id: string, over: Partial<TemplateSummary> = {}): TemplateSummary {
	return { id, title: id, category: "General", ...over };
}

const ids = (list: TemplateSummary[]) => list.map((x) => x.id);

describe("embeddableTemplates", () => {
	it("excludes the current template", () => {
		expect(ids(embeddableTemplates([t("a"), t("b")], "a"))).toEqual(["b"]);
	});

	it("excludes templates that reach the current one directly or transitively", () => {
		const list = [t("cur"), t("direct", { refIds: ["cur"] }), t("A", { refIds: ["B"] }), t("B", { refIds: ["cur"] }), t("free")];
		expect(ids(embeddableTemplates(list, "cur"))).toEqual(["free"]);
	});

	it("excludes header, footer and sidebar parts", () => {
		const list = [t("h", { display_target: "header" }), t("f", { display_target: "footer" }), t("s", { display_target: "sidebar" }), t("ok", { display_target: "anywhere" })];
		expect(ids(embeddableTemplates(list, "x"))).toEqual(["ok"]);
	});

	it("returns every non-part template without a current id", () => {
		const list = [t("a", { refIds: ["b"] }), t("b"), t("h", { display_target: "header" })];
		expect(ids(embeddableTemplates(list, null))).toEqual(["a", "b"]);
	});

	it("terminates on cyclic data", () => {
		const list = [t("A", { refIds: ["B"] }), t("B", { refIds: ["A"] }), t("C")];
		expect(ids(embeddableTemplates(list, "C"))).toEqual(["A", "B"]);
	});
});
