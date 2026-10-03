/**
 * The `?_builder` switch, gated on a signed-in user.
 *
 * `BuilderLayout`'s `edit` flag marks the markup for the builder's live
 * preview (`data-bd-edit`: selection hooks, empty drop areas, missing-block
 * labels). That is editor furniture, not public output: a route must not turn
 * it on just because the query string says so — any visitor could append
 * `?_builder` to a public page and inspect the draft's structure.
 *
 * The builder's own iframe is unaffected: it loads the page from the admin,
 * same origin, with the editor's session cookie already on the request.
 *
 *   const edit = builderEditMode(Astro);
 *   // edit mode is never a cached variant of the public page:
 *   if (Astro.cache?.enabled && !builderEditRequested(Astro)) Astro.cache.set(cacheHint);
 *
 *   <BuilderLayout … edit={edit} />
 */

/** The slice of the Astro object this helper reads. */
interface AstroLike {
	locals: { user?: unknown };
	url: { searchParams: { has(name: string): boolean } };
}

/** Whether the request asked for the builder's edit mode, by URL alone. */
export function builderEditRequested(astro: AstroLike): boolean {
	return astro.url.searchParams.has("_builder");
}

/**
 * Whether to render in the builder's edit mode: the `?_builder` parameter AND
 * a signed-in user. Anonymous requests always get the plain public render.
 */
export function builderEditMode(astro: AstroLike): boolean {
	return Boolean(astro.locals?.user) && builderEditRequested(astro);
}
