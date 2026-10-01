/**
 * "Edit with BuilderDash" column for content lists.
 *
 * EmDash has no extension point for the row actions column, so the entry point
 * lives in its own column: a supported `contentListColumns` contribution that
 * renders one button per row. It links to the plugin's builder page with the
 * entry reference in the query string, which is what `BuilderPage` reads.
 *
 * See `.agents/docs/builderdash/04-guia-visual.md` for the visual rules.
 */

import * as React from "react";
import type {
	ContentListColumnExtension,
	ContentListColumnCellContext,
} from "@emdash-cms/admin";
import { useLingui } from "@lingui/react";

import { PLUGIN_ID } from "../../plugin-id";

/**
 * Builds the URL of the builder page for one entry.
 *
 * The builder page is not a typed TanStack route, so the entry reference
 * travels in the query string.
 */
export function builderUrl(collection: string, entryId: string): string {
	const params = new URLSearchParams({ collection, id: entryId });
	return `/_emdash/admin/plugins/${encodeURIComponent(PLUGIN_ID)}/builder?${params.toString()}`;
}

function BuilderCell({ item, collection }: ContentListColumnCellContext): React.JSX.Element {
	const { i18n } = useLingui();

	// A trashed entry has no builder page: it is not editable from here.
	if (item.status === "trashed") return <span className="text-xs text-kumo-subtle">—</span>;

	return (
		<a
			href={builderUrl(collection, item.id)}
			title={i18n._("Edit with BuilderDash")}
			className="inline-flex items-center gap-1.5 rounded-md border border-kumo-line bg-kumo-control px-2 py-1 text-xs font-medium text-kumo-default transition-colors hover:border-kumo-fill-hover hover:bg-kumo-tint"
		>
			<span aria-hidden="true">&#9638;</span>
			{i18n._("Edit with BuilderDash")}
		</a>
	);
}

export const contentListColumns: readonly ContentListColumnExtension[] = [
	{
		id: "builderdash",
		label: "Builder",
		cell: BuilderCell,
		/**
		 * Only pages are composable with the builder. Narrow this if another
		 * collection ever gets a `builder_layout` field the builder understands.
		 */
		collections: ["pages"],
		// Sort after the host columns so it reads as an action, not as data.
		order: 100,
		align: "start",
	},
];
