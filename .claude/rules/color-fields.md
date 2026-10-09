---
paths:
  - "src/editor/inspector/**"
  - "src/schema/**"
  - "src/render/**"
  - "src/editor/canvas/**"
---

# Color fields

Every field that holds a color — on any element, in any Inspector tab (General
props of `type: "color"`, Styling background / border / text color, and any new
one) — follows these rules. No color field is a bare text input or a bare
`<input type="color">`.

## Editing

- Use the shared `ColorField` (`src/editor/inspector/ValueFields.tsx`).
  It gives: a swatch that opens the native color picker, a free-text input, and
  a clear (×) button.
- The text input accepts every format the validator accepts:
  - hex: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
  - `rgb()` / `rgba()` / `hsl()` / `hsla()`
  - `transparent`, `currentColor`
  - a theme token: `var(--color-brand)`
- Tokens are suggested from the site's theme (the `--color-*` custom
  properties read from the live preview), via a datalist the field renders
  itself. A `var(--…)` that the theme does not declare shows a warning; it is
  not silently accepted as if it existed.
- The swatch previews literal colors only. For a token, `rgb()`/`hsl()` or hex
  with alpha it shows a neutral swatch, and the value is overwritten only when
  the user actually picks a color: the native picker is `#rrggbb` only and
  would drop alpha.
- Empty means "no color": clearing sends `undefined`, never `#000000` or `""`
  left inside a nested style object.

## Rendering

- Every color value is validated with the shared validator in
  `src/render/styles.ts` (hex / rgb(a) / hsl(a) /
  transparent / currentColor / `var(--token)`) before it reaches CSS — in
  `generateCss`, in `BuilderNode.astro` inline styles and in the canvas
  projection (`live-dom.ts`). A value that fails is dropped, never written.
- Never interpolate a stored color into a `style` attribute or CSS text
  without that validator: free text there is CSS injection.
