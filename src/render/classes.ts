/**
 * CSS hooks for an entry, so site CSS can target one page or post.
 *
 * On <body> (the site's layout owns it, so the site calls `bodyClasses`):
 *
 *   page-<id> / post-<id>               this entry, like WordPress `page-id-…`
 *
 * The layout container (`BuilderLayout.astro`) carries `class="builderdash"`
 * and the entry as `data-bd-id`, `data-bd-slug` and `data-bd-collection`.
 *
 * Ids are kept as-is (EmDash ids are alphanumeric), so `.page-01M3…` matches
 * the id shown in the admin exactly.
 */

export interface EntryRef {
	collection: string;
	id: string;
	slug?: string | null;
}

/** Class-safe token: letters, digits and dashes. */
function token(value: string, lower = true): string {
	const cased = lower ? value.toLowerCase() : value;
	return cased.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

/** "pages" → "page", "posts" → "post". */
function singular(collection: string): string {
	return token(collection).replace(/s$/, "");
}

/**
 * Classes for the entry. A route whose entry does not exist (a missing page,
 * an empty database) passes no id: it gets no classes instead of a crash.
 */
export function bodyClasses(entry: Partial<EntryRef> | null | undefined): string[] {
	if (!entry || typeof entry.id !== "string" || !entry.id || typeof entry.collection !== "string") return [];
	return [`${singular(entry.collection)}-${token(entry.id, false)}`];
}
