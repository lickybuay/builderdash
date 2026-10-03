/**
 * Whether a collection can be edited with the builder.
 *
 * The schema decides: a collection is buildable when it declares the
 * `builder_layout` field. There is no list of collections in the plugin
 * options, because the admin bundle cannot read them.
 *
 * Reads the admin manifest rather than the schema API. The schema endpoints
 * require `schema:read` (EDITOR and above), so an AUTHOR would get a 403 and
 * lose the builder silently. The manifest is what the admin itself loads for
 * every role, under the same query key, so this is served from its cache.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchManifest } from "@emdash-cms/admin";

import type { BlockTypeDef } from "./store/block-values";
import { BLOCKS_FIELD } from "./useBuilderEntry";

/**
 * Public URL of an entry, from the collection's `urlPattern` in the manifest
 * (`/{slug}`, `/blog/{slug}`…). Falls back to `/{collection}/{slug}`.
 */
export function usePublicUrl(collection: string, slug: string | null | undefined, id: string): string {
	const { data } = useQuery({ queryKey: ["manifest"], queryFn: fetchManifest });
	const pattern = data?.collections[collection]?.urlPattern || `/${collection}/{slug}`;
	return pattern
		.replace("{slug}", encodeURIComponent(slug || id))
		.replace("{id}", encodeURIComponent(id));
}

export type BuilderAvailability = "loading" | "available" | "unavailable" | "error";

export function useBuilderAvailability(collection: string): BuilderAvailability {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["manifest"],
		queryFn: fetchManifest,
	});

	if (isLoading) return "loading";
	if (isError || !data) return "error";
	return data.collections[collection]?.fields?.[BLOCKS_FIELD] ? "available" : "unavailable";
}

/** What EmDash's editor needs to know about a collection, from the manifest. */
export function useCollectionInfo(collection: string): {
	supportsDrafts: boolean;
	hasSeo: boolean;
	timezone: string | undefined;
	/** The data field holding the entry's title. */
	titleField: string;
} {
	const { data } = useQuery({ queryKey: ["manifest"], queryFn: fetchManifest });
	const info = data?.collections[collection];
	return {
		supportsDrafts: info?.supports.includes("drafts") ?? false,
		hasSeo: info?.hasSeo ?? false,
		timezone: data?.timezone,
		titleField: info?.titleField || "title",
	};
}

/** The entry's own content blocks field. */
export const CONTENT_FIELD = "content";

/**
 * Block types a new content block may use: the ones the collection's
 * `content` field allows. Retired types stay in the manifest (old blocks still
 * need their schema) but are not offered. From the manifest, so every role
 * that can open the builder can read them.
 */
export function useContentBlockTypes(collection: string): {
	/** Offered in the palette. */
	allowed: BlockTypeDef[];
	/** Every type the field knows, retired included: for the Inspector. */
	known: BlockTypeDef[];
} {
	const { data } = useQuery({ queryKey: ["manifest"], queryFn: fetchManifest });
	const field = data?.collections[collection]?.fields?.[CONTENT_FIELD] as
		| { kind?: string; blockTypes?: BlockTypeDef[]; validation?: { allowedTypes?: string[] } }
		| undefined;
	const known = field?.kind === "blocks" && Array.isArray(field.blockTypes) ? field.blockTypes : [];
	const allowedSlugs = field?.validation?.allowedTypes;
	return {
		known,
		allowed: Array.isArray(allowedSlugs) ? known.filter((type) => allowedSlugs.includes(type.slug)) : known,
	};
}
