/**
 * Publishing state and site-timezone dates for the Details panel.
 *
 * Mirrors EmDash's content editor: the same five states, and
 * `datetime-local` values read in the site's timezone, not the browser's.
 */

export type PublishingState =
	| "draft"
	| "scheduled"
	| "published"
	| "published-with-changes"
	| "update-scheduled"
	| "published-scheduled";

export function publishingStateOf({
	isLive,
	hasPendingChanges,
	scheduledAt,
}: {
	isLive: boolean;
	hasPendingChanges: boolean;
	scheduledAt: string | null | undefined;
}): PublishingState {
	if (!isLive) return scheduledAt ? "scheduled" : "draft";
	if (scheduledAt) return hasPendingChanges ? "update-scheduled" : "published-scheduled";
	return hasPendingChanges ? "published-with-changes" : "published";
}

const DATETIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function formatter(timezone: string): Intl.DateTimeFormat {
	return new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	});
}

function partsAt(format: Intl.DateTimeFormat, epochMs: number): Record<string, number> {
	const result: Record<string, number> = {};
	for (const part of format.formatToParts(new Date(epochMs))) {
		if (part.type !== "literal") result[part.type] = Number(part.value);
	}
	return result;
}

const pad = (value: number | undefined) => String(value ?? 0).padStart(2, "0");

function localValue(format: Intl.DateTimeFormat, epochMs: number): string {
	const p = partsAt(format, epochMs);
	return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

function offsetAt(format: Intl.DateTimeFormat, epochMs: number): number {
	const whole = Math.floor(epochMs / 1000) * 1000;
	const p = partsAt(format, whole);
	return (
		Date.UTC(p.year ?? 0, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0) -
		whole
	);
}

/** An ISO instant as a `datetime-local` value in the site's timezone. */
export function toSiteLocal(iso: string, timezone = "UTC"): string {
	const instant = new Date(iso);
	if (Number.isNaN(instant.getTime())) return "";
	return localValue(formatter(timezone), instant.getTime());
}

/**
 * A `datetime-local` value, read in the site's timezone, as an ISO instant.
 * Throws for a time that does not exist or is ambiguous (DST changes).
 */
export function fromSiteLocal(value: string, timezone = "UTC"): string {
	const match = DATETIME_LOCAL.exec(value);
	if (!match) throw new Error("Invalid date and time");
	const local = Date.UTC(
		Number(match[1]),
		Number(match[2]) - 1,
		Number(match[3]),
		Number(match[4]),
		Number(match[5]),
	);
	const format = formatter(timezone);
	const offsets = new Set<number>();
	for (let hours = -48; hours <= 48; hours += 6) offsets.add(offsetAt(format, local + hours * 3_600_000));
	const candidates = new Set(
		Array.from(offsets, (offset) => local - offset).filter(
			(candidate) => localValue(format, candidate) === value,
		),
	);
	if (candidates.size !== 1) throw new Error(`${value} does not exist or is ambiguous in ${timezone}`);
	return new Date([...candidates][0]!).toISOString();
}

/** The URL EmDash stores as the SEO image for a picked media item. */
export function seoImageUrl(item: {
	id: string;
	provider?: string;
	storageKey?: string;
	url?: string;
}): string {
	return !item.provider || item.provider === "local"
		? `/_emdash/api/media/file/${item.storageKey || item.id}`
		: (item.url ?? "");
}
