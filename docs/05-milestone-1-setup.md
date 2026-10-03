# 05 — Current stage: the skeleton

**Status: in progress.** This document is the living specification of the stage. It is
updated as work advances.

> **Scope note.** An earlier version of this document described a much larger milestone:
> seven widgets, an inspector with tabs, insertion indicators on two axes, a badge on
> the public page and a column in the admin. That was scope creep. It was deleted. What
> follows is the minimal test: **the overall structure, with the container as the only
> draggable element.**

---

## Goal

Prove the skeleton: that the workspace exists, that a container can be dragged into
the canvas, nested, reordered, and that the tree survives a save cycle.

We are not testing that a widget looks nice. We are testing that **the structure holds**.

---

## Scope

### In

- Native plugin registered in the admin.
- Admin page `/_emdash/admin/plugins/builderdash/builder`.
- **Top bar:** entry title, container counter, delete
  selected, save.
- **Left palette:** one element, the container. Draggable and clickable.
- **Canvas:** Shadow DOM, empty state, recursive tree rendering.
- **Drag & drop:** drag from the palette to the canvas, reorder, drop inside another
  container.
- **Selection** of a node with a visible outline.
- **Store:** immutable tree + undo/redo + two-layer persistence.

### Out (and why)

| Out | Reason |
| --- | --- |
| More widgets | Only after the skeleton is proven. Adding one must not touch the canvas. |
| Inspector | With no widgets to inspect, there is nothing to show. |
| Style engine | Styles are saved and retrieved; rendering them is another stage. |
| Responsive | The canvas has a width per device, but no real overrides. |
| Public rendering | It is the next stage, and right now it is the most important wall. |
| Badge on the public page | A convenient entry point, but it does not prove the skeleton. |
| Column in the admin list | Same: access convenience, not skeleton. |

The last three were deleted on purpose. They are identified and documented in case they
are to be recovered, but they do not contribute to the question this stage answers.

---

## Definition of done

> You drag a container from the palette to the canvas, nest another inside it, reorder,
> save, reload and the tree is exactly the same.

And also:

- A single drop zone per container (not one per gap).
- The children of each zone are measurable: the gap is computed where the pointer points.
- No console errors.
- The canvas respects light and dark mode.
- Zero references to widgets that do not exist.

---

## File structure

```
plugin-builderdash/
├── package.json                     exports ., ./admin
├── tsconfig.json
└── src/
    ├── index.ts                     descriptor + createPlugin
    ├── plugin-id.ts                 PLUGIN_ID, PLUGIN_VERSION
    ├── render/index.ts              empty until the public rendering stage
    ├── schema/
    │   ├── types.ts                 WidgetDefinition, WidgetField, NodeType
    │   └── registry.ts              registry: one widget, the container
    └── editor/
        ├── index.tsx                `pages` export
        ├── BuilderPage.tsx          palette + bar + canvas
        ├── useBuilderEntry.ts       load and save the two layers
        ├── canvas/
        │   ├── Canvas.tsx           Shadow DOM + recursive rendering
        │   └── styles.ts            canvas stylesheet
        ├── dnd/                     ⚠️ the only place that touches the drag mechanism
        │   ├── index.tsx
        │   ├── resolve-slot.test.ts
        │   └── canvas-dnd.test.tsx
        └── store/
            ├── tree.ts              pure operations
            ├── serialize.ts         tree ↔ layers 1 and 2
            ├── useBuilder.ts        state, undo/redo
            └── serialize.test.ts
```

---

## Implementation order

1. **Native scaffolding** — package, descriptor, registry, a page that renders. ✅
2. **Registry** — `schema/` with one widget: the container. ✅
3. **Tree operations** — insert, move, delete, duplicate, flatten. ✅
4. **Serialization** — tree ↔ `blocks` + `json`, with tests. ✅
5. **React store** — state, selection, undo/redo. ✅
6. **Shell** — bar, palette, canvas. ✅
7. **Canvas** — Shadow DOM, recursive rendering. ✅
8. **Drag & drop** — one zone per container, gap by pointer. ✅
9. **Persistence** — save and retrieve. ✅
10. **Polish** — keyboard, focus, RTL, dark mode. ⏳

---

## How to bring up the environment

A native plugin **does not start on its own**: the package's `main` points to `dist/`, so
the plugin must be compiled before bringing up the site.

```bash
# 1. Compile the plugin (once, or in watch mode)
cd plugin-builderdash && npx tsdown src/index.ts --format esm --dts --clean

# 2. Declare the workspace link (only once)
cd .. && pnpm add -w "@lickybuay/builderdash@workspace:*"

# 3. Start the site
pnpm dev
```

Symptoms and causes:

| Error | Cause | Fix |
| --- | --- | --- |
| `Cannot find module '@lickybuay/builderdash'` | The workspace dependency is missing | `pnpm add -w "@lickybuay/builderdash@workspace:*"` |
| `Failed to resolve entry ... incorrect main/module/exports` | `dist/` does not exist | `tsdown ... --dts --clean` |

