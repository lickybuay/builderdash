/**
 * Styling and Extra tabs of the Inspector.
 *
 * Styling edits the node's styles for the device selected in the top bar
 * (desktop / tablet / mobile); Extra edits settings that do not vary per
 * device. Values are free text validated by the CSS generator
 * (`render/styles.ts`); the site's design tokens are offered as suggestions,
 * like Elementor's global values.
 */

import * as React from "react";
import { useLingui } from "@lingui/react";

import { CSS_IDENT, TEXT_STYLED_TYPES } from "../../render/styles";
import type { AdvancedValues, Breakpoint, BuilderNode, SpacingValue, StyleValues } from "../store/tree";

const inputClass =
	"w-full rounded border border-kumo-line bg-kumo-control px-2 py-1.5 text-xs text-kumo-default";

/** Datalists of token suggestions, by kind, rendered once per tab. */
function TokenLists({ tokens }: { tokens: string[] }): React.JSX.Element {
	const group = (prefix: string) => tokens.filter((name) => name.startsWith(prefix));
	const list = (id: string, names: string[]) => (
		<datalist id={id}>
			{names.map((name) => (
				<option key={name} value={`var(${name})`} />
			))}
		</datalist>
	);
	return (
		<>
			{list("bd-tokens-color", group("--color-"))}
			{list("bd-tokens-space", [...group("--spacing-"), ...group("--max-width"), ...group("--wide-width")])}
			{list("bd-tokens-font", group("--font-size-"))}
			{list("bd-tokens-radius", group("--radius"))}
			{list("bd-tokens-shadow", group("--shadow"))}
		</>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
	return (
		<section className="flex flex-col gap-2 border-b border-kumo-line pb-3">
			<h3 className="text-xs font-semibold text-kumo-strong">{title}</h3>
			{children}
		</section>
	);
}

function TextField({
	label,
	value,
	onChange,
	list,
	placeholder,
	invalid,
}: {
	label: string;
	value: string | undefined;
	onChange: (value: string) => void;
	list?: string;
	placeholder?: string;
	invalid?: string | null;
}): React.JSX.Element {
	const id = React.useId();
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-xs text-kumo-subtle">
				{label}
			</label>
			<input
				id={id}
				type="text"
				list={list}
				placeholder={placeholder}
				value={value ?? ""}
				onChange={(event) => onChange(event.target.value)}
				aria-invalid={invalid ? true : undefined}
				className={inputClass}
			/>
			{invalid && <span className="text-xs text-kumo-danger">{invalid}</span>}
		</div>
	);
}

const UNITS = ["px", "%", "em", "rem", "vw", "vh"] as const;
type Unit = (typeof UNITS)[number];
const NUMBER_WITH_UNIT = /^(-?\d+(?:\.\d+)?)(px|%|em|rem|vw|vh)?$/;

/** "24px" → { num: "24", unit: "px" }; a token or free text → null. */
function splitLength(value: string | undefined): { num: string; unit: Unit | null } | null {
	const match = value?.trim().match(NUMBER_WITH_UNIT);
	return match ? { num: match[1]!, unit: (match[2] as Unit | undefined) ?? null } : null;
}

/** The unit shown for a set of values: the first one that declares it, else px. */
function unitOf(values: Array<string | undefined>): Unit {
	for (const value of values) {
		const unit = splitLength(value)?.unit;
		if (unit) return unit;
	}
	return "px";
}

/** What the input shows: the number alone, or the raw text (a token). */
const display = (value: string | undefined) => splitLength(value)?.num ?? value ?? "";

