# 04 — Visual guide: replicating EmDash's visual language

The builder **has no design of its own**. It inherits that of the EmDash admin, which is
**Kumo**, Cloudflare's component library. This guide is what must be
respected so that it does not clash.

Everything written here is verified against `@emdash-cms/admin@1.0.1`,
`@cloudflare/kumo@2.6.0` and the `emdash@1.0.1` code.

---

## 1. The three rules

1. **Use Kumo components, not hand-styled HTML.** If a Kumo component exists
   for something, use it. The whole admin is built that way.
2. **Use tokens, never literal colors.** No `#fff` or `rgb(...)`. Always
   `var(--color-kumo-*)`.
3. **Respect dark mode and RTL from day one.** The admin already ships both;
   a plugin that does not follow them looks broken to half the users.

---

## 2. Available Kumo components

They are all in `@cloudflare/kumo` (importable by subpath, e.g.
`@cloudflare/kumo/components/button`):

```
autocomplete   badge      banner     breadcrumbs  button       chart
checkbox       clipboard-text        code         collapsible  combobox
command-palette           date-picker              date-range-picker
dialog         dropdown   empty      field        flow         grid
input          input-group           label        layer-card   link
loader         menubar    meter      pagination   popover      radio
select         sensitive-input       sidebar      surface      switch
table          table-of-contents     tabs         text         toast
toolbar        tooltip
```

Mapping to the builder's layout:

| Builder area | Kumo component |
| --- | --- |
| Top bar | `toolbar`, `breadcrumbs`, `button`, `badge` |
| Left panel | `sidebar`, `input` (search), `collapsible`, `layer-card` |
| Device selector | `tabs` or `toolbar` with buttons |
| Canvas | `surface` for the canvas background |
| Inspector | `tabs`, `field`, `input`, `select`, `switch`, `collapsible` |
| Empty state | `empty` |
| Confirmations | `dialog` |
| Notices | `banner`, `toast` |
| Image selection | The admin's media picker (`MediaPickerModal`) |

### Reusable EmDash components

`@emdash-cms/admin` exports already-integrated pieces that are worth using:

| Export | What for |
| --- | --- |
| `EditorHeader` | Header with `leading` and `actions` aligned like the rest of the editor |
| `Shell` | Admin layout with the Kumo sidebar |
| `SaveButton` | Save button with its states |
| `cn` | Class helper (same one the admin itself uses) |
| `apiFetch` | API requests with the CSRF header the admin requires |
| `parseApiResponse` | Read responses with uniform error handling |
| `useLocale` | The admin's active locale, for i18n |
| `useNavigate`, `useParams` | The admin router's navigation |

---

## 3. Color tokens

The admin theme is `data-theme="classic"` with `data-mode` set to `light` or `dark`
by a script on `<html>`. You never need to query the mode: **the tokens
already switch on their own**.

### Surfaces

| Token | Use |
| --- | --- |
| `--color-kumo-canvas` | Outermost application background |
| `--color-kumo-base` | Background of surfaces, cards, rows |
| `--color-kumo-elevated` | `<body>` background; elevated surface |
| `--color-kumo-recessed` | Recessed area, well |
| `--color-kumo-overlay` | Modals, popovers, dialogs |
| `--color-kumo-control` | Background of inputs and buttons |
| `--color-kumo-tint` | Subtle tint for alternating rows or soft highlights |
| `--color-kumo-fill` | Fill for active states and tracks |
| `--color-kumo-fill-hover` | Fill on hover |

For the builder this translates to:

- **Canvas background:** `--color-kumo-canvas` (the well where the page lives).
- **Page canvas (the "paper"):** `--color-kumo-base`.
- **Left panel and inspector:** `--color-kumo-base` over `--color-kumo-elevated`.
- **Selected node:** `--color-kumo-tint` or `--color-kumo-info-tint`.
- **Active drop zone:** `--color-kumo-brand`.

### Lines and borders

| Token | Use |
| --- | --- |
| `--color-kumo-line` | Standard separation border |
| `--color-kumo-hairline` | Very thin border |
| `--color-kumo-interact` | Background on interaction / hover of elements |

Note: `* { border-color: var(--color-kumo-line) }` is already applied globally, so
a `border` with no explicit color already comes out right.

### Brand and semantics

| Token | Use |
| --- | --- |
| `--color-kumo-brand` | Brand color; selection, focus, primary action |
| `--color-kumo-brand-hover` | Brand on hover |
| `--color-kumo-focus` | Focus ring |
| `--color-kumo-success` / `--color-kumo-success-tint` | Success |
| `--color-kumo-warning` / `--color-kumo-warning-tint` | Warning |
| `--color-kumo-danger` / `--color-kumo-danger-tint` | Error, destructive action |
| `--color-kumo-info` / `--color-kumo-info-tint` | Information |
| `--color-kumo-contrast` | Maximum contrast |

**Builder rule:** the brand color is reserved for **one thing at a time**.
In Milestone 1 it is the **active drop zone** and the **selection outline**. If it is also
used on buttons, badges and links, it stops signaling anything.

### Text

| Token | Use |
| --- | --- |
| `--text-color-kumo-default` | Normal text |
| `--text-color-kumo-strong` | Emphasized text, titles |
| `--text-color-kumo-subtle` | Secondary text, hints |
| `--text-color-kumo-inactive` | Disabled, real placeholder |
| `--text-color-kumo-placeholder` | Input placeholder |
| `--text-color-kumo-link` | Links |
| `--text-color-kumo-inverse` | Text on an inverted background |
| `--text-color-kumo-brand` | Brand text |

### Neutral scale

`--color-kumo-neutral-{25,50,75,125,150,750,800,925,950,975,1000}` — for one-off
cases the semantic scale does not cover. **Always prefer the semantic
tokens.**

