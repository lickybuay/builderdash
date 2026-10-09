/**
 * Open the builder when EmDash's admin creates or edits a TEMPLATE, instead of
 * its default content editor: the list's "Add New", its title links and its
 * pencil all land in the builder (EmDash has no hook to hide or retarget them).
 * EmDash's editor stays reachable with `?native=1` (`nativeEditUrl`), for the
 * fields the builder does not edit.
 *
 * Why an interception and not a hook: the content list's create button is a
 * router link to `/content/{collection}/new` (the admin's `ContentNewPage`), and
 * EmDash exposes no extension point for it — `contentEditorPanels` are not even
 * rendered on the "new" page (`!isNew && item ? … : []`). The admin is a
 * client-side SPA served for every `/_emdash/admin/*` path, so a server redirect
 * would never fire on an in-app navigation either. Watching the SPA's history is
 * the only place left.
 *
 * Two layers: a capture-phase click listener cancels the create link before the
 * router sees it (no flash), and a history watcher catches every other path to
 * the "new" page (with a one-frame flash). The click layer relies on EmDash
 * rendering the create button as an `<a href>` (TanStack `Link`); if that ever
 * becomes an onClick + navigate(), the flash returns silently and only the
 * history watcher remains.
 *
 * Scope: only the templates collection. Other collections keep EmDash's own
 * create flow. Widen `TEMPLATE_COLLECTIONS` if the builder should own more.
 *
 * If EmDash later grows a supported hook, this module can be deleted and the
 * wiring in `index.tsx` removed.
 */

import { PLUGIN_ID } from "../plugin-id";

/** Collections whose "create" opens the builder's blank canvas. */
const TEMPLATE_COLLECTIONS: ReadonlySet<string> = new Set(["templates"]);

/** The admin's new-entry pathname for a collection. */
const NEW_ENTRY = /^\/_emdash\/admin\/content\/([^/]+)\/new\/?$/;
/**
 * The admin's edit pathname for one entry (the list's title link and pencil).
 * Exactly `/content/<collection>/<id>` with an id-shaped segment (EmDash ids
 * are ULIDs): sub-routes and word segments (`trash`…) stay EmDash's.
 */
const EDIT_ENTRY = /^\/_emdash\/admin\/content\/([^/]+)\/([0-9A-Za-z_-]{10,})\/?$/;
/**
 * Query flag that keeps EmDash's own editor for a template, for the fields the
 * builder does not edit (category, display target, revisions…).
 */
export const NATIVE_EDITOR_PARAM = "native";

/** The builder's new-entry URL: no `id`, so the shell shows a blank canvas. */
export function builderNewEntryUrl(collection: string): string {
	return `/_emdash/admin/plugins/${encodeURIComponent(PLUGIN_ID)}/builder?collection=${encodeURIComponent(collection)}`;
}

/** The builder's URL for an existing entry. */
export function builderEditUrl(collection: string, entryId: string): string {
	return `${builderNewEntryUrl(collection)}&id=${encodeURIComponent(entryId)}`;
}

/** EmDash's own editor for an entry, kept reachable (see `NATIVE_EDITOR_PARAM`). */
export function nativeEditUrl(collection: string, entryId: string): string {
	return `/_emdash/admin/content/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}?${NATIVE_EDITOR_PARAM}=1`;
}

let installed = false;

/**
 * Where a same-origin admin URL for a template should go instead: the
 * builder's blank canvas for "new", the builder for an entry's edit link.
 * `null` leaves the navigation alone: other origins, other collections, a path
 * only in the query or hash, sub-routes, the native-editor escape, and a
 * malformed escape (never thrown into the router).
 */
function builderTargetOf(url: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url, window.location.href);
	} catch {
		return null;
	}
	if (parsed.origin !== window.location.origin) return null;
	try {
		const created = NEW_ENTRY.exec(parsed.pathname);
		if (created) {
			const collection = decodeURIComponent(created[1]!);
			return TEMPLATE_COLLECTIONS.has(collection) ? builderNewEntryUrl(collection) : null;
		}
		const edited = EDIT_ENTRY.exec(parsed.pathname);
		if (edited && !parsed.searchParams.has(NATIVE_EDITOR_PARAM)) {
			const collection = decodeURIComponent(edited[1]!);
			return TEMPLATE_COLLECTIONS.has(collection) ? builderEditUrl(collection, decodeURIComponent(edited[2]!)) : null;
		}
	} catch {
		return null;
	}
	return null;
}

function maybeRedirect(url: string): void {
	const target = builderTargetOf(url);
	if (target) window.location.assign(target);
}

/**
 * Installs the watcher once. Safe to call on every admin load: it no-ops after
 * the first call and in a non-browser context.
 */
export function installNewEntryRedirect(): void {
	if (installed || typeof window === "undefined") return;
	installed = true;

	// A plain click on a "create" link: cancel it in the capture phase, before
	// React's handlers run. The router's Link skips navigation when the event is
	// already defaultPrevented, so EmDash's editor never renders — no flash.
	// Modified clicks (new tab/window) are left alone; that load is caught by the
	// direct-load check below.
	document.addEventListener(
		"click",
		(event) => {
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			if (!(event.target instanceof Element)) return;
			const anchor = event.target.closest("a[href]");
			if (!(anchor instanceof HTMLAnchorElement)) return;
			if (anchor.target && anchor.target !== "_self") return;
			const target = builderTargetOf(anchor.href);
			if (!target) return;
			event.preventDefault();
			window.location.assign(target);
		},
		true,
	);

	// Fallback for navigations that are not link clicks (programmatic navigate(),
	// back/forward). These still render EmDash's editor for a frame first.
	// The SPA router navigates with pushState/replaceState. Wrap both: run the
	// original first (so every other collection navigates normally), then
	// decide. A template gets a full navigation to the builder.
	for (const method of ["pushState", "replaceState"] as const) {
		const original = window.history[method].bind(window.history);
		window.history[method] = ((state: unknown, title: string, url?: string | URL | null) => {
			original(state, title, url as string | URL | null);
			if (url != null) maybeRedirect(new URL(String(url), window.location.href).href);
		}) as History[typeof method];
	}

	window.addEventListener("popstate", () => maybeRedirect(window.location.href));
	// A direct load of a new-entry URL (typed, bookmarked, or a full reload).
	maybeRedirect(window.location.href);
}
