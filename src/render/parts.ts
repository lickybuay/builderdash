/**
 * Template parts: which template fills a site slot (header, footer, sidebar).
 *
 * A template declares its slot in its `display_target` field:
 *   - `anywhere` / `page_content` — an ordinary insertable template;
 *   - `header`, `footer`, `sidebar` — a part the site renders in that slot.
 *
 * More than one template may claim the same slot. The rule is deterministic and
 * simple: the most recently updated one wins, so "assigning" a part is editing
 * the field on the template you want. Nothing else is stored.
 *
 * Pure: no I/O, no Astro. The caller passes the templates it read.
 */

/** The slots a template part can fill. */
export type TemplateSlot = "header" | "footer" | "sidebar";

/** The `display_target` values that name a slot. */
const SLOTS: readonly TemplateSlot[] = ["header", "footer", "sidebar"];

/** What the resolver needs from a template entry. */
export interface TemplatePartInput {
	/** The database ULID (what a `template_ref` stores). */
	id: string;
	displayTarget: string | null | undefined;
	/** ISO timestamp; the newest wins a contested slot. */
	updatedAt: string;
	/** The stored layout to render in the slot. */
	layout: unknown[];
	/** The stored styles for that layout. */
	styles: unknown;
}

/** A template chosen for one slot. */
export interface ResolvedPart {
	id: string;
	layout: unknown[];
	styles: unknown;
}

export type ResolvedParts = Partial<Record<TemplateSlot, ResolvedPart>>;

/** Whether a `display_target` names one of the fixed slots. */
export function isSlotTarget(value: string | null | undefined): value is TemplateSlot {
	return typeof value === "string" && (SLOTS as readonly string[]).includes(value);
}

/**
 * Picks the template for each slot.
 *
 * Ties on `updatedAt` break by `id` (descending) so the result never depends on
 * input order.
 */
export function resolveTemplateParts(inputs: readonly TemplatePartInput[]): ResolvedParts {
	const bySlot: Record<TemplateSlot, TemplatePartInput | undefined> = {
		header: undefined,
		footer: undefined,
		sidebar: undefined,
	};

	for (const input of inputs) {
		if (!isSlotTarget(input.displayTarget)) continue;
		if (!Array.isArray(input.layout) || input.layout.length === 0) continue;
		const current = bySlot[input.displayTarget];
		if (!current || isNewer(input, current)) bySlot[input.displayTarget] = input;
	}

	const out: ResolvedParts = {};
	for (const slot of SLOTS) {
		const winner = bySlot[slot];
		if (winner) out[slot] = { id: winner.id, layout: winner.layout, styles: winner.styles };
	}
	return out;
}

function isNewer(candidate: TemplatePartInput, current: TemplatePartInput): boolean {
	if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
	return candidate.id > current.id;
}

/**
 * Most template references expanded in ONE page render. Depth and cycles are
 * capped per branch; this caps the breadth: a template embedding another many
 * times, which embeds another many times… would otherwise multiply the work of
 * every public request.
 */
export const MAX_TEMPLATE_EXPANSIONS = 50;

/** A fresh, shared budget for one render (mutated as references expand). */
export function newExpansionBudget(): { left: number } {
	return { left: MAX_TEMPLATE_EXPANSIONS };
}
