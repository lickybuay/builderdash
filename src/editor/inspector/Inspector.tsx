/**
 * Inspector: the fields of the selected node, in the left panel.
 *
 * Opens in place of the block palette when a node is selected, like
 * Elementor's panel. Edits are held in the builder store and shown live in the
 * preview; nothing is written until Save.
 *
 * - A content block shows the fields of its block type, at the block's own
 *   `_version`. The schema comes from EmDash's block types API, which needs
 *   `schema:read` (EDITOR). Without it the fields are inferred from the block's
 *   stored values, so an AUTHOR still gets a usable form.
 * - A container shows its registry fields (gap, direction).
 * - Field controls mirror EmDash's block editor: text, markdown textarea,
 *   switch, select and the media library picker for images, with duplicate
 *   and delete in the header.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBlockTypes, MediaPickerModal, type MediaItem } from "@emdash-cms/admin";
import { useLingui } from "@lingui/react";

import { requireWidget } from "../../schema/registry";
import { optionsOf, type BlockFieldDef, type BlockTypeDef } from "../store/block-values";
import type { AdvancedValues, Breakpoint, BuilderNode, StyleValues } from "../store/tree";
import { ExtraTab, StylingTab } from "./StyleControls";

/** A content block as stored in the entry's `content` field. */
export type StoredContentBlock = Record<string, unknown> & {
	_key: string;
	_type: string;
	_version?: number;
};

interface FieldSpec {
	slug: string;
	label: string;
	type: string;
	options?: string[];
	required?: boolean;
	/** Repeater: the fields of each item, and how many items it takes. */
	subFields?: FieldSpec[];
	minItems?: number;
	maxItems?: number;
}

function specOf(field: BlockFieldDef): FieldSpec {
	const options = field.type === "select" ? optionsOf(field) : undefined;
	return {
		slug: field.slug,
		label: field.label || humanize(field.slug),
		type: field.type,
		required: field.required === true,
		options: Array.isArray(options)
			? options.map((option) =>
					typeof option === "object" && option !== null && "value" in option
						? String((option as { value: unknown }).value)
						: String(option),
				)
			: undefined,
		subFields: field.validation?.subFields?.map(specOf),
		minItems: field.validation?.minItems,
		maxItems: field.validation?.maxItems,
	};
}

interface InspectorProps {
	node: BuilderNode;
	/** The block a content ref points at, with pending edits applied. */
	block: StoredContentBlock | null;
	/** The site's block types (from the manifest): the content block's schema. */
	blockTypes?: BlockTypeDef[];
	title: string;
	editUrl: string;
	onEditContent: (blockKey: string, field: string, value: unknown) => void;
	onUpdateProps: (patch: Record<string, unknown>) => void;
	onDuplicate: () => void;
	onRemove: () => void;
	/** Device selected in the top bar: which styles the Styling tab edits. */
	breakpoint: Breakpoint;
	/** The site's design tokens (custom properties), offered as presets. */
	tokens: string[];
	onUpdateStyle: (target: Breakpoint | "advanced", patch: Record<string, unknown>) => void;
	onBack: () => void;
}

const humanize = (slug: string) =>
	slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, " ");

/**
 * Fields of a block type at a given version: from the manifest (every role
 * can read it), else the schema API, else inferred from the data.
 */
function useBlockFields(block: StoredContentBlock | null, known: BlockTypeDef[] = []): FieldSpec[] {
	const fromManifest = block ? known.find((candidate) => candidate.slug === block._type) : undefined;
	const { data, isError } = useQuery({
		queryKey: ["builderdash", "block-types"],
		queryFn: fetchBlockTypes,
		staleTime: 5 * 60 * 1000,
		retry: false,
		enabled: Boolean(block) && !fromManifest,
	});

	return React.useMemo(() => {
		if (!block) return [];
		if (fromManifest) {
			const version =
				fromManifest.versions.find((candidate) => candidate.version === (block._version ?? fromManifest.currentVersion)) ??
				fromManifest.versions.find((candidate) => candidate.version === fromManifest.currentVersion);
			if (version) return version.fields.map(specOf);
		}
		const type = data?.find((candidate) => candidate.slug === block._type);
		const version =
			type?.versions.find((candidate) => candidate.version === (block._version ?? type.currentVersion)) ??
			type?.versions.find((candidate) => candidate.version === type.currentVersion);
		if (version && !isError) {
			return version.fields.map((field) => specOf(field as unknown as BlockFieldDef));
		}
		// No schema access: infer from the stored values.
		return Object.entries(block)
			.filter(([slug]) => !slug.startsWith("_"))
			.map(([slug, value]) => ({
				slug,
				label: humanize(slug),
				type:
					typeof value === "boolean"
						? "boolean"
						: typeof value === "string"
							? value.length > 80 || value.includes("\n")
								? "text"
								: "string"
							: typeof value === "object" && value !== null
								? "image"
								: "string",
			}));
	}, [block, data, isError, fromManifest]);
}