/** What is stored: a number gets the unit; empty clears; anything else as typed. */
function compose(input: string, unit: Unit): string {
	const trimmed = input.trim();
	if (trimmed === "") return "";
	return /^-?\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}${unit}` : trimmed;
}

/** The unit dropdown shown beside a field's title, as in Elementor. */
function UnitSelect({
	value,
	onChange,
	label,
}: {
	value: Unit;
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
			{UNITS.map((unit) => (
				<option key={unit} value={unit}>
					{unit}
				</option>
			))}
		</select>
	);
}

/** A single length with its unit beside the title (width, radius, size…). */
function LengthField({
	label,
	value,
	onChange,
	list,
}: {
	label: string;
	value: string | undefined;
	onChange: (value: string) => void;
	list?: string;
}): React.JSX.Element {
	const id = React.useId();
	const [unit, setUnit] = React.useState<Unit>(() => unitOf([value]));
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center">
				<label htmlFor={id} className="text-xs text-kumo-subtle">
					{label}
				</label>
				<UnitSelect
					label={label}
					value={unit}
					onChange={(next) => {
						setUnit(next);
						const parts = splitLength(value);
						if (parts) onChange(`${parts.num}${next}`);
					}}
				/>
			</div>
			<input
				id={id}
				type="text"
				list={list}
				value={display(value)}
				onChange={(event) => onChange(compose(event.target.value, unit))}
				className={inputClass}
			/>
		</div>
	);
}

/** Four sides (top, right, bottom, left), optionally linked. */
function BoxField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: SpacingValue | undefined;
	onChange: (value: SpacingValue) => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const [linked, setLinked] = React.useState(false);
	const [unit, setUnit] = React.useState<Unit>(() =>
		unitOf([value?.t, value?.r, value?.b, value?.l]),
	);
	const sides = [
		["t", i18n._("Top")],
		["r", i18n._("Right")],
		["b", i18n._("Bottom")],
		["l", i18n._("Left")],
	] as const;
	const set = (side: keyof SpacingValue, input: string) => {
		const next = compose(input, unit);
		onChange(linked ? { t: next, r: next, b: next, l: next } : { ...value, [side]: next });
	};
	// Changing the unit re-applies it to every side that holds a number.
	const changeUnit = (next: Unit) => {
		setUnit(next);
		const converted: SpacingValue = { ...value };
		for (const side of ["t", "r", "b", "l"] as const) {
			const parts = splitLength(value?.[side]);
			if (parts) converted[side] = `${parts.num}${next}`;
		}
		onChange(converted);
	};
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center">
				<span className="text-xs text-kumo-subtle">{label}</span>
				<UnitSelect label={label} value={unit} onChange={changeUnit} />
			</div>
			<div className="flex items-end gap-1">
				{sides.map(([side, name]) => (
					<label key={side} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-xs text-kumo-subtle">
						<input
							type="text"
							list="bd-tokens-space"
							aria-label={`${label} ${name}`}
							value={display(value?.[side])}
							onChange={(event) => set(side, event.target.value)}
							className={inputClass}
						/>
						{name}
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
		</div>
	);
}

export function StylingTab({
	node,
	breakpoint,
	tokens,
	onChange,
}: {
	node: BuilderNode;
	breakpoint: Breakpoint;
	tokens: string[];
	onChange: (patch: Partial<StyleValues>) => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const style: StyleValues = node.style[breakpoint] ?? {};
	const device = { desktop: i18n._("Desktop"), tablet: i18n._("Tablet"), mobile: i18n._("Mobile") }[breakpoint];
	const textStyled = TEXT_STYLED_TYPES.has(node.type);

	return (
		<div className="flex flex-col gap-3 px-3 py-3">
			<TokenLists tokens={tokens} />
			<p className="text-xs text-kumo-subtle">
				{i18n._("Editing the {device} styles. Switch the device in the top bar.", { device })}
			</p>

			<Section title={i18n._("Layout")}>
				<BoxField label={i18n._("Margin")} value={style.margin} onChange={(margin) => onChange({ margin })} />
				<BoxField label={i18n._("Padding")} value={style.padding} onChange={(padding) => onChange({ padding })} />
				<LengthField
					label={i18n._("Width")}
					list="bd-tokens-space"
					value={style.size?.width}
					onChange={(width) => onChange({ size: { ...style.size, width } })}
				/>
				<LengthField
					label={i18n._("Max width")}
					list="bd-tokens-space"
					value={style.size?.maxWidth}
					onChange={(maxWidth) => onChange({ size: { ...style.size, maxWidth } })}
				/>
				<LengthField
					label={i18n._("Min height")}
					value={style.size?.height}
					onChange={(height) => onChange({ size: { ...style.size, height } })}
				/>
				<div className="flex flex-col gap-1">
					<span className="text-xs text-kumo-subtle">{i18n._("Alignment")}</span>
					<div role="radiogroup" aria-label={i18n._("Alignment")} className="flex gap-1">
						{(["left", "center", "right", "justify"] as const).map((align) => (
							<button
								key={align}
								type="button"
								role="radio"
								aria-checked={style.typography?.align === align}
								onClick={() =>
									onChange({
										typography: {
											...style.typography,
											align: style.typography?.align === align ? undefined : align,
										},
									})
								}
								className={[
									"flex-1 rounded border border-kumo-line px-2 py-1 text-xs",
									style.typography?.align === align ? "bg-kumo-tint text-kumo-strong" : "text-kumo-subtle hover:bg-kumo-tint",
								].join(" ")}
							>
								{align}
							</button>
						))}
					</div>
				</div>
			</Section>

			<Section title={i18n._("Background")}>
				<TextField
					label={i18n._("Background color")}
					list="bd-tokens-color"
					placeholder="#ffffff, var(--color-surface)"
					value={style.background}
					onChange={(background) => onChange({ background })}
				/>
			</Section>

			<Section title={i18n._("Border")}>
				<LengthField
					label={i18n._("Width")}
					value={style.border?.width}
					onChange={(width) => onChange({ border: { ...style.border, width } })}
				/>
				<LengthField
					label={i18n._("Radius")}
					list="bd-tokens-radius"
					value={style.border?.radius}
					onChange={(radius) => onChange({ border: { ...style.border, radius } })}
				/>
				<TextField
					label={i18n._("Color")}
					list="bd-tokens-color"
					value={style.border?.color}
					onChange={(color) => onChange({ border: { ...style.border, color } })}
				/>
				<TextField
					label={i18n._("Shadow")}
					list="bd-tokens-shadow"
					placeholder="none"
					value={style.shadow}
					onChange={(shadow) => onChange({ shadow })}
				/>
			</Section>

			{textStyled && (
				<Section title={i18n._("Typography")}>
					<TextField
						label={i18n._("Text color")}
						list="bd-tokens-color"
						value={style.color}
						onChange={(color) => onChange({ color })}
					/>
					<LengthField
						label={i18n._("Size")}
						list="bd-tokens-font"
						value={style.typography?.size}
						onChange={(size) => onChange({ typography: { ...style.typography, size } })}
					/>
					<TextField
						label={i18n._("Weight")}
						placeholder="400, 700"
						value={style.typography?.weight}
						onChange={(weight) => onChange({ typography: { ...style.typography, weight } })}
					/>
					<TextField
						label={i18n._("Line height")}
						placeholder="1.5"
						value={style.typography?.lineHeight}
						onChange={(lineHeight) => onChange({ typography: { ...style.typography, lineHeight } })}
					/>
					<LengthField
						label={i18n._("Letter spacing")}
						value={style.typography?.letterSpacing}
						onChange={(letterSpacing) =>
							onChange({ typography: { ...style.typography, letterSpacing } })
						}
					/>
				</Section>
			)}
		</div>
	);
}

export function ExtraTab({
	node,
	onChange,
}: {
	node: BuilderNode;
	onChange: (patch: Partial<AdvancedValues>) => void;
}): React.JSX.Element {
	const { i18n } = useLingui();
	const advanced: AdvancedValues = node.style.advanced ?? {};
	const badClasses = (advanced.cssClasses ?? "").split(/\s+/).filter((name) => name && !CSS_IDENT.test(name));
	const hide = advanced.hide ?? {};

	return (
		<div className="flex flex-col gap-3 px-3 py-3">
			<Section title={i18n._("Attributes")}>
				<TextField
					label={i18n._("CSS ID")}
					placeholder="my-section"
					value={advanced.cssId}
					onChange={(cssId) => onChange({ cssId })}
					invalid={
						advanced.cssId && !CSS_IDENT.test(advanced.cssId)
							? i18n._("Letters, digits, - and _; must start with a letter.")
							: null
					}
				/>
				<TextField
					label={i18n._("CSS classes")}
					placeholder="card highlighted"
					value={advanced.cssClasses}
					onChange={(cssClasses) => onChange({ cssClasses })}
					invalid={badClasses.length > 0 ? i18n._("Invalid: {names}", { names: badClasses.join(" ") }) : null}
				/>
				<TextField
					label={i18n._("Z-index")}
					placeholder="10"
					value={advanced.zIndex}
					onChange={(zIndex) => onChange({ zIndex })}
				/>
			</Section>

			<Section title={i18n._("Responsive")}>
				{(["desktop", "tablet", "mobile"] as const).map((device) => (
					<label key={device} className="flex items-center gap-2 text-xs text-kumo-default">
						<input
							type="checkbox"
							checked={hide[device] === true}
							onChange={(event) => onChange({ hide: { ...hide, [device]: event.target.checked || undefined } })}
						/>
						{
							{
								desktop: i18n._("Hide on desktop"),
								tablet: i18n._("Hide on tablet"),
								mobile: i18n._("Hide on mobile"),
							}[device]
						}
					</label>
				))}
				<p className="text-xs text-kumo-subtle">
					{i18n._("Hidden elements show faded in the editor so you can still select them.")}
				</p>
			</Section>
		</div>
	);
}
