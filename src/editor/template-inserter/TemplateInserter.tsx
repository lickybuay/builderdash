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
import { useDragSource } from "../dnd/index";

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
	/** Opens the save-as-template flow from inside the modal. */
	onNew?: () => void;
}

export function TemplateInserter({ open, onOpenChange, onInsert, onNew }: TemplateInserterProps) {
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
								<TemplateCard
									key={template.id}
									template={template}
									onInsert={handleInsert}
								/>
							))}
						</div>
					)}
				</div>

				<div className="mt-4 pt-4 border-t border-kumo-line flex justify-between items-center">
					{onNew ? (
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								onOpenChange(false);
								onNew();
							}}
						>
							{i18n._("New template")}
						</Button>
					) : (
						<span />
					)}
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

/**
 * One template card: a schematic thumbnail of its layout, the title and the
 * category. Clicking inserts at the current selection; dragging drops it at a
 * precise slot on the canvas (same payload the container drop zones read).
 */
function TemplateCard({
	template,
	onInsert,
}: {
	template: TemplateSummary;
	onInsert: (id: string) => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const dragProps = useDragSource({ kind: "template", templateId: template.id });
	const types = template.layoutTypes ?? [];

	return (
		<button
			type="button"
			{...dragProps}
			className="group flex cursor-grab flex-col gap-2 rounded-lg border border-kumo-line p-3 text-left transition-colors hover:border-kumo-brand hover:bg-kumo-tint focus:outline-none focus:ring-2 focus:ring-kumo-brand"
			title={i18n._("Click to insert, or drag onto the canvas")}
			onClick={() => onInsert(template.id)}
		>
			<TemplateThumbnail types={types} />
			<div className="flex items-start justify-between gap-2">
				<span className="truncate text-sm font-medium">{template.title}</span>
				<span className="inline-flex items-center rounded-full bg-kumo-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-kumo-subtle">
					{template.category}
				</span>
			</div>
			{template.css_id ? (
				<span className="block font-mono text-xs text-kumo-subtle">#{template.css_id}</span>
			) : null}
		</button>
	);
}

/** The glyph each node type gets in the thumbnail, as a simple wireframe row. */
const THUMB_LABEL: Record<string, string> = {
	builder_container: "container",
	builder_heading: "heading",
	builder_text: "text",
	builder_image: "image",
	builder_button: "button",
	builder_divider: "divider",
	builder_content_ref: "block",
	builder_template_ref: "template",
};

/**
 * A schematic preview of a template: one bar per node, sized by its type.
 * It is a wireframe, not a real render — enough to tell a hero from a footer
 * at a glance without fetching or rendering every template's full layout.
 */
function TemplateThumbnail({ types }: { types: string[] }): React.JSX.Element {
	if (types.length === 0) {
		return (
			<div className="flex h-16 items-center justify-center rounded border border-dashed border-kumo-line text-xs text-kumo-subtle">
				{"—"}
			</div>
		);
	}
	const shown = types.slice(0, 5);
	return (
		<div className="flex h-16 flex-col justify-center gap-1 overflow-hidden rounded border border-kumo-line bg-kumo-bg p-2">
			{shown.map((type, index) => {
				const label = THUMB_LABEL[type] ?? type.replace(/^builder_/, "");
				const bar: Record<string, string> = {
					container: "h-2 w-full",
					heading: "h-2 w-3/4",
					text: "h-1 w-full",
					image: "h-4 w-1/2",
					button: "h-2 w-1/3",
					divider: "h-px w-full",
				};
				return (
					<div
						// eslint-disable-next-line react/no-array-index-key -- wireframe rows have no id
						key={index}
						aria-hidden="true"
						className={[
							"rounded-sm bg-kumo-line",
							bar[label] ?? "h-1.5 w-2/3",
						].join(" ")}
					/>
				);
			})}
		</div>
	);
}