/**
 * A picked media item as an image field value: the same shape EmDash's own
 * image field stores (see `mediaItemToImageFieldValue` in the admin).
 */
function imageValueFrom(item: MediaItem): Record<string, unknown> {
	const provider = item.provider && item.provider !== "local" ? item.provider : "local";
	const record = item as unknown as Record<string, unknown>;
	const meta = (record.meta as Record<string, unknown> | undefined) ?? {};
	return {
		id: item.id,
		provider,
		src: provider === "external" ? item.url : undefined,
		previewUrl: provider !== "local" && provider !== "external" ? item.url : undefined,
		alt: (record.alt as string | undefined) || "",
		width: item.width,
		height: item.height,
		focalX: item.focalX ?? undefined,
		focalY: item.focalY ?? undefined,
		filename: item.filename,
		mimeType: item.mimeType,
		blurhash: item.blurhash,
		dominantColor: item.dominantColor,
		meta: provider === "local" ? { ...meta, storageKey: item.storageKey } : meta,
	};
}

/** URL to preview a stored image field value in the admin. */
function imagePreviewUrl(value: unknown): string | null {
	if (!value || typeof value !== "object") return null;
	const image = value as Record<string, unknown>;
	if (typeof image.src === "string") return image.src;
	if (typeof image.previewUrl === "string") return image.previewUrl;
	const meta = image.meta as Record<string, unknown> | undefined;
	const key = typeof meta?.storageKey === "string" ? meta.storageKey : image.id;
	return typeof key === "string" ? `/_emdash/api/media/file/${key}` : null;
}

function ImageControl({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: unknown;
	onChange: (value: unknown) => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const [picking, setPicking] = React.useState(false);
	const preview = imagePreviewUrl(value);
	return (
		<div className="flex flex-col gap-1">
			<span id={id} className="text-xs font-medium text-kumo-subtle">
				{label}
			</span>
			{preview ? (
				<div className="flex flex-col gap-2">
					<img src={preview} alt="" className="w-full rounded border border-kumo-line object-cover" style={{ maxHeight: 128 }} />
					<div className="flex gap-2">
						<button type="button" className={buttonClass} onClick={() => setPicking(true)}>
							{i18n._("Replace")}
						</button>
						<button type="button" className={buttonClass} onClick={() => onChange(null)}>
							{i18n._("Remove")}
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					aria-describedby={id}
					onClick={() => setPicking(true)}
					className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded border border-kumo-line bg-kumo-control text-xs text-kumo-subtle hover:bg-kumo-tint"
				>
					<span aria-hidden="true">&#128444;</span>
					{i18n._("Select image")}
				</button>
			)}
			<MediaPickerModal
				open={picking}
				onOpenChange={setPicking}
				mediaKind="image"
				onSelect={(item) => {
					onChange(imageValueFrom(item));
					setPicking(false);
				}}
			/>
		</div>
	);
}

const buttonClass =
	"rounded border border-kumo-line bg-kumo-control px-2 py-1 text-xs text-kumo-default hover:bg-kumo-tint";

const inputClass =
	"w-full rounded border border-kumo-line bg-kumo-control px-2 py-1.5 text-xs text-kumo-default";

function ColorControl({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: unknown;
	onChange: (value: unknown) => void;
}): React.JSX.Element {
	const hex = typeof value === "string" && value ? value : "#000000";
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-xs font-medium text-kumo-subtle">
				{label}
			</label>
			<div className="flex items-center gap-2">
				<input
					id={id}
					type="color"
					value={hex}
					onChange={(event) => onChange(event.target.value)}
					className="size-8 cursor-pointer rounded border border-kumo-line bg-transparent p-0.5"
				/>
				<input
					type="text"
					className={inputClass}
					value={hex}
					onChange={(event) => onChange(event.target.value)}
					onFocus={(event) => event.target.select()}
					placeholder="#000000"
				/>
			</div>
		</div>
	);
}

