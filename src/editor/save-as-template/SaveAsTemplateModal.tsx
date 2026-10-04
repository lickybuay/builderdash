/**
 * Save-as-template modal.
 *
 * Serializes the current builder tree (or selected subtree) and saves it as
 * a new entry in the Templates collection. The user provides a title,
 * category, and optional CSS ID / classes.
 *
 * After saving, the modal closes and the newly created template appears in
 * the inserter.
 */

import * as React from "react";
import { useLingui } from "@lingui/react";
import { Button, Dialog, Input, Loader } from "@cloudflare/kumo";

import { useCreateTemplate, type TemplateInput } from "../templates/useTemplates";
import { serializeTree } from "../store/serialize";
import type { BuilderNode, BuilderTree } from "../store/tree";

const CATEGORIES = [
	"Marketing",
	"Layout",
	"CTA",
	"Testimonials",
	"Pricing",
	"FAQ",
	"General",
] as const;

export interface SaveAsTemplateModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tree: BuilderTree;
	/** The current selection, when there is one: lets the user save just it. */
	selection?: BuilderNode | null;
	onSaved: (templateId: string) => void;
}

export function SaveAsTemplateModal({
	open,
	onOpenChange,
	tree,
	selection,
	onSaved,
}: SaveAsTemplateModalProps) {
	const { i18n } = useLingui();
	const [title, setTitle] = React.useState("");
	const [category, setCategory] = React.useState("General");
	const [cssId, setCssId] = React.useState("");
	const [cssClasses, setCssClasses] = React.useState("");
	const [error, setError] = React.useState<string | null>(null);
	// Save only the selected subtree? Off by default: whole layout.
	const [selectionOnly, setSelectionOnly] = React.useState(false);

	const createMutation = useCreateTemplate();
	const isSaving = createMutation.isPending;
	const canScope = Boolean(selection);

	const handleSubmit = React.useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (!title.trim()) return;

			// A selection save wraps the subtree as a single root, so what the
			// user picked is exactly what the template contains.
			const source: BuilderTree =
				canScope && selectionOnly && selection ? [{ ...selection, parent: null }] : tree;
			const serialized = serializeTree(source);
			const input: TemplateInput = {
				title: title.trim(),
				category,
				builder_layout: serialized.blocks,
				builder_styles: serialized.styles,
				css_id: cssId.trim() || undefined,
				css_classes: cssClasses.trim() || undefined,
			};

			createMutation.mutate(input, {
				onSuccess: (result) => {
					onSaved(result.id);
					onOpenChange(false);
					setTitle("");
					setCategory("General");
					setCssId("");
					setCssClasses("");
					setSelectionOnly(false);
					setError(null);
				},
				onError: (cause) => {
					setError(cause instanceof Error ? cause.message : "Failed to save template");
				},
			});
		},
		[title, category, cssId, cssClasses, tree, selection, canScope, selectionOnly, createMutation, onSaved, onOpenChange],
	);

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog className="p-6" size="sm">
				<Dialog.Title className="text-lg font-semibold">
					{i18n._("Save as Template")}
				</Dialog.Title>
				<Dialog.Description className="text-kumo-subtle mb-4">
					{i18n._("Save the current layout as a reusable template. You can insert it into any page later.")}
				</Dialog.Description>

				<form onSubmit={handleSubmit} className="space-y-4">
					<Input
						label={i18n._("Title")}
						value={title}
						placeholder={i18n._("e.g. Hero with CTA")}
						onChange={(e) => setTitle(e.target.value)}
						required
						className="w-full"
					/>

					<div>
						<label className="block text-sm font-medium text-kumo-text mb-1">
							{i18n._("Category")}
						</label>
						<select
							value={category}
							onChange={(e) => setCategory(e.target.value)}
							className="w-full rounded-lg border border-kumo-line bg-kumo-bg px-3 py-2 text-sm text-kumo-text focus:outline-none focus:ring-2 focus:ring-kumo-brand"
						>
							{CATEGORIES.map((cat) => (
								<option key={cat} value={cat}>
									{cat}
								</option>
							))}
						</select>
					</div>

					<Input
						label={i18n._("CSS ID")}
						value={cssId}
						placeholder={i18n._("hero-section")}
						onChange={(e) => setCssId(e.target.value)}
						className="w-full"
					/>

					<Input
						label={i18n._("CSS Classes")}
						value={cssClasses}
						placeholder={i18n._("my-custom-class")}
						onChange={(e) => setCssClasses(e.target.value)}
						className="w-full"
					/>

					{canScope ? (
						<label className="flex items-center gap-2 text-sm text-kumo-text">
							<input
								type="checkbox"
								checked={selectionOnly}
								onChange={(e) => setSelectionOnly(e.target.checked)}
								className="accent-kumo-brand"
							/>
							{i18n._("Save only the selected element")}
						</label>
					) : null}

					{error && (
						<p className="text-sm text-kumo-danger">{error}</p>
					)}

					<div className="mt-6 flex justify-end gap-2">
						<Dialog.Close
							render={(p) => (
								<Button {...p} variant="secondary">
									{i18n._("Cancel")}
								</Button>
							)}
						/>
						<Button type="submit" disabled={isSaving || !title.trim()}>
							{isSaving ? (
								<>
									<Loader size="sm" />
									{i18n._("Saving…")}
								</>
							) : (
								i18n._("Save as Template")
							)}
						</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