The real Astro 7 error **does not show up in the terminal**: the wrapper only prints
`Dev server process exited before becoming ready`. The diagnosis is in
`.astro/dev.log`.

---

## Drag & drop: architecture and pitfalls

### One zone per container, not one per gap

The first version created a zone for every insertion gap. That nests zones inside
zones (a node's gap lives inside its container's zone), and `dragover` fires on
several of them at once. The result: a highlight that jumps between rows and drops
that land somewhere other than where the indicator shows.

The correct version has **exactly one zone per container**. The gap is computed
from the pointer position against the container's children.

### `:scope` does NOT work inside a ShadowRoot

This was the bug that made dragging "not work well".

```js
container.querySelectorAll(":scope > [data-bd-child]")   // ← returns EMPTY
```

The whole canvas lives in a shadow root, so it **always** returned empty. With no
children detected, the index never advanced and the node always landed at the start or
the end, never where you pointed.

The iteration uses `container.children` + `hasAttribute`, which always works. A
regression test covers it.

### DOM structure the canvas produces

```
dropzone (root)
└─ .bd-child                 ← measurable by resolveSlot
   └─ .bd-node (container)
      └─ dropzone (of the container)
         └─ .bd-child
            └─ .bd-node (nested container)
               └─ dropzone
```

Rule: **one `.bd-child` per direct child of a zone**, with no extra wrappers. An
extra wrapper breaks the gap measurement.

### Why native HTML5 and not `@dnd-kit`

`@dnd-kit` **is already** in the admin bundle (EmDash uses it), so it would not add weight.
It was discarded because its sensors would have to be threaded across the
Shadow DOM boundary, where coordinates and the sortable context cross realms. Native DnD
works across that boundary because events are captured on the host.

HTML5 DnD does not solve keyboard movement. That is handled separately, in step 10.

---

## Tests

| File | What it covers |
| --- | --- |
| `store/serialize.test.ts` | Data cycle: tree ↔ blocks + styles, moving without losing styles, orphans |
| `dnd/resolve-slot.test.ts` | Gap computation: midpoints, children with no height, unmarked elements |
| `dnd/canvas-dnd.test.tsx` | Real canvas: one zone per container, measurable children, own React root in the shadow, `:scope` regression |

33 tests. Run with `pnpm test`.

### What the tests CANNOT cover

**The real drag gesture.** jsdom does not implement Shadow DOM retargeting, so a canvas
rendered through a portal passed all 33 tests while dragging did nothing in the
browser. There is a test that verifies the canvas has its own React root inside the
shadow (the root cause), but **validating the gesture requires a browser**.

Manual verification, with `chrome-devtools`:

1. Open `/_emdash/admin/plugins/builderdash/builder?collection=pages&id=<id>`.
2. Drag a container from the palette to the canvas.
3. Drag another inside the first.
4. Save, reload, check that the hierarchy comes back identical.

---

## Entry fields

| Field | Owner | Contents |
| --- | --- | --- |
| `content` | Marketing template | `marketing_*` blocks, rendered by `MarketingBlocks.astro` |
| `builder_layout` | Builder | `builder_container` blocks: the composition |
| `builder_styles` | Builder | Layer 2: styles indexed by `_key` |

**They are deliberately separate.** Writing builder blocks into `content` is
rejected by the schema (`allowedTypes`) and would break the template's rendering.

`builder_styles` is still edited as raw JSON, enough to verify the save cycle. The
custom widget belongs to another stage.

---

## The hierarchy is stored as a declared field

A stored block **only** allows `_type`, `_version`, `_key` and the fields declared
in its definition. Any extra key fails validation:

```
400 VALIDATION_ERROR
builder_layout[1]: Unrecognized key: "_parent"
```

That is why the parent pointer is a `parent_key` field declared in the block type, not
a convention. Detail in `02-data-contract.md`.

**General rule:** in EmDash there are no "invisible" fields on a block. Everything that
is stored must be declared in the schema, and the schema is declared in the seed.

---

## The canvas mounts its own React root

The canvas lives in a Shadow DOM and React delegates events to the container where it was
mounted. An event that bubbles out of a shadow root gets **retargeted**: the listeners
above see the `host`, never the inner node. With `createPortal`, the canvas handlers are
never run and dragging fails silently.

The solution is to mount the canvas with `createRoot` **inside** the shadow root. Consequence:
the React tree is split in two, context does not cross, and the drag state lives in an
**external store** shared with `useSyncExternalStore`.

---

## What gets frozen at the end

- The data contract in `02-data-contract.md`.
- The shape of `WidgetDefinition` in `schema/`.
- The public interface of `dnd/`.
- The props of `NodeView`.

**Adding a widget must not require touching the canvas or the DnD.** If it does,
something was frozen wrong.
