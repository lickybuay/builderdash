/**
 * Entry loading and saving for the builder page.
 *
 * Reads the two data layers from the admin API and writes them back on save.
 * The `blocks` field is the content layer; `stylesField` is the sibling `json`
 * field that holds layer 2.
 */

import * as React from "react";
import {
	API_BASE,
	apiFetch,
	fetchContent,
	parseApiResponse,
	publishContent,
	unscheduleContent,
	updateContent,
	type BylineCreditInput,
	type ContentItem,
	type ContentSeoInput,
} from "@emdash-cms/admin";

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
	/** The entry's own content blocks, placed by the builder through refs. */
	content?: Array<Record<string, unknown> & { _key: string; _type: string }>;
}

export type BuilderEntry = Omit<ContentItem, "data"> & { data?: BuilderEntryData };

/** Entry fields EmDash applies straight to the row, outside the draft. */
export interface EntryMetaChanges {
	authorId?: string | null;
	bylines?: BylineCreditInput[];
	seo?: ContentSeoInput;
}

export interface BuilderEntryState {
	entry: BuilderEntry | null;
	blocks: StoredBlock[] | null;
	styles: StoredStyles | null;
	isLoading: boolean;
	/** The entry could not be loaded: the page shows an empty state. */
	loadError: string | null;
	/** An action failed: shown inside the builder, which stays mounted. */
	actionError: string | null;
	clearActionError: () => void;
	saving: boolean;
	/** Bumped when the stored draft was replaced (discard), to rebuild the editor. */
	generation: number;
	save: (payload: SavePayload) => Promise<BuilderEntry>;
	publish: (rev?: string) => Promise<void>;
	discard: () => Promise<void>;
	schedule: (scheduledAt: string) => Promise<void>;
	unschedule: () => Promise<void>;
	updateMeta: (changes: EntryMetaChanges) => Promise<void>;
}

export interface SavePayload {
	blocks: unknown[];
	styles: Record<string, unknown>;
	/** The full `content` array, only when its blocks were edited. */
	content?: unknown[];
	/** A new slug, only when it changed. */
	slug?: string;
	/** Extra data fields to write, such as a changed title. */
	data?: Record<string, unknown>;
}

/**
 * Loads an entry and exposes its actions.
 *
 * `entryId` may be absent when the plugin page is opened without an entry in
 * the URL; in that case the hook stays idle and the page shows its empty state.
 *
 * Every write runs through one queue and carries the `_rev` of the last
 * response, so a publish right after a save, or a SEO change while saving,
 * never races on a stale revision.
 */
