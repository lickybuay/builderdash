/**
 * The Inspector's value controls, one per kind of value, modelled on
 * Elementor's (Slider with units and "custom", Dimensions, Typography and Box
 * Shadow groups). The rules live in `.claude/rules/color-fields.md` and
 * `.claude/rules/value-fields.md`.
 *
 * Every control:
 * - stores a CSS string and reports `undefined` when emptied (empty = unset);
 * - suggests the site theme's tokens of its own kind, inserted as `var(--x)`,
 *   and warns about a `var(--x)` the theme does not declare;
 * - validates with the SAME functions the CSS generator uses
 *   (`render/styles.ts`), so what it accepts is exactly what renders;
 * - shows the value inherited from a wider device as placeholder text.
 */

import * as React from "react";
import { useLingui } from "@lingui/react";

import {
	cssColor,
	cssLength,
	cssLineHeight,
	cssShadow,
	cssWeight,
	cssZIndex,
} from "../../render/styles";

export const inputClass =
	"w-full rounded border border-kumo-line bg-kumo-control px-2 py-1.5 text-xs text-kumo-default";

// ---------------------------------------------------------------------------
// Theme tokens
// ---------------------------------------------------------------------------

/** Token kinds and the custom-property prefixes the theme uses for them. */
const TOKEN_PREFIXES = {
	color: ["--color-"],
	space: ["--spacing-", "--space-", "--max-width", "--wide-width"],
	fontSize: ["--font-size-"],
	fontWeight: ["--font-weight-"],
	lineHeight: ["--line-height-", "--leading-"],
	radius: ["--radius"],
	shadow: ["--shadow"],
} as const;

export type TokenKind = keyof typeof TOKEN_PREFIXES;

/** The site theme's custom properties, for controls deep in the Inspector. */
export const ThemeTokens = React.createContext<readonly string[]>([]);

export function tokensOf(tokens: readonly string[], kind: TokenKind): string[] {
	const prefixes: readonly string[] = TOKEN_PREFIXES[kind];
	return tokens.filter((name) => prefixes.some((prefix) => name.startsWith(prefix)));
}

/** The datalist a field offers its tokens through. */
function TokenList({ id, names }: { id: string; names: readonly string[] }): React.JSX.Element {
	return (
		<datalist id={id}>
			{names.map((name) => (
				<option key={name} value={`var(${name})`} />
			))}
		</datalist>
	);
}

/** A `var(--x)` (anywhere in the value) the theme does not declare. */
function unknownToken(value: string | undefined, tokens: readonly string[]): string | null {
	if (!value || tokens.length === 0) return null;
	for (const match of value.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) {
		if (!tokens.includes(match[1]!)) return match[1]!;
	}
	return null;
}

function useMessages() {
	const { i18n } = useLingui();
	return {
		unknown: (name: string) => i18n._("{name} is not declared in the theme.", { name }),
		invalid: i18n._("Not a valid value: it will not be applied."),
	};
}

function Hint({ text, tone }: { text: string | null; tone: "danger" | "warning" }): React.JSX.Element | null {
	if (!text) return null;
	return (
		<span className={tone === "danger" ? "text-xs text-kumo-danger" : "text-xs text-kumo-warning"}>{text}</span>
	);
}

/** A clear (×) button: empties the field (unset). */
function ClearButton({ label, onClear }: { label: string; onClear: () => void }): React.JSX.Element {
	const { i18n } = useLingui();
	return (
		<button
			type="button"
			onClick={onClear}
			title={i18n._("Clear {field}", { field: label })}
			aria-label={i18n._("Clear {field}", { field: label })}
			className="shrink-0 rounded px-1 text-kumo-subtle hover:bg-kumo-tint"
		>
			<span aria-hidden="true">&times;</span>
		</button>
	);
}

const emptyToUndefined = (value: string): string | undefined => (value.trim() === "" ? undefined : value);

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/** `#rgb` / `#rrggbb` → `#rrggbb` for the native picker; anything else → null. */
export function pickerHex(value: string | undefined): string | null {
	const trimmed = value?.trim() ?? "";
	if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
	return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : null;
}

