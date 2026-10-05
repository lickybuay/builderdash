/**
 * Open the builder when EmDash's admin creates a TEMPLATE, instead of its
 * default content editor.
 *
 * Why an interception and not a hook: the content list's create button is a
 * router link to `/content/{collection}/new` (the admin's `ContentNewPage`), and
 * EmDash exposes no extension point for it — `contentEditorPanels` are not even
 * rendered on the "new" page (`!isNew && item ? … : []`). The admin is a
 * client-side SPA served for every `/_emdash/admin/*` path, so a server redirect
 * would never fire on an in-app navigation either. Watching the SPA's history is
 * the only place left.
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

/** The admin's new-entry URL for a collection. */
const NEW_ENTRY = /\/_emdash\/admin\/content\/([^/?#]+)\/new\/?(?:[?#]|$)/;

/** The builder's new-entry URL: no `id`, so the shell shows a blank canvas. */
export function builderNewEntryUrl(collection: string): string {
	return `/_emdash/admin/plugins/${encodeURIComponent(PLUGIN_ID)}/builder?collection=${encodeURIComponent(collection)}`;
}

let installed = false;

function collectionOf(url: string): string | null {
	const match = NEW_ENTRY.exec(url);
	return match ? decodeURIComponent(match[1]!) : null;
}

function maybeRedirect(url: string): void {
	const collection = collectionOf(url);
	if (!collection || !TEMPLATE_COLLECTIONS.has(collection)) return;
	window.location.assign(builderNewEntryUrl(collection));
}

/**
 * Installs the watcher once. Safe to call on every admin load: it no-ops after
 * the first call and in a non-browser context.
 */
export function installNewEntryRedirect(): void {
	if (installed || typeof window === "undefined") return;
	installed = true;

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