function FieldControl({
	field,
	value,
	onChange,
	editUrl,
}: {
	field: FieldSpec;
	value: unknown;
	onChange: (value: unknown) => void;
	editUrl: string;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const id = `bd-field-${field.slug}`;

	if (field.type === "boolean") {
		const on = value === true;
		return (
			<label htmlFor={id} className="flex items-center gap-2 text-xs text-kumo-default">
				<button
					id={id}
					type="button"
					role="switch"
					aria-checked={on}
					onClick={() => onChange(!on)}
					className={[
						"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-kumo-line transition-colors",
						on ? "bg-kumo-brand" : "bg-kumo-control",
					].join(" ")}
				>
					<span
						aria-hidden="true"
						className="inline-block size-4 rounded-full bg-kumo-base shadow transition-transform"
						style={{ transform: on ? "translateX(16px)" : "translateX(1px)" }}
					/>
				</button>
				{field.label}
			</label>
		);
	}

	if (field.type === "image") {
		return <ImageControl id={id} label={field.label} value={value} onChange={onChange} />;
	}

	if (field.type === "color") {
		return <ColorControl id={id} label={field.label} value={value} onChange={onChange} />;
	}

	if (field.type === "repeater") {
		return <RepeaterControl field={field} value={value} onChange={onChange} editUrl={editUrl} />;
	}

	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-xs font-medium text-kumo-subtle">
				{field.label}
				{field.required ? <span aria-hidden="true"> *</span> : null}
			</label>
			{field.type === "text" ? (
				<textarea
					id={id}
					rows={5}
					placeholder={i18n._("Enter markdown content…")}
					className={inputClass}
					value={typeof value === "string" ? value : ""}
					onChange={(event) => onChange(event.target.value)}
					onFocus={(event) => {
						event.target.select();
					}}
				/>
			) : field.type === "select" && field.options ? (
				<select
					id={id}
					className={inputClass}
					value={typeof value === "string" ? value : ""}
					onChange={(event) => onChange(event.target.value)}
				>
					{field.options.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			) : (
				<input
					id={id}
					type="text"
					className={inputClass}
					value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
					onChange={(event) => onChange(event.target.value)}
					onFocus={(event) => event.target.select()}
				/>
			)}
		</div>
	);
}

/**
 * A list field (FAQ questions, pricing plans…): items with their own fields,
 * added, removed and reordered within the field's limits.
 */
function RepeaterControl({
	field,
	value,
	onChange,
	editUrl,
}: {
	field: FieldSpec;
	value: unknown;
	onChange: (value: unknown) => void;
	editUrl: string;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const items = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
	const sub = field.subFields ?? [];
	const min = field.minItems ?? (field.required ? 1 : 0);
	const max = field.maxItems ?? Number.POSITIVE_INFINITY;
	const [open, setOpen] = React.useState<number | null>(items.length === 1 ? 0 : null);

	const update = (next: Array<Record<string, unknown>>) => onChange(next);
	const blank = () => {
		const item: Record<string, unknown> = {};
		for (const subField of sub) {
			if (subField.type === "boolean") item[subField.slug] = false;
			else if (subField.type === "select" && subField.options?.[0]) item[subField.slug] = subField.options[0];
			else if (subField.required && (subField.type === "string" || subField.type === "text"))
				item[subField.slug] = subField.label;
		}
		return item;
	};
	const titleOf = (item: Record<string, unknown>, at: number) => {
		const first = sub.find((subField) => typeof item[subField.slug] === "string" && item[subField.slug]);
		return first ? String(item[first.slug]) : i18n._("Item {n}", { n: at + 1 });
	};
	const move = (from: number, to: number) => {
		const next = [...items];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item!);
		update(next);
		setOpen(to);
	};

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium text-kumo-subtle">
				{field.label}
				{field.required ? <span aria-hidden="true"> *</span> : null}
			</span>
			<ol className="flex flex-col gap-1">
				{items.map((item, at) => (
					<li key={at} className="rounded border border-kumo-line">
						<div className="flex items-center gap-1 px-2 py-1">
							<button
								type="button"
								onClick={() => setOpen(open === at ? null : at)}
								aria-expanded={open === at}
								className="min-w-0 flex-1 truncate text-start text-xs text-kumo-default"
							>
								{titleOf(item, at)}
							</button>
							<button type="button" className={iconButtonClass} aria-label={i18n._("Move up")} disabled={at === 0} onClick={() => move(at, at - 1)}>
								&uarr;
							</button>
							<button
								type="button"
								className={iconButtonClass}
								aria-label={i18n._("Move down")}
								disabled={at === items.length - 1}
								onClick={() => move(at, at + 1)}
							>
								&darr;
							</button>
							<button
								type="button"
								className={iconButtonClass}
								aria-label={i18n._("Remove item")}
								title={items.length <= min ? i18n._("This list needs at least {min} items", { min }) : undefined}
								disabled={items.length <= min}
								onClick={() => {
									update(items.filter((_, index) => index !== at));
									setOpen(null);
								}}
							>
								&times;
							</button>
						</div>
						{open === at ? (
							<div className="flex flex-col gap-3 border-t border-kumo-line p-2">
								{sub.map((subField) => (
									<FieldControl
										key={subField.slug}
										field={{ ...subField, slug: `${field.slug}-${at}-${subField.slug}` }}
										value={item[subField.slug]}
										onChange={(next) =>
											update(items.map((current, index) => (index === at ? { ...current, [subField.slug]: next } : current)))
										}
										editUrl={editUrl}
									/>
								))}
							</div>
						) : null}
					</li>
				))}
			</ol>
			<button
				type="button"
				className={buttonClass}
				disabled={items.length >= max}
				onClick={() => {
					update([...items, blank()]);
					setOpen(items.length);
				}}
			>
				{i18n._("+ Add item")}
			</button>
		</div>
	);
}

