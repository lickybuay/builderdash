/**
 * Send EmDash's "Create <entry>" action to the builder for buildable
 * collections, instead of its default content editor.
 *
 * Why an interception and not a hook: the content list's create button is a
 * router link to `/content/{collection}/new` (see the admin's `ContentNewPage`),
 * and EmDash exposes no extension point for it — `contentEditorPanels` are not
 * even rendered on the "new" page (`!isNew && item ? … : []`). The admin is a
 * client-side SPA served for every `/_emdash/admin/*` path, so a server redirect
 * would never fire on an in-app navigation either. Watching the SPA's history is
 * the only place left.
 *
 * Scope: only collections that declare `builder_layout` (the same rule the
 * builder itself uses) are redirected; every other collection is untouched.
 * The redirect is a full navigation to the builder's new-entry screen.
 *
 * If EmDash later grows a supported hook, this module can be deleted and the
 * wiring in `index.tsx` removed.
 */

import { PLUGIN_ID } from "../plugin-id";

/** The admin's new-entry URL for a collection. */
const NEW_ENTRY = /\/_emdash\/admin\/content\/([^/?#]+)\/new\/?(?:[?#]|$)/;

/** The builder's new-entry URL: no `id`, so the shell shows a blank canvas. */
export function builderNewEntryUrl(collection: string): string {
	return `/_emdash/admin/plugins/${encodeURIComponent(PLUGIN_ID)}/builder?collection=${encodeURIComponent(collection)}`;
}

/** Collections that declare the builder's layout field. `null` until read. */
let buildable: Set<string> | null = null;
let loading: Promise<void> | null = null;
let installed = false;

function readManifest(): Promise<void> {
	if (loading) return loading;
	loading = fetch("/_emdash/api/manifest", { headers: { "X-EmDash-Request": "1" } })
		.then((response) => (response.ok ? response.json() : null))
		.then((body) => {
			const collections = (body?.data?.collections ?? body?.collections ?? {}) as Record<
				string,
				{ fields?: Record<string, unknown> }
			>;
			const set = new Set<string>();
			for (const [slug, config] of Object.entries(collections)) {
				if (config?.fields?.builder_layout) set.add(slug);
			}
			buildable = set;
		})
		.catch(() => {
			// Manifest unavailable: fall back to never redirecting.
			buildable = new Set();
		});
	return loading;
}

function collectionOf(url: string): string | null {
	const match = NEW_ENTRY.exec(url);
	return match ? decodeURIComponent(match[1]!) : null;
}

function maybeRedirect(url: string): void {
	const collection = collectionOf(url);
	if (!collection) return;
	if (buildable === null) {
		void readManifest().then(() => {
			if (buildable?.has(collection)) window.location.assign(builderNewEntryUrl(collection));
		});
		return;
	}
	if (buildable.has(collection)) window.location.assign(builderNewEntryUrl(collection));
}

/**
 * Installs the watcher once. Safe to call on every admin load: it no-ops after
 * the first call and in a non-browser context.
 */
export function installNewEntryRedirect(): void {
	if (installed || typeof window === "undefined") return;
	installed = true;

	// The SPA router navigates with pushState/replaceState. Wrap both: run the
	// original first (so a non-buildable collection navigates normally), then
	// decide. A buildable collection gets a full navigation to the builder.
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

	void readManifest();
}
