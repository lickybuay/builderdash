/**
 * Entry loading and saving for the builder page.
 *
 * Reads the two data layers from the admin API and writes them back on save.
 * The `blocks` field is the content layer; `stylesField` is the sibling `json`
 * field that holds layer 2.
 */

import * as React from "react";
import { apiFetch, fetchContent, parseApiResponse, updateContent } from "@emdash-cms/admin";

import type { StoredBlock, StoredStyles } from "./store/serialize";

/**
 * Field slugs on the entry.
 *
 * The builder owns its own field pair, deliberately separate from `content`:
 *
 * - `content` is the marketing template's `blocks` field, restricted to the
 *   `marketing_*` block types. Writing builder blocks there is rejected by the
 *   schema (`UNSUPPORTED_FIELD_TYPE`), and would break the template's renderer.
 * - `builder_layout` is the builder's `blocks` field, restricted to
 *   `builder_container`. Its block types are declared in `seed/seed.json`,
 *   because a plugin cannot create block types at runtime.
 * - `builder_styles` is the sibling `json` field holding layer 2.
 */
export const BLOCKS_FIELD = "builder_layout";
export const STYLES_FIELD = "builder_styles";

interface BuilderEntryData {
	[BLOCKS_FIELD]?: StoredBlock[];
	[STYLES_FIELD]?: StoredStyles;
	title?: string;
}

interface BuilderEntry {
	id: string;
	slug: string | null;
	data?: BuilderEntryData;
	_rev?: string;
}

export interface BuilderEntryState {
	entry: BuilderEntry | null;
	blocks: StoredBlock[] | null;
	styles: StoredStyles | null;
	isLoading: boolean;
	error: string | null;
	saving: boolean;
	save: (payload: {
		blocks: unknown[];
		styles: Record<string, unknown>;
	}) => Promise<void>;
}

/**
 * Loads an entry and exposes a save action.
 *
 * `entryId` may be absent when the plugin page is opened without an entry in
 * the URL; in that case the hook stays idle and the page shows its empty state.
 */
export function useBuilderEntry(
	collection: string,
	entryId: string | undefined,
): BuilderEntryState {
	const [entry, setEntry] = React.useState<BuilderEntry | null>(null);
	const [isLoading, setLoading] = React.useState(Boolean(entryId));
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!entryId) {
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		void (async () => {
			try {
				const item = (await fetchContent(collection, entryId)) as unknown as BuilderEntry;
				if (cancelled) return;
				setEntry(item);
			} catch (cause) {
				if (cancelled) return;
				setError(cause instanceof Error ? cause.message : String(cause));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [collection, entryId]);

	const save = React.useCallback(
		async (payload: { blocks: unknown[]; styles: Record<string, unknown> }) => {
			if (!entryId) return;
			setSaving(true);
			setError(null);
			try {
				const updated = (await updateContent(
					collection,
					entryId,
					{
						data: {
							[BLOCKS_FIELD]: payload.blocks,
							[STYLES_FIELD]: payload.styles,
						},
						// Optimistic concurrency: a builder open in two tabs must
						// not silently overwrite a newer draft.
						...(entry?._rev ? { _rev: entry._rev } : {}),
					},
				)) as unknown as BuilderEntry;

				setEntry(updated);
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : String(cause));
				throw cause;
			} finally {
				setSaving(false);
			}
		},
		[collection, entryId, entry?._rev],
	);

	// A stale revision (HTTP 409) is the only error worth retrying blindly: the
	// next save re-reads `_rev` from the response of a fresh fetch.
	const reload = React.useCallback(async () => {
		if (!entryId) return;
		const response = await apiFetch(`/_emdash/api/content/${collection}/${entryId}`);
		const item = await parseApiResponse<{ item: BuilderEntry }>(
			response,
			"Could not reload the entry",
		);
		setEntry(item.item);
	}, [collection, entryId]);

	void reload;

	return {
		entry,
		blocks: entry?.data?.[BLOCKS_FIELD] ?? null,
		styles: entry?.data?.[STYLES_FIELD] ?? null,
		isLoading,
		error,
		saving,
		save,
	};
}
