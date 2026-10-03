# 01 — Architecture decisions

Five decisions that must be settled **before** writing code. All of them are
made. If any is revisited, this document must be updated and the change noted in
the dev log.

---

## Decision 1 — The canvas is live DOM, not an iframe

Elementor uses an `<iframe>` for the canvas. We do not.

| | iframe | Live DOM (chosen) |
| --- | --- | --- |
| CSS isolation from the admin | Total | None → solved with **Shadow DOM** |
| Communication | `postMessage` (async, serialized) | Direct: the tree is React state |
| Drag & drop | Native inside the iframe | More delicate; collisions must be handled |
| Development speed | Slow | Fast |
| Builder look | Its own | Inherits Kumo from the admin |
| Accessibility | Worse (two documents) | One document, one focus |

**Chosen: live DOM + Shadow DOM at the canvas root.**

Reasons:
- All state lives in React; with `postMessage` every drag would have to be
  serialized and sent back, which makes drag & drop much harder to get right.
- Inheriting Kumo means the builder **already looks like EmDash** at no extra cost.
  This is an explicit project requirement.
- Shadow DOM solves the only real problem: keeping the styles of the user's widgets
  from leaking into the admin and vice versa.

**Consequence:** drag & drop is harder than in an iframe. That is why it is the
first thing built, in isolation, with placeholder widgets (Milestone 1).

---

## Decision 2 — Two data layers joined by `_key`

The classic mistake would be to store everything in a monolithic `json`. We would lose:
block versioning, fingerprints, migration, revisions, media tracking and
the `<Blocks>` component that themes already use.

**Chosen: two layers.**

### Layer 1 — Content: EmDash's `blocks` field

What each node is and what it says. It leverages the `BlockTypeRegistry`: versioning,
breaking migration with `migrateBlocks: true`, revisions, i18n via `translatable`.

```json
[
  { "_type": "builder_section", "_version": 1, "_key": "sec_a1", "columns": 2, "gap": "md" },
  { "_type": "builder_heading", "_version": 1, "_key": "wid_b2", "text": "Hola", "level": "h1", "_parent": "sec_a1" }
]
```

### Layer 2 — Styles: a parallel `json` field on the same entry

This is where everything the block schema **forbids** goes: free-form values, deep
nesting and breakpoints.

```json
{
  "wid_b2": {
    "desktop": { "padding": { "t": "64", "r": "0", "b": "64", "l": "0" },
                 "typography": { "size": "48", "weight": "700" },
                 "color": "#111111" },
    "tablet":  { "typography": { "size": "36" } },
    "mobile":  { "typography": { "size": "28" } }
  }
}
```

### Why layer 2 does **not** go inside the block

Constraint verified in the EmDash schema: block types allow
`string`, `text`, `url`, `number`, `integer`, `boolean`, `datetime`, `select`,
`multiSelect`, `portableText`, `image`, `file` and `repeater`. **`json`, `reference`,
`slug` and nested `blocks` are forbidden.** There is no subfield type for CSS.

Since `repeater` cannot be nested and does not allow complex objects, "hiding" the
styles in a repeater does not work either. The only clean route is a **sibling**
field of type `json`, edited by a custom widget — which is exactly the pattern
EmDash validates in production with `@emdash-cms/plugin-field-kit`.

### The glue

`_key`. Layer 1 says **what it is**; layer 2 says **how it looks**. They are rendered
together. If you delete the plugin, the content remains valid and only the styles are lost.

---

## Decision 3 — CSS reaches the client as utilities + inline `<style>`

There is no asset pipeline for plugins: fragments accept verbatim `html`,
`inline-script` and `external-script`. A stylesheet with its own
hash, version and cache cannot be emitted.

**Chosen:** each node emits **data attributes** from the `style-engine`, and a
utility stylesheet (static, small) translates them to CSS, including the breakpoint
media queries.

```html
<div data-bd-pad="64-0-64-0" data-bd-size="48-36-28" data-bd-color="#111">…</div>
```

```css
[data-bd-pad="64-0-64-0"] { padding: 64px 0 64px 0; }        /* desktop */
@media (max-width: 1024px) { … tablet … }
@media (max-width: 767px)  { … mobile  … }
```

Advantages: the HTML is cached like any other page, there is no per-request style
recalculation, and the client's CSP is not broken.

**Budget:** to be set in Milestone 4. Estimate: **6–8 KB** of utilities + the
repeated values in attributes. It is a product trade-off, not an elegant solution
— there is none.

---

## Decision 4 — The editor lives in a full admin page

`admin.pages` mounts at `/_emdash/admin/plugins/builderdash/<path>` and gives a full
screen. The sidebar panel (`contentEditorPanels`) gives a narrow container,
good for quick edits but bad for a canvas.

**Chosen:** start with the **full page**. The sidebar panel is added
later as a shortcut, if at all. The reason: a 3-column canvas with an inspector does not
fit in 320 px, and forcing it leads to an editor worse than the one it is meant to replace.

---

## Decision 5 — Drag & drop isolated behind its own interface

Drag & drop is the most fragile part and the one most likely to be changed. It is
implemented in `editor/dnd/` exposing a stable API (`useDrag`, `DropZone`,
`SortableList`) and **nothing outside that folder imports the library directly**.

Initial candidate: `@dnd-kit`, which already enters the admin bundle through Kumo and
TanStack. The concrete decision is closed at implementation time, not before.

**Rule:** if switching libraries forces you to touch `canvas/` or `inspector/`, the
isolation is broken.
