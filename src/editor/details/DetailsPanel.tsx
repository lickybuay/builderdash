/**
 * Details panel: the entry's settings, as in EmDash's content editor sidebar.
 *
 * EmDash does not export its sidebar sections, so they are rebuilt here with
 * the same order, copy and rules: Publish, URL & language, Ownership, Bylines
 * and SEO. Ownership and bylines need the editor role (as in EmDash); SEO
 * appears when the collection has it.
 *
 * The slug travels with Save, like the rest of the draft. Author, bylines and
 * SEO are applied at once, as EmDash does: they are not part of the draft.
 */

import * as React from "react";
import { Badge, Button, Dialog, Input, InputArea, Select, Switch, Text } from "@cloudflare/kumo";
import {
	fetchBylines,
	fetchUsers,
	getDraftStatus,
	MediaPickerModal,
	useCurrentUser,
	type BylineCreditInput,
	type ContentItem,
	type ContentSeoInput,
} from "@emdash-cms/admin";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";

import type { BuilderEntry, EntryMetaChanges } from "../useBuilderEntry";
import {
	fromSiteLocal,
	publishingStateOf,
	seoImageUrl,
	toSiteLocal,
	type PublishingState,
} from "./publishing";

/** EmDash's EDITOR role: below it, ownership and bylines are hidden. */
const ROLE_EDITOR = 40;
const SEO_TEXT_DEBOUNCE_MS = 500;

export interface DetailsPanelProps {
	entry: BuilderEntry | null | undefined;
	supportsDrafts: boolean;
	hasSeo: boolean;
	timezone: string | undefined;
	contentLocale: string | undefined;
	slug: string;
	onSlugChange: (slug: string) => void;
	/** The entry's title: part of the draft, saved with Save. */
	title: string;
	onTitleChange: (title: string) => void;
	onDiscard: () => void;
	onSchedule: (scheduledAt: string) => Promise<void>;
	onUnschedule: () => Promise<void>;
	onUpdateMeta: (changes: EntryMetaChanges) => Promise<void>;
	/** The page's custom CSS: part of the draft, saved with Save. */
	pageCss: string;
	onPageCssChange: (css: string) => void;
}

export function DetailsPanel(props: DetailsPanelProps): React.JSX.Element {
	const { i18n } = useLingui();
	const { entry } = props;
	const { data: currentUser } = useCurrentUser();
	const isEditor = (currentUser?.role ?? 0) >= ROLE_EDITOR;

	// No entry yet (new template): show only Title & URL and Custom CSS.
	const hasEntry = !!entry;

	// Listing users and bylines needs the editor role; never ask below it.
	const users = useQuery({
		queryKey: ["users", "builderdash"],
		queryFn: () => fetchUsers({ limit: 100 }),
		enabled: isEditor,
	});
	const bylines = useQuery({
		queryKey: ["bylines", "builderdash"],
		queryFn: () => fetchBylines({ limit: 100 }),
		enabled: isEditor,
	});

	return (
		<aside
			id="bd-details"
			aria-label={i18n._("Details")}
			className="flex w-72 shrink-0 flex-col overflow-y-auto border-s border-kumo-line bg-kumo-base whitespace-normal"
		>
			{hasEntry ? <PublishSection {...props} /> : null}
			<Section title={i18n._("Title & URL")}>
				<div className="grid gap-4">
					<Input
						label={i18n._("Title")}
						value={props.title}
						onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
							props.onTitleChange(event.target.value)
						}
					/>
					<Input
						label={i18n._("Slug")}
						value={props.slug}
						onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
							props.onSlugChange(event.target.value)
						}
						placeholder="my-post-slug"
					/>
					{props.contentLocale ? (
						<div className="flex items-center justify-between gap-3">
							<Text as="span" variant="secondary" size="sm">
								{i18n._("Content language")}
							</Text>
							<Badge variant="secondary">{props.contentLocale.toUpperCase()}</Badge>
						</div>
					) : null}
				</div>
			</Section>
			{hasEntry && isEditor && (users.data?.items.length ?? 0) > 0 ? (
				<Section title={i18n._("Ownership")}>
					<OwnershipField
						authorId={entry!.authorId}
						users={users.data!.items}
						onChange={(authorId) => void props.onUpdateMeta({ authorId }).catch(() => undefined)}
					/>
				</Section>
			) : null}
			{hasEntry && isEditor ? (
				<Section title={i18n._("Bylines")} note={i18n._("Shown to readers in this order.")}>
					<BylinesField
						credits={(entry!.bylines ?? [])
							.filter((credit) => credit.source !== "inferred")
							.map((credit) => ({ bylineId: credit.byline.id, roleLabel: credit.roleLabel }))}
						known={[
							...(bylines.data?.items ?? []),
							...(entry!.bylines ?? []).map((credit) => credit.byline),
						]}
						onChange={(next) => void props.onUpdateMeta({ bylines: next }).catch(() => undefined)}
					/>
				</Section>
			) : null}
			{hasEntry && props.hasSeo ? (
				<Section title={i18n._("SEO")}>
					<SeoFields
						key={entry!.id}
						seo={entry!.seo}
						defaultTitle={typeof entry!.data?.title === "string" ? entry!.data.title : undefined}
						onChange={(seo) => void props.onUpdateMeta({ seo }).catch(() => undefined)}
					/>
				</Section>
			) : null}
			<Section
				title={i18n._("Custom CSS")}
				note={i18n._("Applies to this page only, after the builder styles. Saved with the page.")}
			>
				<textarea
					value={props.pageCss}
					onChange={(event) => props.onPageCssChange(event.target.value)}
					spellCheck={false}
					rows={10}
					maxLength={20000}
					aria-label={i18n._("Custom CSS")}
					placeholder={".builderdash h1 {\n  letter-spacing: -0.02em;\n}"}
					className="w-full rounded border border-kumo-line bg-kumo-control px-2 py-1.5 text-xs text-kumo-default"
					style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", resize: "vertical" }}
				/>
			</Section>
			<p className="px-4 py-3 text-xs text-kumo-subtle">
				{i18n._(
					"Author, bylines and SEO apply as soon as you change them, without publishing. Title and slug are saved with the page.",
				)}
			</p>
		</aside>
	);
}

