/**
 * Edit-link redirect tests: a click on a template's edit link opens the
 * builder; the native escape, other collections and sub-routes are left to the
 * admin's router.
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

const ID = "01M4H2FZ3NWWTJ14JSJ2HZ38CJ";

describe("edit links for templates", () => {
	it("opens the builder for a template's edit link", async () => {
		await install();
		const event = click(`/_emdash/admin/content/templates/${ID}?locale=en`);
		expect(event.defaultPrevented).toBe(true);
		const target = String(assign.mock.calls[0]![0]);
		expect(target).toContain("collection=templates");
		expect(target).toContain(`id=${ID}`);
	});

	it("leaves the native editor escape alone", async () => {
		await install();
		expect(click(`/_emdash/admin/content/templates/${ID}?locale=en&native=1`).defaultPrevented).toBe(false);
		expect(assign).not.toHaveBeenCalled();
	});

	it("leaves word segments, other collections and sub-routes alone", async () => {
		await install();
		expect(click("/_emdash/admin/content/templates/trash").defaultPrevented).toBe(false);
		expect(click(`/_emdash/admin/content/pages/${ID}`).defaultPrevented).toBe(false);
		expect(click(`/_emdash/admin/content/templates/${ID}/revisions`).defaultPrevented).toBe(false);
		expect(assign).not.toHaveBeenCalled();
	});
});

describe("url builders", () => {
	it("encodes ids", async () => {
		vi.resetModules();
		const { builderEditUrl, nativeEditUrl } = await import("./new-entry-redirect");
		expect(builderEditUrl("templates", "a b&c")).toContain("&id=a%20b%26c");
		expect(nativeEditUrl("templates", "a/b c")).toBe("/_emdash/admin/content/templates/a%2Fb%20c?native=1");
	});
});
