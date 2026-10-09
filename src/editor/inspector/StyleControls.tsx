/**
 * Styling and Extra tabs of the Inspector.
 *
 * Styling edits the node's styles for the device selected in the top bar
 * (desktop / tablet / mobile); Extra edits settings that do not vary per
 * device. Each value kind has its own control (`ValueFields.tsx`), validated
 * with the CSS generator's own validators (`render/styles.ts`); the site's
 * design tokens are offered as suggestions, like Elementor's global values.
 */

import * as React from "react";
import { useLingui } from "@lingui/react";

import { CSS_IDENT, TEXT_STYLED_TYPES } from "../../render/styles";
import {
	BoxField,
	ColorField,
	inputClass,
	IntegerField,
	LengthField,
	LineHeightField,
	ShadowField,
	WeightField,
} from "./ValueFields";
import type { AdvancedValues, Breakpoint, BuilderNode, SpacingValue, StyleValues } from "../store/tree";

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

	// What a narrower device inherits from the wider ones (shown as placeholder
	// text, never as its own value): tablet from desktop, mobile from both.
	const wider: StyleValues[] = (
		breakpoint === "desktop" ? [] : breakpoint === "tablet" ? [node.style.desktop] : [node.style.desktop, node.style.tablet]
	).filter((set): set is StyleValues => !!set);
	const inherit = (read: (set: StyleValues) => string | undefined): string | undefined => {
		for (let i = wider.length - 1; i >= 0; i--) {
			const found = read(wider[i]!);
			if (found?.trim()) return found;
		}
		return undefined;
	};
	const inheritSides = (read: (set: StyleValues) => SpacingValue | undefined): SpacingValue => ({
		t: inherit((set) => read(set)?.t),
		r: inherit((set) => read(set)?.r),
		b: inherit((set) => read(set)?.b),
		l: inherit((set) => read(set)?.l),
	});

	return (
		<div className="flex flex-col gap-3 px-3 py-3">
			<p className="text-xs text-kumo-subtle">
				{i18n._("Editing the {device} styles. Switch the device in the top bar.", { device })}
				{breakpoint !== "desktop" ? ` ${i18n._("Grey values are inherited from wider devices.")}` : ""}
			</p>

			<Section title={i18n._("Layout")}>
				<BoxField
					label={i18n._("Margin")}
					negative
					tokens={tokens}
					value={style.margin}
					inherited={inheritSides((set) => set.margin)}
					onChange={(margin) => onChange({ margin })}
				/>
				<BoxField
					label={i18n._("Padding")}
					tokens={tokens}
					value={style.padding}
					inherited={inheritSides((set) => set.padding)}
					onChange={(padding) => onChange({ padding })}
				/>
				<LengthField
					label={i18n._("Width")}
					tokens={tokens}
					tokenKind="space"
					value={style.size?.width}
					inherited={inherit((set) => set.size?.width)}
					onChange={(width) => onChange({ size: { ...style.size, width } })}
				/>
				<LengthField
					label={i18n._("Max width")}
					tokens={tokens}
					tokenKind="space"
					value={style.size?.maxWidth}
					inherited={inherit((set) => set.size?.maxWidth)}
					onChange={(maxWidth) => onChange({ size: { ...style.size, maxWidth } })}
				/>
				<LengthField
					label={i18n._("Min height")}
					tokens={tokens}
					tokenKind="space"
					units={["px", "vh", "%", "em", "rem", "custom"]}
					value={style.size?.height}
					inherited={inherit((set) => set.size?.height)}
					onChange={(height) => onChange({ size: { ...style.size, height } })}
				/>
				<div className="flex flex-col gap-1">
					<span className="text-xs text-kumo-subtle">{i18n._("Alignment")}</span>
					<div role="radiogroup" aria-label={i18n._("Alignment")} className="flex gap-1">
						{(["left", "center", "right", "justify"] as const).map((align) => {
							const active = (style.typography?.align ?? inherit((set) => set.typography?.align)) === align;
							const own = style.typography?.align === align;
							return (
								<button
									key={align}
									type="button"
									role="radio"
									aria-checked={own}
									onClick={() =>
										onChange({
											typography: { ...style.typography, align: own ? undefined : align },
										})
									}
									className={[
										"flex-1 rounded border border-kumo-line px-2 py-1 text-xs",
										own
											? "bg-kumo-tint text-kumo-strong"
											: active
												? "border-dashed text-kumo-default"
												: "text-kumo-subtle hover:bg-kumo-tint",
									].join(" ")}
								>
									{align}
								</button>
							);
						})}
					</div>
				</div>
			</Section>

			<Section title={i18n._("Background")}>
				<ColorField
					label={i18n._("Background color")}
					tokens={tokens}
					value={style.background}
					inherited={inherit((set) => set.background)}
					onChange={(background) => onChange({ background })}
				/>
			</Section>

			<Section title={i18n._("Border")}>
				<LengthField
					label={i18n._("Width")}
					tokens={tokens}
					units={["px", "em", "rem", "custom"]}
					value={style.border?.width}
					inherited={inherit((set) => set.border?.width)}
					onChange={(width) => onChange({ border: { ...style.border, width } })}
				/>
				<LengthField
					label={i18n._("Radius")}
					tokens={tokens}
					tokenKind="radius"
					units={["px", "%", "em", "rem", "custom"]}
					value={style.border?.radius}
					inherited={inherit((set) => set.border?.radius)}
					onChange={(radius) => onChange({ border: { ...style.border, radius } })}
				/>
				<ColorField
					label={i18n._("Color")}
					tokens={tokens}
					value={style.border?.color}
					inherited={inherit((set) => set.border?.color)}
					onChange={(color) => onChange({ border: { ...style.border, color } })}
				/>
				<ShadowField
					label={i18n._("Shadow")}
					tokens={tokens}
					value={style.shadow}
					inherited={inherit((set) => set.shadow)}
					onChange={(shadow) => onChange({ shadow })}
				/>
			</Section>

			{textStyled && (
				<Section title={i18n._("Typography")}>
					<ColorField
						label={i18n._("Text color")}
						tokens={tokens}
						value={style.color}
						inherited={inherit((set) => set.color)}
						onChange={(color) => onChange({ color })}
					/>
					<LengthField
						label={i18n._("Size")}
						tokens={tokens}
						tokenKind="fontSize"
						units={["px", "em", "rem", "vw", "custom"]}
						value={style.typography?.size}
						inherited={inherit((set) => set.typography?.size)}
						onChange={(size) => onChange({ typography: { ...style.typography, size } })}
					/>
					<WeightField
						label={i18n._("Weight")}
						tokens={tokens}
						value={style.typography?.weight}
						inherited={inherit((set) => set.typography?.weight)}
						onChange={(weight) => onChange({ typography: { ...style.typography, weight } })}
					/>
					<LineHeightField
						label={i18n._("Line height")}
						tokens={tokens}
						value={style.typography?.lineHeight}
						inherited={inherit((set) => set.typography?.lineHeight)}
						onChange={(lineHeight) => onChange({ typography: { ...style.typography, lineHeight } })}
					/>
					<LengthField
						label={i18n._("Letter spacing")}
						tokens={tokens}
						negative
						units={["px", "em", "rem", "custom"]}
						value={style.typography?.letterSpacing}
						inherited={inherit((set) => set.typography?.letterSpacing)}
						onChange={(letterSpacing) => onChange({ typography: { ...style.typography, letterSpacing } })}
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
				<IntegerField
					label={i18n._("Z-index")}
					placeholder="auto"
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
