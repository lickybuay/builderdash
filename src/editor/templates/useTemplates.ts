/**
 * Hook for fetching and managing templates from the Templates collection.
 *
 * Uses the EmDash admin API:
 * - GET /_emdash/api/content/templates — list all templates
 * - GET /_emdash/api/content/templates/{id} — get a single template
 * - POST /_emdash/api/content/templates — create a template
 * - PUT /_emdash/api/content/templates/{id} — update a template
 * - DELETE /_emdash/api/content/templates/{id} — delete a template
 *
 * All API calls use `apiFetch` from @emdash-cms/admin for CSRF protection.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, parseApiResponse, type ContentItem } from "@emdash-cms/admin";

const COLLECTION = "templates";

/** A template entry from the Templates collection. */
export interface TemplateEntry extends Omit<ContentItem, "data"> {
	data: {
		title: string;
		category: string;
		content?: Record<string, unknown>[];
		css_id?: string;
		css_classes?: string;
		display_target?: string;
	};
}

/** Input for creating or updating a template. */
export interface TemplateInput {
	title: string;
	category: string;
	/** Builder layout blocks (flat array with parent_key). */
	builder_layout?: Record<string, unknown>[];
	/** Builder styles keyed by _key. */
	builder_styles?: Record<string, unknown>;
	/** Legacy content blocks (kept for backward compatibility). */
	content?: Record<string, unknown>[];
	css_id?: string;
	css_classes?: string;
}

/** Template data as returned by the list endpoint (lightweight). */
export interface TemplateSummary {
	id: string;
	title: string;
	category: string;
	css_id?: string;
	css_classes?: string;
	display_target?: string;
	/**
	 * Node types of the template's layout, in render order. Drives the
	 * inserter's thumbnail without shipping the whole layout to the list.
	 */
	layoutTypes?: string[];
}

/** Full template with content blocks. */
export interface TemplateWithContent extends TemplateSummary {
	content: Record<string, unknown>[];
	/** The builder layout blocks (flat array with parent_key), when saved by the builder. */
	builder_layout?: Record<string, unknown>[];
	/** The builder styles keyed by node key. */
	builder_styles?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchTemplates(): Promise<TemplateSummary[]> {
	const response = await apiFetch(`/_emdash/api/content/${COLLECTION}`);
	const data = await parseApiResponse<{ items: Record<string, unknown>[] }>(
		response,
		"Failed to load templates",
	);
	return (data.items ?? []).map((item) => {
		const fields = (item.data ?? {}) as Record<string, unknown>;
		const layout = Array.isArray(fields.builder_layout) ? fields.builder_layout : [];
		const layoutTypes = layout
			.map((block) => (typeof (block as Record<string, unknown>)._type === "string"
				? ((block as Record<string, unknown>)._type as string)
				: ""))
			.filter(Boolean);
		return {
			id: item.id as string,
			title: (fields.title as string) ?? "",
			category: (fields.category as string) ?? "General",
			css_id: fields.css_id as string | undefined,
			css_classes: fields.css_classes as string | undefined,
			display_target: fields.display_target as string | undefined,
			layoutTypes,
		};
	});
}

export async function fetchTemplate(id: string): Promise<TemplateWithContent> {
	const response = await apiFetch(`/_emdash/api/content/${COLLECTION}/${id}`);
	const data = await parseApiResponse<{ item: Record<string, unknown> }>(response, "Failed to load template");
	const item = data.item;
	const fields = (item.data ?? {}) as Record<string, unknown>;
	return {
		id: item.id as string,
		title: (fields.title as string) ?? "",
		category: (fields.category as string) ?? "General",
		css_id: fields.css_id as string | undefined,
		css_classes: fields.css_classes as string | undefined,
		display_target: fields.display_target as string | undefined,
		content: (fields.content as Record<string, unknown>[]) ?? [],
		builder_layout: (fields.builder_layout as Record<string, unknown>[]) ?? [],
		builder_styles: (fields.builder_styles as Record<string, unknown>) ?? {},
	};
}

async function createTemplate(input: TemplateInput): Promise<TemplateSummary> {
	const response = await apiFetch(`/_emdash/api/content/${COLLECTION}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ data: input }),
	});
	const data = await parseApiResponse<{ item: TemplateSummary }>(response, "Failed to create template");
	return data.item;
}

async function updateTemplate(id: string, input: Partial<TemplateInput>): Promise<TemplateSummary> {
	const response = await apiFetch(`/_emdash/api/content/${COLLECTION}/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			data: {
				...input,
				// Only include builder fields if they have values
				...(input.builder_layout !== undefined ? { builder_layout: input.builder_layout } : {}),
				...(input.builder_styles !== undefined ? { builder_styles: input.builder_styles } : {}),
			},
		}),
	});
	const data = await parseApiResponse<{ item: TemplateSummary }>(response, "Failed to update template");
	return data.item;
}

async function deleteTemplate(id: string): Promise<void> {
	const response = await apiFetch(`/_emdash/api/content/${COLLECTION}/${id}`, { method: "DELETE" });
	if (!response.ok) {
		const data = await parseApiResponse<{ error: { message: string } }>(response, "Failed to delete template");
		throw new Error(data.error?.message ?? "Failed to delete template");
	}
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch all templates for the list view. */
export function useTemplates() {
	return useQuery({
		queryKey: [COLLECTION, "list"],
		queryFn: fetchTemplates,
	});
}

/** Fetch a single template by ID (for insertion into the builder). */
export function useTemplate(id: string | undefined) {
	return useQuery({
		queryKey: [COLLECTION, "detail", id],
		queryFn: () => fetchTemplate(id!),
		enabled: !!id,
	});
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new template. */
export function useCreateTemplate() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createTemplate,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [COLLECTION, "list"] });
		},
	});
}

/** Delete a template. */
export function useDeleteTemplate() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteTemplate,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [COLLECTION, "list"] });
		},
	});
}