/** A settings section that opens from its title; closed unless `defaultOpen`. */
function Section({
	title,
	note,
	defaultOpen = false,
	children,
}: {
	title: string;
	note?: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}): React.JSX.Element {
	const [open, setOpen] = React.useState(defaultOpen);
	const bodyId = React.useId();
	return (
		<section className="border-b border-kumo-line">
			<h3>
				<button
					type="button"
					onClick={() => setOpen(!open)}
					aria-expanded={open}
					aria-controls={bodyId}
					className="flex w-full items-center justify-between px-4 py-3 text-start text-sm font-semibold text-kumo-strong hover:bg-kumo-tint"
				>
					{title}
					<svg
						viewBox="0 0 24 24"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
						className="text-kumo-subtle"
						style={{ transform: open ? "rotate(180deg)" : undefined }}
					>
						<path d="m6 9 6 6 6-6" />
					</svg>
				</button>
			</h3>
			{open ? (
				<div id={bodyId} className="px-4 pb-4">
					{note ? <p className="mb-3 text-xs text-kumo-subtle">{note}</p> : null}
					{children}
				</div>
			) : null}
		</section>
	);
}

// --- Publish -----------------------------------------------------------------

function PublishSection({
	entry,
	supportsDrafts,
	timezone,
	onDiscard,
	onSchedule,
	onUnschedule,
}: DetailsPanelProps): React.JSX.Element {
	const { i18n } = useLingui();
	const e = entry!;
	const draft = getDraftStatus(e as unknown as ContentItem);
	const state = publishingStateOf({
		isLive: draft !== "unpublished",
		hasPendingChanges: draft === "published_with_changes",
		scheduledAt: e.scheduledAt,
	});
	// Discard reverts to the live version, so it needs one.
	const canDiscard =
		supportsDrafts && (state === "published-with-changes" || state === "update-scheduled");
	const hasSchedule =
		state === "scheduled" || state === "update-scheduled" || state === "published-scheduled";
	const canSchedule = !hasSchedule && state !== "published";
	const [datesOpen, setDatesOpen] = React.useState(false);
	const [scheduling, setScheduling] = React.useState(false);

	return (
		<Section title={i18n._("Publish")} defaultOpen>
			<div role="group" aria-label={i18n._("Publishing summary")} className="overflow-hidden rounded-lg border border-kumo-line">
				<VersionRows
					state={state}
					scheduledAt={e.scheduledAt}
					timezone={timezone}
					discard={canDiscard ? <DiscardButton onDiscard={onDiscard} /> : null}
				/>
				<div className="border-t border-kumo-line px-3 py-1.5">
					{e.publishedAt ? (
						<TimestampRow label={i18n._("Publication date")} value={e.publishedAt} />
					) : null}
					<button
						type="button"
						onClick={() => setDatesOpen(!datesOpen)}
						aria-expanded={datesOpen}
						className="flex w-full items-center justify-between py-1.5 text-xs text-kumo-subtle"
					>
						{i18n._("Created and updated")}
						<svg
							viewBox="0 0 24 24"
							width="12"
							height="12"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
							style={{ transform: datesOpen ? "rotate(180deg)" : undefined }}
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
					</button>
					{datesOpen ? (
						<dl className="grid gap-1.5 pb-1.5">
							<TimestampRow label={i18n._("Created")} value={e.createdAt} />
							<TimestampRow label={i18n._("Updated")} value={e.updatedAt} />
						</dl>
					) : null}
				</div>
			</div>

			{scheduling ? (
				<ScheduleForm
					initial={e.scheduledAt}
					timezone={timezone}
					onCancel={() => setScheduling(false)}
					onConfirm={async (iso) => {
						await onSchedule(iso);
						setScheduling(false);
					}}
				/>
			) : canSchedule || hasSchedule ? (
				<div className={`mt-3 grid gap-2 ${hasSchedule ? "grid-cols-2" : "grid-cols-1"}`}>
					<Button type="button" variant="outline" size="sm" onClick={() => setScheduling(true)}>
						{hasSchedule ? i18n._("Change schedule") : i18n._("Schedule")}
					</Button>
					{hasSchedule ? (
						<Button
							type="button"
							variant="secondary-destructive"
							size="sm"
							onClick={() => void onUnschedule().catch(() => undefined)}
						>
							{i18n._("Remove schedule")}
						</Button>
					) : null}
				</div>
			) : null}
		</Section>
	);
}