### Shadows

`--color-kumo-shadow-edge`, `--color-kumo-shadow-drop`, `--color-kumo-tip-shadow`,
`--color-kumo-tip-stroke`. For the elevated canvas and the inspector's popovers.

---

## 4. Typography

- Font: `var(--font-emdash)`, which EmDash injects as **Noto Sans** (variable weight
  100–900, with multi-script coverage) plus system fallbacks.
- **There is no theme monospace font**; if one is needed, `var(--font-mono)`.
- The admin uses a global `font-smoothing: antialiased`.

Scale observed in the admin: `text-sm` (`.875rem`) for labels and hints,
`text-base` (1rem) for body, `text-2xl` with `font-semibold` for page titles
(see `EditorHeader`). Tabular numbers where appropriate
(`font-variant-numeric: tabular-nums`).

---

## 5. Motion

The admin is **sober**: ~150 ms transitions for color, border and shadow. There are already
utilities and keyframes available, directly reusable:

| Class / keyframe | Behavior |
| --- | --- |
| `.animate-bounce-in` | Bouncy entrance (400 ms, ease-out) |
| `.animate-refresh` | Continuous spin, for refreshes |
| `.skeleton` | Loading shimmer |
| `.t-text-swap` | Text change with blur and shift |
| `@keyframes shimmer` | Progress bar |

And variables: `--text-swap-dur`, `--text-swap-translate-y`, `--text-swap-blur`,
`--text-swap-ease`.

**Everything respects `@media (prefers-reduced-motion: reduce)`.** The builder's drag & drop and
node rendering must respect it too.

---

## 6. Dark mode

The admin sets `data-mode="dark"` on `<html>`. Since the tokens change via
`[data-mode=dark]`, **nothing special needs to be done** — as long as tokens are used.

Important pitfall: **inside the canvas's Shadow DOM the tokens are inherited** (custom
properties cross the shadow boundary), so the canvas follows dark mode
automatically. But Kumo styles applied globally do **not** enter
the shadow: whatever is needed must be ported explicitly.

---

## 7. RTL and accessibility

- `<html>` carries `dir` (`ltr` or `rtl`) resolved by the admin.
- Use **logical properties**: `margin-inline`, `padding-inline`, `inset-inline`,
  `border-inline-start`. **Never** `left`/`right` for layout.
- The admin uses `rtl:[&_svg]:-scale-x-100` to flip directional icons.
- Visible focus uses `--color-kumo-focus`. Do not remove the focus ring.
- Drag & drop must have a **keyboard alternative**. It is a requirement, not an
  extra: a builder without keyboard support is unusable for many people.
- Respect touch target sizes: the admin applies `pointer-coarse:h-11 w-11` (44 px)
  on coarse pointers.

---

## 7b. Icons and classes

### Icons

Every editor icon is an **inline stroke SVG**, never an emoji or a
Unicode character (🗑, ⧉, ⊞…):

```tsx
<button
  type="button"
  title={label}
  aria-label={label}
  className="flex items-center justify-center rounded px-1 py-1 text-kumo-subtle hover:bg-kumo-tint"
>
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    …
  </svg>
</button>
```

- 16 × 16, stroke of 2, `currentColor`: the color comes from the text token
  (`text-kumo-subtle`; destructive actions `text-kumo-danger`).
- Always `title` + `aria-label` on the button and `aria-hidden` on the SVG.
- Panel toggles: a rectangle with a dividing line. Left panel,
  divider at `x=9`; right panel (Structure), mirrored, `x=15`. With the panel
  open, two short marks are drawn inside.

### Tailwind classes

The plugin has no Tailwind build of its own: **only the classes that already
exist in the admin's compiled CSS work** (`@emdash-cms/admin/dist/styles.css`).
A class that does not exist fails silently (for example `hover:text-kumo-strong`
or `max-h-32`). Before using a new class, look it up in that file; if it is
not there, use inline `style`.

---

## 8. How the plugin is registered in the admin

```ts
// src/index.ts — descriptor (build time)
export function builderdashPlugin(): PluginDescriptor {
  return {
    id: "builderdash",
    version: "0.1.0",
    format: "native",
    entrypoint: "@lickybuay/builderdash",
    adminEntry: "@lickybuay/builderdash/admin",
    componentsEntry: "@lickybuay/builderdash/astro",
  };
}

// src/index.ts — runtime
export function createPlugin() {
  return definePlugin({
    id: "builderdash",
    version: "0.1.0",
    admin: {
      entry: "@lickybuay/builderdash/admin",
      // No `pages`: the builder is opened per entry from the content
      // list, not from the side menu.
    },
  });
}
```

```tsx
// src/admin/index.tsx
export const pages: PluginAdminModule["pages"] = {
  "/builder": BuilderPage,
};
```

The page ends up mounted at `/_emdash/admin/plugins/builderdash/builder` even though it does not
appear in `admin.pages`: the route comes from the admin module's `pages` map.

---

## 9. What NOT to do

- ❌ Do not use literal colors (`#6366f1`, `rgb()`, `oklch()`).
- ❌ Do not import Tailwind or set up a parallel styling system. Kumo is already there.
- ❌ Do not use `left` / `right` / `margin-left` for layout.
- ❌ Do not assume light mode.
- ❌ Do not remove the focus ring.
- ❌ Do not invent a visual language of your own for the builder: if it clashes with the
  rest of the admin, it is wrong.
- ❌ Do not touch the site's `tokens.css` or `Base.astro` for visual tweaks to the admin.
- ❌ Do not use emoji or Unicode characters as icons (see 7b).
- ❌ Do not use a Tailwind class without checking that it exists in the admin's CSS.
