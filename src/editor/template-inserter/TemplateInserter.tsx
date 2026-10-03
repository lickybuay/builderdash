/**
 * Template inserter modal.
 *
 * Displays a searchable, filterable list of templates from the Templates
 * collection. The user can:
 *
 * 1. Search by template title.
 * 2. Filter by category.
 * 3. Click a template to insert it into the builder canvas.
 * 4. Click "New template" to open the save-as-template flow.
 *
 * The modal is controlled by `open` / `onOpenChange` props, matching the
 * Dialog pattern used throughout the builder.
 */

import * as React from "react";
import { useLingui } from "@lingui/react";
import { Button, Dialog, Input, Loader } from "@cloudflare/kumo";

import { useTemplates, type TemplateSummary } from "../templates/useTemplates";

const CATEGORIES = [
	"Marketing",
	"Layout",
	"CTA",
	"Testimonials",
	"Pricing",
	"FAQ",
	"General",
] as const;

export interface TemplateInserterProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInsert: (templateId: string) => void | Promise<void>;
}

export function TemplateInserter({ open, onOpenChange, onInsert }: TemplateInserterProps) {
	const { i18n } = useLingui();
	const [search, setSearch] = React.useState("");
	const [category, setCategory] = React.useState<string>("all");

	const { data: templates, isLoading } = useTemplates();

	// Filter templates by search and category.
	const filtered = React.useMemo(() => {
		if (!templates) return [];
		return templates.filter((t) => {
			const matchesSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
			const matchesCategory = category === "all" || t.category === category;
			return matchesSearch && matchesCategory;
		});
	}, [templates, search, category]);

	const handleInsert = React.useCallback(
		(id: string) => {
			onInsert(id);
			onOpenChange(false);
			setSearch("");
			setCategory("all");
		},
		[onInsert, onOpenChange],
	);

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog className="w-[640px] max-h-[80vh] flex flex-col" size="lg">
				<Dialog.Title className="text-lg font-semibold">
					{i18n._("Insert Template")}
				</Dialog.Title>
				<Dialog.Description className="text-kumo-subtle mb-4">
					{i18n._("Choose a template to insert into your layout. Changes to the template will not affect existing instances.")}
				</Dialog.Description>

				{/* Search + Filter bar */}
				<div className="flex gap-2 mb-4">
					<Input
						placeholder={i18n._("Search templates…")}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="flex-1"
					/>
					<select
						value={category}
						onChange={(e) => setCategory(e.target.value)}
						className="rounded-lg border border-kumo-line bg-kumo-bg px-3 py-2 text-sm text-kumo-text focus:outline-none focus:ring-2 focus:ring-kumo-brand"
					>
						<option value="all">{i18n._("All categories")}</option>
						{CATEGORIES.map((cat) => (
							<option key={cat} value={cat}>
								{cat}
							</option>
						))}
					</select>
				</div>

				{/* Template list */}
				<div className="flex-1 overflow-y-auto min-h-0">
					{isLoading ? (
						<div className="flex items-center justify-center py-12">
							<Loader />
						</div>
					) : filtered.length === 0 ? (
						<div className="text-center py-12 text-kumo-subtle text-sm">
							{i18n._("No templates found. Create one from the current layout using the toolbar.")}
						</div>
					) : (
						<div className="grid grid-cols-2 gap-3 p-1">
							{filtered.map((template) => (
								<button
									key={template.id}
									type="button"
									className="group text-left rounded-lg border border-kumo-line p-3 hover:border-kumo-brand hover:bg-kumo-tint transition-colors focus:outline-none focus:ring-2 focus:ring-kumo-brand"
									onClick={() => handleInsert(template.id)}
								>
									<div className="flex items-start justify-between">
										<span className="font-medium text-sm truncate pr-2">
											{template.title}
										</span>
										<span className="inline-flex items-center rounded-full bg-kumo-muted px-2 py-0.5 text-xs font-medium text-kumo-subtle whitespace-nowrap">
											{template.category}
										</span>
									</div>
									{template.css_id && (
										<span className="text-xs text-kumo-subtle font-mono mt-1 block">
											#{template.css_id}
										</span>
									)}
								</button>
							))}
						</div>
					)}
				</div>

				<div className="mt-4 pt-4 border-t border-kumo-line flex justify-end">
					<Dialog.Close
						render={(p) => (
							<Button {...p} variant="secondary">
								{i18n._("Cancel")}
							</Button>
						)}
					/>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
