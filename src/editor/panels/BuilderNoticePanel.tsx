/**
 * Notice in EmDash's content editor sidebar.
 *
 * A page designed with the builder keeps its layout and styles in two fields
 * that the normal editor shows as raw data. This panel tells the editor so,
 * and links to the builder. It only informs: nothing is blocked.
 */

import * as React from "react";
import type { ContentEditorPanelContext, ContentEditorPanelExtension } from "@emdash-cms/admin";
import { useLingui } from "@lingui/react";

import { builderUrl } from "../columns/BuilderColumn";
import { useBuilderAvailability } from "../useBuilderAvailability";
import { BLOCKS_FIELD } from "../useBuilderEntry";

function BuilderNoticePanel({ collection, entry }: ContentEditorPanelContext): React.JSX.Element | null {
	const { i18n } = useLingui();
	const availability = useBuilderAvailability(collection);
	if (availability !== "available") return null;

	const layout = entry.data?.[BLOCKS_FIELD];
	const designed = Array.isArray(layout) && layout.length > 0;

	return (
		<div className="grid gap-3 p-4 text-sm">
			{designed ? (
				<p className="flex gap-2 text-kumo-default">
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="mt-0.5 shrink-0 text-kumo-warning"
						aria-hidden="true"
					>
						<path d="M12 3 2 20h20L12 3Z" />
						<path d="M12 10v4M12 17h.01" />
					</svg>
					<span>
						{i18n._(
							"This page was designed with Builderdash. Edit its layout and styles in the builder: changing the Builder layout or Builder styles fields here by hand can break the page.",
						)}
					</span>
				</p>
			) : (
				<p className="text-kumo-subtle">{i18n._("Design this page visually with Builderdash.")}</p>
			)}
			<a
				href={builderUrl(collection, entry.id)}
				className="inline-flex items-center justify-center rounded-md border border-kumo-line px-3 py-1.5 text-sm font-medium text-kumo-strong hover:bg-kumo-tint"
			>
				{i18n._("Open in builder")}
			</a>
		</div>
	);
}

export const contentEditorPanels: readonly ContentEditorPanelExtension[] = [
	{
		id: "builderdash-notice",
		title: "Builderdash",
		component: BuilderNoticePanel,
		order: -10,
	},
];