const iconButtonClass = "rounded px-1 text-xs text-kumo-subtle hover:bg-kumo-tint";

export function Inspector({
	node,
	block,
	blockTypes,
	title,
	editUrl,
	onEditContent,
	onUpdateProps,
	onDuplicate,
	onRemove,
	onBack,
	breakpoint,
	tokens,
	onUpdateStyle,
}: InspectorProps): React.JSX.Element {
	const [tab, setTab] = React.useState<"general" | "styling" | "extra">("general");
	const { i18n } = useLingui();
	const blockFields = useBlockFields(node.type === "content_ref" ? block : null, blockTypes);

	const fields: FieldSpec[] =
		node.type === "content_ref"
			? blockFields
			: requireWidget(node.type).fields.map((field) => ({
					slug: field.slug,
					label: field.label,
					type: field.type,
					options: field.options,
				}));

	const valueOf = (slug: string) => (node.type === "content_ref" ? block?.[slug] : node.props[slug]);
	const change = (slug: string, value: unknown) => {
		if (node.type === "content_ref") {
			if (block) onEditContent(block._key, slug, value);
		} else {
			onUpdateProps({ [slug]: value });
		}
	};

	return (
		<aside
			id="bd-sidebar"
			aria-label={i18n._("Inspector")}
			className="flex w-64 shrink-0 flex-col overflow-y-auto border-e border-kumo-line bg-kumo-base"
		>
			<div className="flex items-center gap-2 border-b border-kumo-line px-3 py-2">
				<button
					type="button"
					onClick={onBack}
					className="rounded px-1 text-xs text-kumo-subtle hover:bg-kumo-tint"
					aria-label={i18n._("Back to blocks")}
				>
					&larr;
				</button>
				<h2 className="truncate text-sm font-semibold text-kumo-strong">{title}</h2>
				{block?._version !== undefined && (
					<span className="shrink-0 rounded-full bg-kumo-tint px-2 py-0.5 text-xs text-kumo-subtle">
						{i18n._("Version {version}", { version: block._version })}
					</span>
				)}
				<div className="ms-auto flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={onDuplicate}
						title={i18n._("Duplicate")}
						aria-label={i18n._("Duplicate")}
						className="rounded px-1 text-kumo-subtle hover:bg-kumo-tint"
					>
						&#10697;
					</button>
					<button
						type="button"
						onClick={onRemove}
						title={i18n._("Delete")}
						aria-label={i18n._("Delete")}
						className="flex items-center justify-center rounded px-1 py-1 text-kumo-danger hover:bg-kumo-tint"
					>
						<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
						</svg>
					</button>
				</div>
			</div>

			<div role="tablist" aria-label={i18n._("Settings")} className="flex border-b border-kumo-line">
				{(
					[
						["general", i18n._("General")],
						["styling", i18n._("Styling")],
						["extra", i18n._("Extra")],
					] as const
				).map(([id, label]) => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={tab === id}
						onClick={() => setTab(id)}
						style={{ borderBottomWidth: 2 }}
						className={[
							"flex-1 px-2 py-2 text-xs font-medium",
							tab === id ? "border-kumo-brand text-kumo-strong" : "border-transparent text-kumo-subtle hover:bg-kumo-tint",
						].join(" ")}
					>
						{label}
					</button>
				))}
			</div>

			{tab === "styling" ? (
				<StylingTab
					node={node}
					breakpoint={breakpoint}
					tokens={tokens}
					onChange={(patch: Partial<StyleValues>) => onUpdateStyle(breakpoint, patch)}
				/>
			) : tab === "extra" ? (
				<ExtraTab
					node={node}
					onChange={(patch: Partial<AdvancedValues>) => onUpdateStyle("advanced", patch)}
				/>
			) : node.type === "content_ref" && !block ? (
				<p className="px-3 py-4 text-xs text-kumo-subtle">
					{i18n._("This block no longer exists in the page content.")}
				</p>
			) : fields.length === 0 ? (
				<p className="px-3 py-4 text-xs text-kumo-subtle">{i18n._("Nothing to edit.")}</p>
			) : (
				<div className="flex flex-col gap-3 px-3 py-3">
					{fields.map((field) => (
						<FieldControl
							key={field.slug}
							field={field}
							value={valueOf(field.slug)}
							onChange={(value) => change(field.slug, value)}
							editUrl={editUrl}
						/>
					))}
					<p className="text-xs text-kumo-subtle">
						{i18n._("Changes show in the preview and are stored when you save.")}
					</p>
				</div>
			)}
		</aside>
	);
}
