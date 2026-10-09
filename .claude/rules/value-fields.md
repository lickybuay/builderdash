---
paths:
  - "src/editor/inspector/**"
  - "src/schema/**"
  - "src/render/**"
  - "src/editor/canvas/**"
---

# Value fields (non-color)

Colors follow `color-fields.md`. Every other value field follows the rule for
its kind below, modelled on Elementor's controls (Slider, Dimensions,
Typography and Box Shadow groups, the "custom" unit). No value field is a bare
text input with a placeholder.

## Common to every kind

- **Stored as a CSS string** (`"24px"`, `"var(--spacing-lg)"`), as today. The
  control splits it for editing and composes it back.
- **Empty = unset.** Clearing removes the declaration (send `undefined`); it is
  never written as `0`, `""` inside a nested object, or a default.
- **Theme tokens:** the field suggests only tokens of its kind from the site's
  theme (`--spacing-*`, `--font-size-*`, `--radius-*`, `--shadow-*`,
  `--font-weight-*`…, read from the live preview), inserted as `var(--x)`. A
  `var(--…)` the theme does not declare shows a warning.
- **Validated before CSS**, with the shared validators in
  `src/render/styles.ts`, in `generateCss`, inline styles
  and the canvas projection. A value that fails is dropped, never written. The
  editor shows the same validation inline, so what you type is what renders.
- **Responsive:** on tablet/mobile, a field with no own value shows the value it
  inherits (from the wider breakpoint) as ghost/placeholder text, never as a
  real value. Reset clears the current breakpoint only.

## Length (width, max-width, height, font size, letter spacing, border width, radius)

- Number input + unit select. Units per property: `px, %, em, rem, vw, vh`
  plus **`custom`**; font size has no `%`; border width is `px, em, rem`.
- **`custom`** unit = free text for `auto`, `fit-content`, `calc()`, `min()`,
  `max()`, `clamp()` and `var(--token)`. Validated: whitelisted functions,
  balanced parentheses, no `;`, `{`, `}`, `url(`, `<`, quotes.
- A bare number gets the property's default unit (`px`); `0` stays `0`.
- Changing the unit keeps the number (16px → 16rem); it does not convert.
- Negatives only where CSS allows them meaningfully: margin, letter spacing.
  Never for padding, width, height, border width or radius.

## Spacing box (margin, padding)

- Four sides (top, right, bottom, left), one shared unit select, and a link
  toggle. Linked: editing one side writes all four. Unlinking keeps each side's
  value.
- Each side follows the Length rule (custom unit and tokens included). Empty
  sides stay unset. Negatives: margin only.

## Unitless number (line height, opacity)

- Number input with step. Line height accepts a unitless number (preferred: it
  scales with the font) or a length; `auto`/`normal` only as explicit options.
- Opacity: 0–1 (UI may show 0–100%).

## Enum (font weight, text align, container direction…)

- Segmented buttons or a select, always with a "Default" (unset) choice. No
  free text.
- Font weight: `100`–`900` in steps of 100, labelled (Thin … Black), plus theme
  `--font-weight-*` tokens if declared.
- Text align: left, center, right, justify (start/end when RTL matters).

## Integer (z-index)

- Integer input, negatives allowed, `auto` as the empty/default. Decimals are
  rejected with a message.

## Box shadow

- Popover/group: color (a `ColorField`), horizontal, vertical, blur (≥ 0),
  spread, and an inset/outset toggle, each part following its own rule.
- Theme `--shadow-*` tokens and `none` as presets. A raw-CSS mode (custom) for
  multiple layers, validated like the custom unit.

## Identifiers (CSS ID, CSS classes)

- Text input validated as CSS identifiers (`CSS_IDENT`), with the invalid
  names listed under the field. Never interpolated without that check.