export function useBuilderEntry(
	collection: string,
	entryId: string | undefined,
): BuilderEntryState {
	const [entry, setEntryState] = React.useState<BuilderEntry | null>(null);
	const [isLoading, setLoading] = React.useState(Boolean(entryId));
	const [saving, setSaving] = React.useState(false);
	const [loadError, setLoadError] = React.useState<string | null>(null);
	const [actionError, setActionError] = React.useState<string | null>(null);
	const [generation, setGeneration] = React.useState(0);

	const entryRef = React.useRef<BuilderEntry | null>(null);
	const setEntry = React.useCallback((next: BuilderEntry) => {
		entryRef.current = next;
		setEntryState(next);
	}, []);

	React.useEffect(() => {
		if (!entryId) {
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setLoadError(null);

		void (async () => {
			try {
				const item = (await fetchContent(collection, entryId)) as unknown as BuilderEntry;
				if (cancelled) return;
				setEntry(item);
			} catch (cause) {
				if (cancelled) return;
				setLoadError(messageOf(cause));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [collection, entryId, setEntry]);

	const queue = React.useRef<Promise<unknown>>(Promise.resolve());
	const run = React.useCallback(<T,>(action: () => Promise<T>): Promise<T> => {
		const next = queue.current.then(action, action);
		queue.current = next.catch(() => undefined);
		return next.catch((cause: unknown) => {
			setActionError(messageOf(cause));
			throw cause;
		});
	}, []);

	const rev = () => {
		const current = entryRef.current?._rev;
		return current ? { _rev: current } : {};
	};

	const save = React.useCallback(
		(payload: SavePayload) => {
			if (!entryId) return Promise.reject(new Error("No entry"));
			setSaving(true);
			setActionError(null);
			return run(async () => {
				const updated = (await updateContent(collection, entryId, {
					data: {
						...payload.data,
						[BLOCKS_FIELD]: payload.blocks,
						[STYLES_FIELD]: payload.styles,
						...(payload.content ? { content: payload.content } : {}),
					},
					...(payload.slug !== undefined ? { slug: payload.slug } : {}),
					// Optimistic concurrency: a builder open in two tabs must
					// not silently overwrite a newer draft.
					...rev(),
				})) as unknown as BuilderEntry;
				setEntry(updated);
				return updated;
			}).finally(() => setSaving(false));
		},
		[collection, entryId, run, setEntry],
	);

	const publish = React.useCallback(
		(revision?: string) => {
			if (!entryId) return Promise.resolve();
			setActionError(null);
			return run(async () => {
				const token = revision ?? entryRef.current?._rev;
				const updated = (await publishContent(collection, entryId, {
					...(token ? { _rev: token } : {}),
				})) as unknown as BuilderEntry;
				setEntry(updated);
			});
		},
		[collection, entryId, run, setEntry],
	);

	const discard = React.useCallback(() => {
		if (!entryId) return Promise.resolve();
		setActionError(null);
		return run(async () => {
			// With `_rev`: never discard a newer draft saved from another tab.
			await postWithRev(collection, entryId, "discard-draft", {}, entryRef.current?._rev);
			// The response may omit the restored data; read it back whole.
			const fresh = (await fetchContent(collection, entryId)) as unknown as BuilderEntry;
			setEntry(fresh);
			setGeneration((value) => value + 1);
		});
	}, [collection, entryId, run, setEntry]);

	const schedule = React.useCallback(
		(scheduledAt: string) => {
			if (!entryId) return Promise.resolve();
			setActionError(null);
			return run(async () => {
				setEntry(
					await postWithRev(collection, entryId, "schedule", { scheduledAt }, entryRef.current?._rev),
				);
			});
		},
		[collection, entryId, run, setEntry],
	);

	const unschedule = React.useCallback(() => {
		if (!entryId) return Promise.resolve();
		setActionError(null);
		return run(async () => {
			setEntry((await unscheduleContent(collection, entryId)) as unknown as BuilderEntry);
		});
	}, [collection, entryId, run, setEntry]);

	// Author, bylines and SEO: applied at once, as EmDash's own editor does.
	const updateMeta = React.useCallback(
		(changes: EntryMetaChanges) => {
			if (!entryId) return Promise.resolve();
			setActionError(null);
			return run(async () => {
				const updated = (await updateContent(collection, entryId, {
					...changes,
					...rev(),
				})) as unknown as BuilderEntry;
				setEntry(updated);
			});
		},
		[collection, entryId, run, setEntry],
	);

	return {
		entry,
		blocks: entry?.data?.[BLOCKS_FIELD] ?? null,
		styles: entry?.data?.[STYLES_FIELD] ?? null,
		isLoading,
		loadError,
		actionError,
		clearActionError: React.useCallback(() => setActionError(null), []),
		saving,
		generation,
		save,
		publish,
		discard,
		schedule,
		unschedule,
		updateMeta,
	};
}

/**
 * POST to an entry action with the optimistic-concurrency token.
 *
 * The admin client's `discardDraft` and `scheduleContent` take no `_rev`,
 * although the server checks it, so these two calls are made here.
 */
async function postWithRev(
	collection: string,
	entryId: string,
	action: "discard-draft" | "schedule",
	body: Record<string, unknown>,
	rev: string | undefined,
): Promise<BuilderEntry> {
	const response = await apiFetch(
		`${API_BASE}/content/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}/${action}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...body, ...(rev ? { _rev: rev } : {}) }),
		},
	);
	const data = await parseApiResponse<{ item: BuilderEntry; _rev?: string }>(
		response,
		action === "schedule" ? "Failed to schedule content" : "Failed to discard draft",
	);
	return { ...data.item, ...(data._rev ? { _rev: data._rev } : {}) };
}

function messageOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}