export function ColorField({
	label,
	value,
	onChange,
	tokens,
	inherited,
	id: givenId,
}: {
	label: string;
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	tokens: readonly string[];
	inherited?: string;
	id?: string;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const messages = useMessages();
	const ownId = React.useId();
	const id = givenId ?? ownId;
	const listId = `${id}-tokens`;
	const hex = pickerHex(value);
	// Literal colors preview in the swatch; a token, rgb()/hsl() or alpha hex
	// shows a neutral swatch (the native picker is #rrggbb only).
	const literal = value && cssColor(value) && !value.includes("var(") ? value : null;
	const invalid = value && !cssColor(value) ? messages.invalid : null;
	const unknown = unknownToken(value, tokens);
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-xs text-kumo-subtle">
				{label}
			</label>
			<div className="flex items-center gap-2">
				<span className="relative size-8 shrink-0 overflow-hidden rounded border border-kumo-line">
					<span
						aria-hidden="true"
						className="absolute inset-0"
						style={
							literal
								? { background: literal }
								: {
										backgroundImage:
											"linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)",
										backgroundSize: "8px 8px",
										backgroundPosition: "0 0,4px 4px",
									}
						}
					/>
					<input
						type="color"
						aria-label={i18n._("Pick {field}", { field: label })}
						value={hex ?? "#000000"}
						// Only a real pick writes: a token or alpha value is never
						// overwritten just by opening the picker.
						onChange={(event) => onChange(event.target.value)}
						className="absolute inset-0 size-full cursor-pointer opacity-0"
					/>
				</span>
				<input
					id={id}
					type="text"
					list={listId}
					value={value ?? ""}
					placeholder={inherited ?? "#ffffff, rgba(0,0,0,.5), var(--color-…)"}
					onChange={(event) => onChange(emptyToUndefined(event.target.value))}
					aria-invalid={invalid ? true : undefined}
					className={inputClass}
				/>
				{value ? <ClearButton label={label} onClear={() => onChange(undefined)} /> : null}
			</div>
			<TokenList id={listId} names={tokensOf(tokens, "color")} />
			<Hint text={invalid} tone="danger" />
			<Hint text={unknown && messages.unknown(unknown)} tone="warning" />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Length (with units and "custom")
// ---------------------------------------------------------------------------

export const ALL_UNITS = ["px", "%", "em", "rem", "vw", "vh"] as const;
export type Unit = (typeof ALL_UNITS)[number] | "custom";
const NUMBER_WITH_UNIT = /^(-?\d+(?:\.\d+)?)(px|%|em|rem|vw|vh)?$/;

/** "24px" → { num: "24", unit: "px" }; a token, keyword or expression → null. */
export function splitLength(value: string | undefined): { num: string; unit: Unit | null } | null {
	const match = value?.trim().match(NUMBER_WITH_UNIT);
	return match ? { num: match[1]!, unit: (match[2] as Unit | undefined) ?? null } : null;
}

/** The unit a value is shown in: its own, "custom" for anything not a number. */
function unitFor(value: string | undefined, fallback: Unit): Unit {
	if (!value?.trim()) return fallback;
	const parts = splitLength(value);
	if (!parts) return "custom";
	return parts.unit ?? fallback;
}

/** The unit dropdown beside a field's title, as in Elementor. */
function UnitSelect({
	value,
	units,
	onChange,
	label,
}: {
	value: Unit;
	units: readonly Unit[];
	onChange: (unit: Unit) => void;
	label: string;
}): React.JSX.Element {
	const { i18n } = useLingui();
	return (
		<select
			value={value}
			onChange={(event) => onChange(event.target.value as Unit)}
			aria-label={i18n._("{field} unit", { field: label })}
			className="ms-auto rounded border border-kumo-line bg-kumo-control px-1 text-xs text-kumo-subtle"
		>
			{units.map((unit) => (
				<option key={unit} value={unit}>
					{unit === "custom" ? i18n._("custom") : unit}
				</option>
			))}
		</select>
	);
}

/** Validation message for one length value. */
function lengthProblem(
	value: string | undefined,
	negative: boolean,
	messages: ReturnType<typeof useMessages>,
	i18n: ReturnType<typeof useLingui>["i18n"],
): string | null {
	if (!value?.trim()) return null;
	if (cssLength(value, { negative })) return null;
	if (!negative && value.trim().startsWith("-")) return i18n._("Negative values are not allowed here.");
	return messages.invalid;
}

export function LengthField({
	label,
	value,
	onChange,
	tokens,
	tokenKind,
	units = [...ALL_UNITS, "custom"],
	negative = false,
	inherited,
}: {
	label: string;
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	tokens: readonly string[];
	tokenKind?: TokenKind;
	units?: readonly Unit[];
	negative?: boolean;
	inherited?: string;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const messages = useMessages();
	const id = React.useId();
	const [chosen, setChosen] = React.useState<Unit>(() => unitFor(value, units[0] ?? "px"));
	const unit = value?.trim() ? unitFor(value, chosen) : chosen;
	const custom = unit === "custom";
	const listId = `${id}-tokens`;

	const changeUnit = (next: Unit) => {
		setChosen(next);
		const parts = splitLength(value);
		if (next === "custom") return; // keep the value as text
		// Units switch keeps the number (16px → 16rem), as in Elementor.
		if (parts) onChange(`${parts.num}${next}`);
		else if (value?.trim()) onChange(undefined);
	};
	const shown = custom ? (value ?? "") : (splitLength(value)?.num ?? value ?? "");
	const problem = lengthProblem(value, negative, messages, i18n);
	const unknown = unknownToken(value, tokens);

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1">
				<label htmlFor={id} className="text-xs text-kumo-subtle">
					{label}
				</label>
				<UnitSelect label={label} units={units} value={unit} onChange={changeUnit} />
			</div>
			<div className="flex items-center gap-1">
				<input
					id={id}
					type="text"
					inputMode={custom ? "text" : "decimal"}
					list={tokenKind ? listId : undefined}
					value={shown}
					placeholder={
						inherited ?? (custom ? "calc(100% - 2rem), clamp(1rem, 2vw, 2rem), var(--…)" : undefined)
					}
					onChange={(event) => {
						// Not trimmed while typing: `calc(100% - 2rem)` needs its spaces.
						const input = event.target.value;
						if (input.trim() === "") return onChange(undefined);
						// A plain number takes the unit; anything else is kept as typed
						// (a token picked from the list, a custom expression).
						const number = input.trim();
						onChange(!custom && /^-?\d+(\.\d+)?$/.test(number) ? `${number}${unit}` : input);
					}}
					aria-invalid={problem ? true : undefined}
					className={inputClass}
				/>
				{value ? <ClearButton label={label} onClear={() => onChange(undefined)} /> : null}
			</div>
			{tokenKind ? <TokenList id={listId} names={tokensOf(tokens, tokenKind)} /> : null}
			<Hint text={problem} tone="danger" />
			<Hint text={unknown && messages.unknown(unknown)} tone="warning" />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Spacing box (margin, padding)
// ---------------------------------------------------------------------------

export interface Sides {
	t?: string;
	r?: string;
	b?: string;
	l?: string;
}
const SIDES = ["t", "r", "b", "l"] as const;

export function BoxField({
	label,
	value,
	onChange,
	tokens,
	negative = false,
	inherited,
}: {
	label: string;
	value: Sides | undefined;
	onChange: (value: Sides | undefined) => void;
	tokens: readonly string[];
	negative?: boolean;
	inherited?: Sides;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const messages = useMessages();
	const id = React.useId();
	const [linked, setLinked] = React.useState(false);
	const firstSet = SIDES.map((side) => value?.[side]).find((side) => side?.trim());
	const [chosen, setChosen] = React.useState<Unit>(() => unitFor(firstSet, "px"));
	const unit = firstSet ? unitFor(firstSet, chosen) : chosen;
	const custom = unit === "custom";
	const names = { t: i18n._("Top"), r: i18n._("Right"), b: i18n._("Bottom"), l: i18n._("Left") };

	const emit = (next: Sides) => {
		const clean: Sides = {};
		for (const side of SIDES) if (next[side]?.trim()) clean[side] = next[side];
		onChange(Object.keys(clean).length > 0 ? clean : undefined);
	};
	const set = (side: keyof Sides, input: string) => {
		// Not trimmed while typing: a custom expression needs its spaces.
		const trimmed = input.trim();
		const next = trimmed === "" ? "" : !custom && /^-?\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}${unit}` : input;
		emit(linked ? { t: next, r: next, b: next, l: next } : { ...value, [side]: next });
	};
	const changeUnit = (next: Unit) => {
		setChosen(next);
		if (next === "custom") return;
		const converted: Sides = {};
		for (const side of SIDES) {
			const parts = splitLength(value?.[side]);
			if (parts) converted[side] = `${parts.num}${next}`;
		}
		emit(converted);
	};
	const problem = SIDES.map((side) => lengthProblem(value?.[side], negative, messages, i18n)).find(Boolean) ?? null;
	const unknown = SIDES.map((side) => unknownToken(value?.[side], tokens)).find(Boolean) ?? null;

	return (
		<div className="flex flex-col gap-1" role="group" aria-labelledby={`${id}-label`}>
			<div className="flex items-center">
				<span id={`${id}-label`} className="text-xs text-kumo-subtle">
					{label}
				</span>
				<UnitSelect label={label} units={[...ALL_UNITS, "custom"]} value={unit} onChange={changeUnit} />
			</div>
			<div className="flex items-end gap-1">
				{SIDES.map((side) => (
					<label key={side} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-xs text-kumo-subtle">
						<input
							type="text"
							inputMode={custom ? "text" : "decimal"}
							list={`${id}-tokens`}
							aria-label={`${label} ${names[side]}`}
							value={custom ? (value?.[side] ?? "") : (splitLength(value?.[side])?.num ?? value?.[side] ?? "")}
							placeholder={inherited?.[side]}
							onChange={(event) => set(side, event.target.value)}
							className={inputClass}
						/>
						{names[side]}
					</label>
				))}
				<button
					type="button"
					onClick={() => setLinked(!linked)}
					aria-pressed={linked}
					title={linked ? i18n._("Unlink sides") : i18n._("Link sides")}
					aria-label={linked ? i18n._("Unlink sides") : i18n._("Link sides")}
					className={[
						"mb-5 flex items-center justify-center rounded px-1 py-1 hover:bg-kumo-tint",
						linked ? "text-kumo-brand" : "text-kumo-subtle",
					].join(" ")}
				>
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
					</svg>
				</button>
			</div>
			<TokenList id={`${id}-tokens`} names={tokensOf(tokens, "space")} />
			<Hint text={problem} tone="danger" />
			<Hint text={unknown && messages.unknown(unknown)} tone="warning" />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Typography: weight (enum), line height (unitless number)
// ---------------------------------------------------------------------------

export function WeightField({
	label,
	value,
	onChange,
	tokens,
	inherited,
}: {
	label: string;
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	tokens: readonly string[];
	inherited?: string;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const id = React.useId();
	const named: Array<[string, string]> = [
		["100", i18n._("100 · Thin")],
		["200", i18n._("200 · Extra light")],
		["300", i18n._("300 · Light")],
		["400", i18n._("400 · Normal")],
		["500", i18n._("500 · Medium")],
		["600", i18n._("600 · Semi bold")],
		["700", i18n._("700 · Bold")],
		["800", i18n._("800 · Extra bold")],
		["900", i18n._("900 · Black")],
	];
	const themed = tokensOf(tokens, "fontWeight").map((name) => [`var(${name})`, name] as [string, string]);
	const options = [...named, ...themed];
	// A stored value outside the list (an old free-text weight) stays visible.
	if (value && !options.some(([option]) => option === value)) options.push([value, value]);
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-xs text-kumo-subtle">
				{label}
			</label>
			<select
				id={id}
				value={value ?? ""}
				onChange={(event) => onChange(emptyToUndefined(event.target.value))}
				aria-invalid={value && !cssWeight(value) ? true : undefined}
				className={inputClass}
			>
				<option value="">
					{inherited ? i18n._("Default ({value})", { value: inherited }) : i18n._("Default")}
				</option>
				{options.map(([option, text]) => (
					<option key={option} value={option}>
						{text}
					</option>
				))}
			</select>
		</div>
	);
}

export function LineHeightField({
	label,
	value,
	onChange,
	tokens,
	inherited,
}: {
	label: string;
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	tokens: readonly string[];
	inherited?: string;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const messages = useMessages();
	const id = React.useId();
	const problem = value?.trim() && !cssLineHeight(value) ? messages.invalid : null;
	const unknown = unknownToken(value, tokens);
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-xs text-kumo-subtle">
				{label}
			</label>
			<div className="flex items-center gap-1">
				<input
					id={id}
					type="text"
					inputMode="decimal"
					list={`${id}-tokens`}
					value={value ?? ""}
					placeholder={inherited ?? "1.5"}
					onChange={(event) => onChange(emptyToUndefined(event.target.value))}
					aria-invalid={problem ? true : undefined}
					aria-describedby={`${id}-help`}
					className={inputClass}
				/>
				{value ? <ClearButton label={label} onClear={() => onChange(undefined)} /> : null}
			</div>
			<span id={`${id}-help`} className="text-xs text-kumo-subtle">
				{i18n._("A plain number scales with the font size (1.5 = 150%).")}
			</span>
			<TokenList id={`${id}-tokens`} names={tokensOf(tokens, "lineHeight")} />
			<Hint text={problem} tone="danger" />
			<Hint text={unknown && messages.unknown(unknown)} tone="warning" />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Integer (z-index)
// ---------------------------------------------------------------------------

export function IntegerField({
	label,
	value,
	onChange,
	placeholder,
}: {
	label: string;
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	placeholder?: string;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const id = React.useId();
	const problem = value?.trim() && !cssZIndex(value) ? i18n._("A whole number, like 10 or -1.") : null;
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-xs text-kumo-subtle">
				{label}
			</label>
			<input
				id={id}
				type="number"
				step={1}
				value={value ?? ""}
				placeholder={placeholder}
				onChange={(event) => onChange(emptyToUndefined(event.target.value))}
				aria-invalid={problem ? true : undefined}
				className={inputClass}
			/>
			<Hint text={problem} tone="danger" />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Box shadow
// ---------------------------------------------------------------------------

interface ShadowParts {
	inset: boolean;
	x: string;
	y: string;
	blur: string;
	spread: string;
	color: string;
}

/** One layer `[inset] x y blur spread color` with px numbers → parts; else null. */
function parseShadow(value: string | undefined): ShadowParts | null {
	if (!value?.trim()) return { inset: false, x: "0", y: "4", blur: "12", spread: "0", color: "rgba(0,0,0,.15)" };
	const match = /^(inset\s+)?(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(.+)$/.exec(
		value.trim(),
	);
	if (!match || !cssColor(match[6]!)) return null;
	return { inset: !!match[1], x: match[2]!, y: match[3]!, blur: match[4]!, spread: match[5]!, color: match[6]! };
}

function composeShadow(parts: ShadowParts): string {
	return `${parts.inset ? "inset " : ""}${parts.x || 0}px ${parts.y || 0}px ${parts.blur || 0}px ${parts.spread || 0}px ${parts.color || "rgba(0,0,0,.15)"}`;
}

export function ShadowField({
	label,
	value,
	onChange,
	tokens,
	inherited,
}: {
	label: string;
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	tokens: readonly string[];
	inherited?: string;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const messages = useMessages();
	const id = React.useId();
	const presets = tokensOf(tokens, "shadow").map((name) => `var(${name})`);
	const parsed = parseShadow(value);
	// Mode: a preset (none / token), the builder (one layer), or raw CSS.
	const initialMode = !value
		? "default"
		: value === "none" || presets.includes(value) || /^var\(/.test(value)
			? "preset"
			: parsed
				? "builder"
				: "raw";
	const [mode, setMode] = React.useState<"default" | "preset" | "builder" | "raw">(initialMode);
	const problem = value?.trim() && !cssShadow(value) ? messages.invalid : null;
	const unknown = unknownToken(value, tokens);
	const parts = parsed ?? parseShadow(undefined)!;
	const setPart = (patch: Partial<ShadowParts>) => onChange(composeShadow({ ...parts, ...patch }));

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-1">
				<label htmlFor={id} className="text-xs text-kumo-subtle">
					{label}
				</label>
				<select
					id={id}
					value={mode === "preset" ? (value ?? "") : mode}
					onChange={(event) => {
						const next = event.target.value;
						if (next === "default") {
							setMode("default");
							onChange(undefined);
						} else if (next === "builder") {
							setMode("builder");
							onChange(composeShadow(parts));
						} else if (next === "raw") {
							setMode("raw");
						} else {
							setMode("preset");
							onChange(next);
						}
					}}
					className="ms-auto rounded border border-kumo-line bg-kumo-control px-1 text-xs text-kumo-subtle"
				>
					<option value="default">
						{inherited ? i18n._("Default ({value})", { value: inherited }) : i18n._("Default")}
					</option>
					<option value="none">{i18n._("None")}</option>
					{presets.map((preset) => (
						<option key={preset} value={preset}>
							{preset.slice(4, -1)}
						</option>
					))}
					<option value="builder">{i18n._("Custom")}</option>
					<option value="raw">{i18n._("CSS (several layers)")}</option>
				</select>
			</div>

			{mode === "builder" ? (
				<div className="flex flex-col gap-2 rounded border border-kumo-line p-2">
					<div className="gap-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
						{(
							[
								["x", i18n._("X")],
								["y", i18n._("Y")],
								["blur", i18n._("Blur")],
								["spread", i18n._("Spread")],
							] as const
						).map(([part, name]) => (
							<label key={part} className="flex flex-col items-center gap-1 text-xs text-kumo-subtle">
								<input
									type="number"
									min={part === "blur" ? 0 : undefined}
									value={parts[part]}
									aria-label={`${label} ${name} (px)`}
									onChange={(event) => setPart({ [part]: event.target.value })}
									className={inputClass}
								/>
								{name}
							</label>
						))}
					</div>
					<ColorField
						label={i18n._("Shadow color")}
						value={parts.color}
						tokens={tokens}
						onChange={(color) => setPart({ color: color ?? "rgba(0,0,0,.15)" })}
					/>
					<label className="flex items-center gap-2 text-xs text-kumo-default">
						<input type="checkbox" checked={parts.inset} onChange={(event) => setPart({ inset: event.target.checked })} />
						{i18n._("Inner shadow (inset)")}
					</label>
				</div>
			) : null}

			{mode === "raw" ? (
				<input
					type="text"
					aria-label={i18n._("{field} CSS", { field: label })}
					value={value ?? ""}
					placeholder="0 1px 2px rgba(0,0,0,.1), 0 8px 24px rgba(0,0,0,.12)"
					onChange={(event) => onChange(emptyToUndefined(event.target.value))}
					aria-invalid={problem ? true : undefined}
					className={inputClass}
				/>
			) : null}
			<Hint text={problem} tone="danger" />
			<Hint text={unknown && messages.unknown(unknown)} tone="warning" />
		</div>
	);
}