function VersionRows({
	state,
	scheduledAt,
	timezone,
	discard,
}: {
	state: PublishingState;
	scheduledAt: string | null;
	timezone: string | undefined;
	discard: React.ReactNode;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const when = scheduledAt
		? i18n._("Scheduled for {when}", { when: formatInstant(scheduledAt, i18n.locale, timezone) })
		: i18n._("A publication time has not been selected");
	const live = (description: string, connect = true) => (
		<VersionRow icon="published" title={i18n._("Live version")} description={description} connect={connect} />
	);
	let rows: React.ReactNode;
	switch (state) {
		case "draft":
			rows = (
				<VersionRow icon="draft" title={i18n._("Draft version")} description={i18n._("This version is not visible on the site")} />
			);
			break;
		case "scheduled":
			rows = <VersionRow icon="scheduled" title={i18n._("First publication")} description={when} />;
			break;
		case "published":
			rows = live(i18n._("Visitors see this published version"), false);
			break;
		case "published-with-changes":
			rows = (
				<>
					{live(i18n._("Visitors still see the published version"))}
					<VersionRow
						icon="pending"
						title={i18n._("Draft changes")}
						description={i18n._("Ready to publish now or schedule for later")}
						action={discard}
					/>
				</>
			);
			break;
		case "update-scheduled":
			rows = (
				<>
					{live(i18n._("Visitors see the published version until the scheduled update"))}
					<VersionRow icon="scheduled" title={i18n._("Draft changes")} description={when} action={discard} />
				</>
			);
			break;
		case "published-scheduled":
			rows = (
				<>
					{live(i18n._("Visitors see this published version"))}
					<VersionRow icon="scheduled" title={i18n._("Scheduled publication")} description={when} />
				</>
			);
	}
	return <div className="grid gap-4 px-3 py-3">{rows}</div>;
}

const STATUS_ICONS: Record<"published" | "draft" | "scheduled" | "pending", { className: string; path: React.ReactNode }> = {
	published: {
		className: "text-kumo-success",
		path: (
			<>
				<circle cx="12" cy="12" r="9" />
				<path d="m8.5 12 2.5 2.5 4.5-5" />
			</>
		),
	},
	draft: {
		className: "text-kumo-warning",
		path: <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />,
	},
	scheduled: {
		className: "text-kumo-info",
		path: (
			<>
				<rect x="3" y="5" width="18" height="16" rx="2" />
				<path d="M3 10h18M8 3v4M16 3v4" />
			</>
		),
	},
	pending: {
		className: "text-kumo-warning",
		path: (
			<>
				<path d="M4 12a8 8 0 0 1 14-5.3L20 9" />
				<path d="M20 4v5h-5" />
				<path d="M20 12a8 8 0 0 1-14 5.3L4 15" />
				<path d="M4 20v-5h5" />
			</>
		),
	},
};

function VersionRow({
	icon,
	title,
	description,
	action,
	connect,
}: {
	icon: keyof typeof STATUS_ICONS;
	title: string;
	description: React.ReactNode;
	action?: React.ReactNode;
	connect?: boolean;
}): React.JSX.Element {
	const glyph = STATUS_ICONS[icon];
	return (
		<div className="flex items-start gap-3">
			<span className="relative flex w-3.5 shrink-0 self-stretch justify-center">
				{connect ? <span className="absolute top-6 -bottom-3 w-px bg-kumo-line" aria-hidden="true" /> : null}
				<span className="relative z-10 flex h-5 items-center bg-kumo-base">
					<svg
						viewBox="0 0 24 24"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className={glyph.className}
						aria-hidden="true"
					>
						{glyph.path}
					</svg>
				</span>
			</span>
			<div className="min-w-0 flex-1">
				<Text as="p" bold>
					{title}
				</Text>
				<Text as="p" variant="secondary" size="xs" DANGEROUS_className="mt-0.5 text-pretty">
					{description}
				</Text>
				{action ? <div className="-ms-2 mt-1">{action}</div> : null}
			</div>
		</div>
	);
}

function DiscardButton({ onDiscard }: { onDiscard: () => void }): React.JSX.Element {
	const { i18n } = useLingui();
	return (
		<Dialog.Root>
			<Dialog.Trigger
				render={(p) => (
					<Button {...p} type="button" variant="ghost" size="sm">
						{"× "}
						{i18n._("Discard changes")}
					</Button>
				)}
			/>
			<Dialog className="p-6" size="sm">
				<Dialog.Title className="text-lg font-semibold">{i18n._("Discard draft changes?")}</Dialog.Title>
				<Dialog.Description className="text-kumo-subtle">
					{i18n._(
						"This will revert to the published version. Your draft changes, including the builder layout, will be lost.",
					)}
				</Dialog.Description>
				<div className="mt-6 flex justify-end gap-2">
					<Dialog.Close
						render={(p) => (
							<Button {...p} variant="secondary">
								{i18n._("Cancel")}
							</Button>
						)}
					/>
					<Dialog.Close
						render={(p) => (
							<Button {...p} variant="destructive" onClick={onDiscard}>
								{i18n._("Discard changes")}
							</Button>
						)}
					/>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}

function ScheduleForm({
	initial,
	timezone,
	onCancel,
	onConfirm,
}: {
	initial: string | null;
	timezone: string | undefined;
	onCancel: () => void;
	onConfirm: (iso: string) => Promise<void>;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const [value, setValue] = React.useState(initial ? toSiteLocal(initial, timezone) : "");
	const [error, setError] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState(false);

	const confirm = async () => {
		let iso: string;
		try {
			iso = fromSiteLocal(value, timezone);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
			return;
		}
		setBusy(true);
		try {
			await onConfirm(iso);
		} catch {
			// The builder shows the server's message.
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="mt-3 grid gap-2">
			<label className="grid gap-1 text-xs text-kumo-subtle">
				{timezone
					? i18n._("Publish on ({timezone})", { timezone })
					: i18n._("Publish on")}
				<input
					type="datetime-local"
					value={value}
					onChange={(event) => {
						setValue(event.target.value);
						setError(null);
					}}
					className="w-full rounded border border-kumo-line bg-kumo-control px-2 py-1.5 text-sm text-kumo-default"
				/>
			</label>
			{error ? <p className="text-xs text-kumo-danger">{error}</p> : null}
			<div className="grid grid-cols-2 gap-2">
				<Button type="button" variant="secondary" size="sm" onClick={onCancel}>
					{i18n._("Cancel")}
				</Button>
				<Button type="button" variant="primary" size="sm" disabled={!value || busy} onClick={() => void confirm()}>
					{i18n._("Schedule")}
				</Button>
			</div>
		</div>
	);
}

function TimestampRow({ label, value }: { label: string; value: string }): React.JSX.Element {
	const { i18n } = useLingui();
	return (
		<div className="flex items-center justify-between gap-2 py-1 whitespace-nowrap">
			<dt className="min-w-0 flex-1 truncate text-xs text-kumo-subtle">{label}</dt>
			<dd className="shrink-0 text-end text-xs">
				<time dateTime={value}>{formatInstant(value, i18n.locale)}</time>
			</dd>
		</div>
	);
}

function formatInstant(iso: string, locale: string, timezone?: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
		...(timezone ? { timeZone: timezone, timeZoneName: "short" } : {}),
	}).format(date);
}

// --- Ownership ---------------------------------------------------------------

function OwnershipField({
	authorId,
	users,
	onChange,
}: {
	authorId: string | null;
	users: Array<{ id: string; name: string | null; email: string }>;
	onChange: (authorId: string | null) => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const current = users.find((user) => user.id === authorId);
	const items: Record<string, string> = { unassigned: i18n._("Unassigned") };
	for (const user of users) items[user.id] = user.name || user.email;
	return (
		<div className="space-y-2">
			<Select
				aria-label={i18n._("Author")}
				className="w-full"
				value={authorId || "unassigned"}
				onValueChange={(value: string | null) => onChange(value === "unassigned" || value === null ? null : value)}
				items={items}
			>
				<Select.Option value="unassigned">
					<span className="text-kumo-subtle">{i18n._("Unassigned")}</span>
				</Select.Option>
				{users.map((user) => (
					<Select.Option key={user.id} value={user.id}>
						{user.name || user.email}
					</Select.Option>
				))}
			</Select>
			{current ? <p className="text-xs text-kumo-subtle">{current.email}</p> : null}
		</div>
	);
}

// --- Bylines -----------------------------------------------------------------

function BylinesField({
	credits,
	known,
	onChange,
}: {
	credits: BylineCreditInput[];
	known: Array<{ id: string; displayName: string }>;
	onChange: (credits: BylineCreditInput[]) => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const nameOf = (id: string) => known.find((byline) => byline.id === id)?.displayName ?? id;
	const available = known.filter(
		(byline, at) =>
			!credits.some((credit) => credit.bylineId === byline.id) &&
			known.findIndex((other) => other.id === byline.id) === at,
	);

	const move = (from: number, to: number) => {
		const next = [...credits];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item!);
		onChange(next);
	};

	return (
		<div className="grid gap-2">
			{credits.length > 0 ? (
				<ol className="grid gap-1">
					{credits.map((credit, at) => (
						<li
							key={credit.bylineId}
							className="flex items-center gap-1 rounded border border-kumo-line bg-kumo-control px-2 py-1 text-sm"
						>
							<span className="min-w-0 flex-1 truncate">{nameOf(credit.bylineId)}</span>
							<IconButton label={i18n._("Move up")} disabled={at === 0} onClick={() => move(at, at - 1)} d="m18 15-6-6-6 6" />
							<IconButton
								label={i18n._("Move down")}
								disabled={at === credits.length - 1}
								onClick={() => move(at, at + 1)}
								d="m6 9 6 6 6-6"
							/>
							<IconButton
								label={i18n._("Remove")}
								onClick={() => onChange(credits.filter((_, index) => index !== at))}
								d="M18 6 6 18M6 6l12 12"
							/>
						</li>
					))}
				</ol>
			) : null}
			<select
				aria-label={i18n._("Choose bylines")}
				value=""
				disabled={available.length === 0}
				onChange={(event) => {
					if (event.target.value) onChange([...credits, { bylineId: event.target.value }]);
				}}
				className="w-full rounded border border-kumo-line bg-kumo-control px-2 py-1.5 text-sm text-kumo-default"
			>
				<option value="">{i18n._("Choose bylines")}</option>
				{available.map((byline) => (
					<option key={byline.id} value={byline.id}>
						{byline.displayName}
					</option>
				))}
			</select>
		</div>
	);
}

function IconButton({
	label,
	d,
	onClick,
	disabled,
}: {
	label: string;
	d: string;
	onClick: () => void;
	disabled?: boolean;
}): React.JSX.Element {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className="rounded p-0.5 text-kumo-subtle hover:bg-kumo-tint"
			style={disabled ? { opacity: 0.4 } : undefined}
		>
			<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
				<path d={d} />
			</svg>
		</button>
	);
}

// --- SEO -----------------------------------------------------------------------

interface SeoDraft {
	title: string;
	description: string;
	canonical: string;
}

function SeoFields({
	seo,
	defaultTitle,
	onChange,
}: {
	seo: ContentItem["seo"];
	defaultTitle: string | undefined;
	onChange: (seo: ContentSeoInput) => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const [picking, setPicking] = React.useState(false);
	const [draft, setDraft] = React.useState<SeoDraft>(() => ({
		title: seo?.title ?? "",
		description: seo?.description ?? "",
		canonical: seo?.canonical ?? "",
	}));

	// Text is sent after a pause, and on leaving the panel; never per key.
	const sent = React.useRef(JSON.stringify(draft));
	const latest = React.useRef(draft);
	latest.current = draft;
	const onChangeRef = React.useRef(onChange);
	onChangeRef.current = onChange;
	const flush = React.useCallback(() => {
		const snapshot = JSON.stringify(latest.current);
		if (snapshot === sent.current) return;
		sent.current = snapshot;
		const { title, description, canonical } = latest.current;
		onChangeRef.current({
			title: title || null,
			description: description || null,
			canonical: canonical || null,
		});
	}, []);
	React.useEffect(() => {
		const timer = setTimeout(flush, SEO_TEXT_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [draft, flush]);
	React.useEffect(() => flush, [flush]);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Text as="span" size="sm" bold>
					{i18n._("OG Image")}
				</Text>
				{seo?.image ? (
					<div className="grid gap-2">
						<img src={seo.image} alt="" className="w-full rounded border border-kumo-line object-cover" style={{ maxHeight: 140 }} />
						<div className="grid grid-cols-2 gap-2">
							<Button type="button" variant="secondary" size="sm" onClick={() => setPicking(true)}>
								{i18n._("Replace")}
							</Button>
							<Button type="button" variant="secondary-destructive" size="sm" onClick={() => onChange({ image: null })}>
								{i18n._("Remove")}
							</Button>
						</div>
					</div>
				) : (
					<button
						type="button"
						onClick={() => setPicking(true)}
						className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-kumo-line px-3 py-6 text-sm text-kumo-subtle hover:bg-kumo-tint"
					>
						<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
						</svg>
						{i18n._("Choose an image")}
					</button>
				)}
				<MediaPickerModal
					open={picking}
					onOpenChange={setPicking}
					mediaKind="image"
					onSelect={(item) => {
						onChange({ image: seoImageUrl(item as typeof item & { provider?: string }) });
						setPicking(false);
					}}
				/>
			</div>
			<Input
				label={i18n._("SEO Title")}
				className="w-full"
				value={draft.title}
				placeholder={defaultTitle}
				onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, title: event.target.value })}
			/>
			<div className="space-y-1">
				<InputArea
					label={i18n._("Meta Description")}
					className="w-full"
					rows={3}
					value={draft.description}
					onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
						setDraft({ ...draft, description: event.target.value })
					}
				/>
				<p className="text-xs text-kumo-subtle">
					{i18n._("{count}/160 characters", { count: draft.description.length })}
				</p>
			</div>
			<Input
				label={i18n._("Canonical URL")}
				className="w-full"
				value={draft.canonical}
				onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, canonical: event.target.value })}
			/>
			<div className="flex items-center justify-between">
				<Text as="span" size="sm">
					{i18n._("Hide from search engines")}
				</Text>
				<Switch
					aria-label={i18n._("Hide from search engines")}
					checked={seo?.noIndex ?? false}
					onCheckedChange={(checked: boolean) => onChange({ noIndex: checked })}
				/>
			</div>
		</div>
	);
}
