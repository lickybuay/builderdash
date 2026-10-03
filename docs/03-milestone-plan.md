# 03 — Milestone plan

Three rules that make it possible to build this in parts without rewriting:

1. **Every milestone ends in something that can be opened and seen.** Never a
   milestone of pure invisible infrastructure.
2. **Data is saved from Milestone 1**, even if the editor is ugly. Without a store,
   everything after is throwaway prototypes.
3. **Public rendering is tested in Milestone 2, not in 7.** It is the wall that can
   invalidate the design; it has to be hit before investing in UI.

A separation that runs through the whole plan:

- **Builder shell** → the container (topbar, panel, canvas, inspector). It is
  built first and never touched again.
- **Widgets** → the shell's content. They are added one by one, forever.

If every new widget forces you to touch the shell, the shell is badly built.

---

## The target layout

```
┌─────────────────────────────────────────────────────────────┐
│  TOPBAR   [← Pages / Home]   [Desktop|Tablet|Mobile]   [Save]│
├──────────────┬────────────────────────────┬─────────────────┤
│   LEFT       │          CANVAS            │   INSPECTOR     │
│   PANEL      │      (the "board")         │   (right)       │
│              │                            │                 │
│  ┌────────┐  │   ┌──────────────────────┐ │  ┌───────────┐  │
│  │Heading │  │   │  ▸ Section 1         │ │  │ Content   │  │
│  │Text    │  │   │    ├ column          │ │  │ ───────── │  │
│  │Image   │  │   │    │  └ [Heading]    │ │  │ Style     │  │
│  │Button  │  │   │    └ column          │ │  │ ───────── │  │
│  │Divider │  │   │  ▸ Section 2         │ │  │ Advanced  │  │
│  └────────┘  │   └──────────────────────┘ │  └───────────┘  │
│  [widgets]   │   [drop zones + outline]   │  [properties]   │
└──────────────┴────────────────────────────┴─────────────────┘
```

---

## Milestone 0 — Native scaffolding · ~1 week · ✅ completed

**Goal:** exist inside the EmDash admin.

- Native scaffold: `PluginDescriptor` + `createPlugin()`, `adminEntry`,
  `componentsEntry`.
- `package.json` with exports `.` / `./admin` / `./astro` and peer deps (Kumo, Lingui,
  React, React Query, `@emdash-cms/admin`).
- Empty admin page that renders "Builder v0".
- Registration in the test site's `astro.config.mjs`.

**Done when:** `pnpm dev` loads the page without error, with Kumo, i18n and RTL.

**Risk:** low.

---

## Milestone 1 — The work environment · ~3 weeks · 🔄 in progress

**Goal:** the empty board with its structure and drag & drop working.

Visible deliverable:

- **Topbar:** breadcrumb + Desktop/Tablet/Mobile selector (no function yet) + Save.
- **Left panel:** list of widgets from the `schema/` registry.
- **Canvas:** Shadow DOM, empty state, sections/columns structure.
- **Right inspector:** three tabs, empty.
  Its first view is **Structure** (layer navigator, collapsible): tree,
  synchronized selection and reordering by drag. ✅ Session 7.

Functionality:

- Drag a widget from the panel to the canvas → **inserts a node into the tree**.
- Reorder sections by drag inside the canvas.
- Select a node → it is highlighted; the inspector shows its identity.
- **Save to the two layers** and reload without losing anything.

**Done when:** you drag 3 widgets, reorder, save, reload and the tree is the
same.

**Risk:** medium-high. Drag & drop inside a Shadow DOM nested in the admin
is the most delicate part of the project. It goes first for that reason.

Full detail in `05-milestone-1-setup.md`.

---

## Milestone 2 — Minimal public rendering · ~2 weeks

**Goal:** kill the most dangerous wall before investing in UI.

- Native `page:fragments`: reads the entry and returns the tree's HTML with basic
  inline styles.
- `<BuilderBlock>` Astro component for themes that want to mix the builder inside
  their own layout.
- Cache with the site's `cacheHint`.

**Done when:** a saved page with 3 widgets shows up on the public frontend,
without touching templates.

**Risk:** high. If this does not come out clean, the delivery has to be rethought.

---

## Milestone 3 — Real widget engine · ~3 weeks

- Widget registry with **full schema** (fields, types, defaults, validation).
- 4–5 base widgets: `heading`, `text`, `image`, `button`, `divider`.
- Data-driven left panel: search, categories, drag.
- **The "Content" inspector is generated from the widget's schema.** Key point: the
  form is not written, it is declared.

**Done when:** you add a heading, type the text in the inspector and it appears
in the canvas and on the public frontend.

**Risk:** medium. Generating forms from a schema is a huge multiplier from here on.

---

## Milestone 4 — Style inspector · ~4 weeks

**Goal:** the builder stops being mute.

- **Spacing**, **Typography**, **Color/Background**, **Border**, **Size** panels.
- Each control writes to layer 2, not to `props`.
- No responsive yet: a single breakpoint.
- **The CSS budget is set here** and the `style-engine` is implemented.

**Done when:** you change a section's padding and it shows in the canvas and on the
frontend.

**Risk:** high. This is where the price is paid for CSS not existing in the schema.

---

## Milestone 5 — Real responsive · ~4 weeks

- Per-breakpoint override with a desktop → tablet → mobile cascade.
- The canvas changes width and applies overrides.
- Badge on controls with an active override; reset button.

**Risk:** medium-high. The cascade is easy to implement and hard to make
feel right.

---

## Milestone 6 — Complete structure · ~3 weeks

- Sections with real columns (1/2/3/4), not hardcoded.
- Nestable containers, grid/flex, alignment.
- Floating handles on the canvas (move, duplicate, delete, save as template).

**Risk:** medium. Deep nesting multiplies drag & drop's edge cases.

---

## Milestone 7 — Sections and templates · ~2 weeks

- Reusable "Save section" across pages. EmDash already has first-class
  `sections`: use them.
- Full-page template library.

---

## Milestone 8 onward — Perpetual catalog

New widgets: video, icon, tabs, accordion, form, carousel, gallery, table…
**It never touches the shell.**

---

## Overall estimate

| Phase | Senior estimate |
| --- | --- |
| Milestones 0–1 (environment) | ~4 weeks |
| Milestones 2–3 (render + widgets) | ~5 weeks |
| Milestones 4–5 (styles + responsive) | ~8 weeks |
| Milestones 6–7 (structure + templates) | ~5 weeks |
| Catalog of 15–25 widgets | 8–12 weeks (and ongoing) |
| Hardening, migrations, a11y, docs | 4–6 weeks |

**Publishable MVP: 6–8 months** for one full-time senior person. Add
30–40 % if aiming at multi-client or commercialization.

---

## Risks, ordered by severity

| # | Risk | Milestone where it materializes | Mitigation |
| --- | --- | --- | --- |
| 1 | Drag & drop inside Shadow DOM | 1 | Isolated in `dnd/`, with its own interface |
| 2 | `page:fragments` does not give the expected result | 2 | Test before investing in UI |
| 3 | CSS budget with no elegant solution | 4 | Decide and accept the trade-off |
| 4 | Native = no one-click install | 0 | Accept: developer-first product |
| 5 | Editor/render duplication per widget | 3+ | `schema/` as the single source |
| 6 | The hook runs on every request | 2 | Aggressive caching with the `cacheHint` |
| 7 | The editor degrades with 40+ blocks | 3+ | Batching, memoization, virtualization |
| 8 | Contract changes in the plugin API | always | Assume breaking changes; EmDash 1.0.1 |
