/**
 * Tests for the Details panel's publishing state and site-timezone dates.
 *
 * Run: pnpm test
 */

import { describe, expect, it } from "vitest";

import { fromSiteLocal, publishingStateOf, seoImageUrl, toSiteLocal } from "./publishing";

describe("publishingStateOf", () => {
	it("maps the entry's state as EmDash's editor does", () => {
		const at = "2026-10-01T10:00:00.000Z";
		expect(publishingStateOf({ isLive: false, hasPendingChanges: true, scheduledAt: null })).toBe("draft");
		expect(publishingStateOf({ isLive: false, hasPendingChanges: true, scheduledAt: at })).toBe("scheduled");
		expect(publishingStateOf({ isLive: true, hasPendingChanges: false, scheduledAt: null })).toBe("published");
		expect(publishingStateOf({ isLive: true, hasPendingChanges: true, scheduledAt: null })).toBe(
			"published-with-changes",
		);
		expect(publishingStateOf({ isLive: true, hasPendingChanges: true, scheduledAt: at })).toBe(
			"update-scheduled",
		);
		expect(publishingStateOf({ isLive: true, hasPendingChanges: false, scheduledAt: at })).toBe(
			"published-scheduled",
		);
	});
});

describe("site timezone dates", () => {
	it("reads a datetime-local value in the site's timezone, not the browser's", () => {
		expect(fromSiteLocal("2026-01-15T09:30", "UTC")).toBe("2026-01-15T09:30:00.000Z");
		expect(fromSiteLocal("2026-01-15T09:30", "America/Lima")).toBe("2026-01-15T14:30:00.000Z");
		expect(fromSiteLocal("2026-07-15T09:30", "Europe/Madrid")).toBe("2026-07-15T07:30:00.000Z");
	});

	it("round-trips through the input value", () => {
		const iso = "2026-03-02T18:45:00.000Z";
		expect(fromSiteLocal(toSiteLocal(iso, "Asia/Tokyo"), "Asia/Tokyo")).toBe(iso);
	});

	it("rejects a time that does not exist on a DST change", () => {
		// Clocks jump from 02:00 to 03:00 in Madrid on 2026-03-29.
		expect(() => fromSiteLocal("2026-03-29T02:30", "Europe/Madrid")).toThrow();
	});

	it("rejects a malformed value", () => {
		expect(() => fromSiteLocal("tomorrow", "UTC")).toThrow();
		expect(toSiteLocal("not a date", "UTC")).toBe("");
	});
});

describe("seoImageUrl", () => {
	it("stores local media by its file route and provider media by its URL", () => {
		expect(seoImageUrl({ id: "m1", storageKey: "abc.png", url: "/x" })).toBe("/_emdash/api/media/file/abc.png");
		expect(seoImageUrl({ id: "m1", url: "/x" })).toBe("/_emdash/api/media/file/m1");
		expect(seoImageUrl({ id: "m1", provider: "cloudinary", url: "https://cdn.example/a.png" })).toBe(
			"https://cdn.example/a.png",
		);
	});
});
