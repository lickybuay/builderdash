/**
 * New-entry redirect tests: a click on the admin's "create" link for the
 * templates collection opens the builder instead; everything else is left to
 * the admin's router.
 *
 * `installNewEntryRedirect` installs once per module, so each test loads a
 * fresh copy of the module.
 *
 * Run: pnpm test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BUILDER_URL = "/_emdash/admin/plugins/builderdash/builder?collection=templates";

let assign: ReturnType<typeof vi.fn>;

async function install(): Promise<void> {
	vi.resetModules();
	const mod = await import("./new-entry-redirect");
	mod.installNewEntryRedirect();
}

function click(href: string, init: MouseEventInit = {}, attrs: Record<string, string> = {}) {
	const anchor = document.createElement("a");
	anchor.setAttribute("href", href);
	for (const [name, value] of Object.entries(attrs)) anchor.setAttribute(name, value);
	document.body.append(anchor);
	const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
	// jsdom cannot navigate: cancel at the window (after the capture-phase
	// listener under test ran) and report whether it was already prevented.
	let prevented = false;
	const observe = (e: Event) => {
		prevented = e.defaultPrevented;
		e.preventDefault();
	};
	window.addEventListener("click", observe, { once: true });
	anchor.dispatchEvent(event);
	window.removeEventListener("click", observe);
	return { defaultPrevented: prevented };
}

let listeners: Array<[string, EventListenerOrEventListenerObject, boolean | undefined]>;
let originalPush: History["pushState"];
let originalReplace: History["replaceState"];

beforeEach(() => {
	assign = vi.fn();
	const real = window.location;
	vi.spyOn(window, "location", "get").mockReturnValue({
		href: real.href,
		origin: real.origin,
		assign,
	} as unknown as Location);

	originalPush = window.history.pushState;
	originalReplace = window.history.replaceState;
	// Remove the document listeners each install adds.
	listeners = [];
	const add = document.addEventListener.bind(document);
	vi.spyOn(document, "addEventListener").mockImplementation((type, listener, options) => {
		listeners.push([type, listener, typeof options === "boolean" ? options : options?.capture]);
		add(type, listener, options);
	});
});

afterEach(() => {
	for (const [type, listener, capture] of listeners) document.removeEventListener(type, listener, capture);
	window.history.pushState = originalPush;
	window.history.replaceState = originalReplace;
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

describe("installNewEntryRedirect", () => {
	it("intercepts a click on the templates create link and opens the builder", async () => {
		await install();
		const event = click("/_emdash/admin/content/templates/new");
		expect(event.defaultPrevented).toBe(true);
		expect(assign).toHaveBeenCalledWith(BUILDER_URL);
	});

	it("leaves other collections alone", async () => {
		await install();
		const event = click("/_emdash/admin/content/pages/new");
		expect(event.defaultPrevented).toBe(false);
		expect(assign).not.toHaveBeenCalled();
	});

	it("leaves modified clicks and new-tab links alone", async () => {
		await install();
		for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
			expect(click("/_emdash/admin/content/templates/new", init).defaultPrevented).toBe(false);
		}
		expect(click("/_emdash/admin/content/templates/new", {}, { target: "_blank" }).defaultPrevented).toBe(false);
		expect(assign).not.toHaveBeenCalled();
	});

	it("ignores another origin and the path only appearing in a query", async () => {
		await install();
		expect(click("https://evil.example/_emdash/admin/content/templates/new").defaultPrevented).toBe(false);
		expect(click("/login?next=/_emdash/admin/content/templates/new").defaultPrevented).toBe(false);
		expect(click("/elsewhere#/_emdash/admin/content/templates/new").defaultPrevented).toBe(false);
		expect(assign).not.toHaveBeenCalled();
	});

	it("does not throw on a malformed escape in the collection", async () => {
		await install();
		expect(() => click("/_emdash/admin/content/%E0%A4%A/new")).not.toThrow();
		expect(click("/_emdash/admin/content/%/new").defaultPrevented).toBe(false);
		expect(assign).not.toHaveBeenCalled();
	});
});
