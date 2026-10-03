# 06 — Dev log

Progress log, session by session. The most recent entry goes on top.

Format: date · milestone · what was done · what was learned · next step.

---

## Session 12 — Screenshots and browser verification

**Date:** October 1, 2026

- README screenshots: `docs/images/builder.png` (palette, live preview, structure
  tree) and `docs/images/builder-inspector.png` (inspector open on a Hero), placed
  at the `builderdash:screenshots` marker.
- **Schedule** verified in the browser: on a published page, Save creates a draft
  ("Draft changes") and that reveals Schedule for the update. The form reads
  "Publish on (UTC)", its button stays disabled until a date is set, Cancel closes
  it, and Discard returns the entry to the live version.
- **Missing component** verified both ways: with a block type disabled in the
  schema, Structure and the canvas show "Missing component: Pricing" and the
  palette drops the type; with the type removed from the site's `blockTypes`, the
  block is not drawn and the edit render carries `data-bd-missing`.
- No code changes; tests still 87.

---

## Session 11 — Edit mode behind authentication

**Date:** October 1, 2026

- `?_builder` turned on the live-preview markup for anyone who appended it to a
  public page (empty drop areas, missing-block labels, structure). `edit` now
  comes from `builderEditMode(Astro)` (`render/edit-mode.ts`, exported as
  `@lickybuay/builderdash/edit-mode`): the parameter **and** a signed-in user.
  Anonymous requests get the plain page.
- The builder's iframe is unaffected: it loads the preview URL from the admin,
  same origin, with the editor's session already on the request.
- A request that carries `?_builder` is never a cached variant of the public
  page: `builderEditRequested(Astro)` feeds the cache guard next to
  `Astro.cache.set(cacheHint)`.
- Updated to match: the README route snippet and the demo site's `[...slug].astro`.
- Verified in Chrome: anonymous `?_builder` renders without `data-bd-edit`;
  a signed-in editor still gets the full canvas (9 nodes). Tests: 87.

---

## Session 10 — Site blocks in the palette

**Date:** October 1, 2026

- The palette lists Container and the block types that the `content` field allows
  (manifest, filtered by `allowedTypes`). Inserting creates the block in `content` and
  its `content_ref` in a single step (`addContentBlock`).
- Blocks are born valid (`createBlockValue`): required fields with their label,
  first option in selects, lists with the minimum items.
- Before saving, `missingRequired` flags the empty field and sends nothing.
- Inspector: schema from the manifest (works with the author role), list editor.
- Unavailable type: "Missing component: …" in the preview and in Structure;
  `BuilderLayout` receives `blockTypes` and does not draw it on the site.
- Verified: the five types inserted and saved (the server accepted them),
  then Discard. Tests: 81.

---

## Session 9 — Details panel, floating Structure, Custom CSS and notice in the editor

**Date:** October 1, 2026

- Right column = **Details** panel, rebuilt from the EmDash editor's sidebar
  (which does not export its sections): Publish (status, Discard,
  Schedule), Title & URL, Ownership, Bylines, SEO and Custom CSS. The sections
  collapse; Publish starts open.
- Title, slug and Custom CSS go with Save (draft). Author, bylines and SEO are
  applied instantly, as in EmDash (Sergio's option "a").
- Header: View page, Save and Publish changes. Publish saves and publishes with the
  `_rev` from the save response. Delete leaves the header.
- `useBuilderEntry`: single write queue with `_rev`; load and action errors
  separated (a failure to publish no longer unmounts the editor); Discard and
  Schedule send `_rev` (the admin client does not accept it, the API is called directly).
  After Discard the builder remounts (`key={generation}`).
- **Floating Structure**: dragged by the header (pointer capture + shield
  over the iframe), can be minimized, remembers its position and repositions if the canvas
  changes width.
- Left bar: with no selection it shows the element list with a search box; with a
  selection, the Inspector and a "+ Add element" button.
- **Custom CSS** in `builder_styles.__css` (no schema change);
  `pageCssText` strips every `<` so it cannot close the `<style>`.
- **Builderdash** panel in EmDash's regular editor (`contentEditorPanels`):
  a notice that the page was designed with the builder and an "Open in builder" button.
- Verified in Chrome: Save, Discard, Publish (and back), SEO, title,
  Custom CSS (including a `</style><script>` attempt), search box, floating panel
  and notice. Tests: 74.

### Pending

- Bylines simplified (no role per byline); no Translations or Taxonomies.
- Schedule not tested in the browser.
- After a 409 the page has to be reloaded.

---

## Session 8 — Live canvas (iframe) with the page's real content

**Date:** October 1, 2026

- Decision 1 (Shadow DOM) is replaced: the canvas is an iframe with the
  real page in draft preview (`getPreviewUrl` + `?_builder`), like
  Elementor's preview.
- Header and footer belong to the site, not the page: they show in the iframe,
  static, and are not nodes (Sergio's request).
- `content_ref`: the blocks the page already has (`content`) are nodes that
  the builder positions; their text is still edited in the EmDash editor.
  `reconcileWithContent` adds them on open and discards the orphans.
- `BuilderLayout.astro` renders the layout with the site's components;
  each node is wrapped in `display: contents` with `data-bd-key`.
- Unsaved edits: `applyTree` projects the tree onto the iframe's DOM
  (idempotent). On save, the iframe reloads the server render.
- Demo site: `SiteHeader.astro`/`SiteFooter.astro` extracted from `Base.astro`
  (`chrome={false}`); `[...slug].astro` uses `BuilderLayout`.
- Verified: move the Hero in Structure → iframe instantly → Save →
  iframe reloaded with the same order.

### Pending

- Phase C: direct drag & drop inside the iframe.
- Home, pricing and contact (their own routes) with the builder.
- `Referrer-Policy: no-referrer` on preview responses.
- Tests: `applyTree`, `reconcileWithContent`, `content_ref` round-trip.

---

## Session 7 — Black canvas after dropping, and Structure panel

**Date:** October 1, 2026
**Stage:** skeleton, tree navigation

### Bug — The canvas went black when dropping a container

`Canvas` requires the `ariaLabel` prop, but `BuilderPage` did not pass it. With an
empty canvas it goes unnoticed; when drawing the first node, `NodeView` called
`ariaLabel(...)` and threw `TypeError`. The Shadow DOM's React root had no
error boundary (the admin's do not cover it), so React unmounted the whole
canvas and the host was left empty. The drop was applied: the counter said
"1 containers". `tsc --noEmit` had already flagged it.

- `BuilderPage` passes a translated `ariaLabel`.
- `CanvasErrorBoundary` inside the shadow root: shows the error with
  "Retry" and resets itself only when the tree changes (for example, with undo).

### Structure panel (layer navigator)

Collapsible panel to the right of the canvas, like Elementor's Navigator. It is
the beginning of the Inspector: the right column is that panel, and Structure is its
first view.

- Tree with `role="tree"`, expand/collapse, selection synchronized with the
  canvas in both directions (opens the ancestors and scrolls to the row).
- Dragging rows reorders or nests. Zone depends on the pointer within the row:
  top 25 % = before, middle 50 % = inside, bottom 25 % = after.
- "After" on an expanded container with children lands as the first child,
  which is where the line is drawn.
- Dropping into the gap the node already occupies does nothing (does not pollute the
  history).
- Keyboard: ↑↓ focus, ←→ collapse/expand (reversed in RTL), Enter
  selects, Alt+↑↓ reorders.
- The rule for which types the root accepts comes from the registry (`topLevel`) and is
  shared by canvas and panel.
- The open/closed state is remembered in `localStorage`.

Code: `editor/navigator/Navigator.tsx`, `editor/dnd/tree-drop.ts` (pure
resolver) and `useTreeDrop` in `editor/dnd/index.tsx`. The drag store holds
`navKey`/`navZone`; the canvas target and the panel target are mutually exclusive.

### What was learned

- A dedicated `createRoot` root needs its own error boundary.
- The plugin's Tailwind classes only work if they already exist in the admin's
  compiled CSS (`@emdash-cms/admin/dist/styles.css`). They must be
  checked before use (`hover:text-kumo-strong` does not exist).

### Pending

- `canvas-dnd.test.tsx` does not pass `ariaLabel` to `Canvas` (type error).
- Tests for the panel's resolver and the store.
- Decide the canvas architecture: iframe with the real front end (see this
  session's analysis) or stay with Shadow DOM.

### Multiple collections and blank template

- The builder is no longer tied to `pages`: the schema enables it. Any
  collection with `builder_layout` shows the button and opens the builder.
- Availability is read from the admin manifest, not from the schema API:
  that one requires `schema:read` (EDITOR) and an AUTHOR got a 403.
- A collection without the fields shows "This collection has no builder
  fields" instead of an empty canvas.
- `builderdashPlugin({ collection })` is deprecated and ignored.
- `install.sh`: `--collections=pages,posts` (default), fails before
  touching anything if none exist, and on `blank` creates `seed/seed.json` with
  `pages` and points `package.json` at it. Tested on starter, blank and
  marketing; the resulting seeds pass `emdash seed --validate`.
- Pending: public rendering of `builder_layout` (no template
  shows it yet).

### Repository and package name

- Repo: https://github.com/lickybuay/builderdash (monorepo: plugin in
  `plugin-builderdash/` as an independent package + demo site at the root).
- The package goes from `@emdash/builderdash` (provisional, someone else's scope) to
  `@lickybuay/builderdash`.

---

## Session 6 — Verified in a real browser: three deep bugs

**Date:** October 1, 2026
**Stage:** skeleton, step 9 (persistence) closed

### How it was unblocked

Orca's browser never connected. The solution was to use the **`chrome-devtools` MCP**, which did load in the session after the restart. With that I could do real drags, read HTTP responses and capture server errors.

### Bug 1 — The 404 on `/pages/test-page`

**Symptom:** the entry existed and was published, but returned 404.

**Cause:** there was **no dynamic route**. The template's three pages are `.astro` files with a fixed URL (`index`, `pricing`, `contact`). A new entry had no template to serve it.

**Fix:** `src/pages/[...slug].astro`, which captures any path and resolves the entry. Rest parameter, not `[slug]`, because EmDash links to `/pages/<slug>` and the template uses `/<slug>`. Now both forms work.

### Bug 2 — Drag & drop did not fire handlers

**Symptom:** the events reached the DOM but React never handled them.

**Cause:** **Shadow DOM retargeting.** React delegates events to the container where it was mounted, and the admin's is outside the shadow root. An event that bubbles out of a shadow root gets **retargeted**: the listeners above see the `host`, never the inner node. With the canvas rendered through `createPortal`, the canvas handlers never ran.

**Fix:** the canvas mounts **its own `createRoot` inside the shadow root**. That splits the React tree in two (palette outside, canvas inside) and context cannot cross them, so the drag state moved to an **external store** shared via `useSyncExternalStore`.

Confirmed in the browser: `__reactContainer$` appears **inside** the shadow root.

### Bug 3 — The save was rejected by the schema

**Symptom:** the save returned 409 and wrote nothing.

**Cause:** the builder wrote to the `content` field, which only accepts `marketing_*` types. My `builder_container` blocks did not exist in the schema.

**Fix:** a dedicated `builder_layout` field, with its `builder_container` block type declared in the seed. The fields are kept separate: `content` remains the marketing's and `builder_layout` the builder's.

### Bug 4 — `_parent` is not allowed

**Symptom:** after fixing the above, the save kept failing:

```
400 VALIDATION_ERROR
builder_layout[1]: Unrecognized key: "_parent"
```

**Cause:** a stored block **only** allows `_type`, `_version`, `_key` and the fields declared in its type. Any extra key fails validation. `_parent` was a convention of mine, not the schema's.

**Fix:** the parent pointer is now a **declared field** (`parent_key`) in the block type. **This invalidated part of the data contract**, so `02-data-contract.md` was corrected.

### Final verification, in the browser

| Step | Result |
| --- | --- |
| Drag a container from the palette | ✅ 1 node created |
| Drop inside another container | ✅ `depths: [0, 1]` |
| Insertion line during the drag | ✅ appears |
| Save | ✅ HTTP 200, `success: true` |
| `builder_layout` in the database | ✅ 2 blocks with `parent_key` |
| `content` (marketing) | ✅ intact, 4 blocks |
| Reload | ✅ 2 nodes, same keys, same hierarchy |

**The milestone's definition of done is met.**

### What was learned

- **jsdom tests cannot validate Shadow DOM.** All 33 passed while dragging was broken in production. Retargeting does not exist in jsdom, so the bug was invisible. A new test verifies that the canvas has its own React root, but **the real gesture can only be validated in a browser**.
- **`:scope` does not work in ShadowRoot** (already known, now with a regression test).
- **No key convention is free in EmDash.** `_type`/`_version`/`_key` are the contract; everything else must be a declared field. Any design that assumes "invisible" fields will fail on save.
- **Separate fields from the start.** Mixing the builder's layout with the template's content would have broken the site.
- **The browser found in one session what the tests did not find in three.**

### Pending

- Step 10: keyboard, visible focus, RTL, dark mode.
- The counter always says "2 containers" in the plural; cosmetic.

---

## Session 5 — Scope cut: only the container

**Date:** September 30, 2026
**Stage:** skeleton (formerly called "Milestone 1")

### Why

The feedback was direct and correct: *"you went overboard, the general structure came
first, and you could have put in just the container as a drag and drop element."*

They were right. What the stage asked for was to prove the skeleton. Instead there were
4,062 lines: 7 widgets, an inspector with tabs, indicators on two axes, undo/redo in the
toolbar, a device selector, a badge on the public page, a column in the admin.

And the real effect of that excess was not just noise: **drag & drop ended up wrong and it took
three attempts to fix.** With a single widget, the `:scope` bug would have shown up on the
first test, with 50 lines instead of 500.

### What was deleted

| Deleted | Why it did not contribute to the skeleton |
| --- | --- |
| 6 of 7 widgets | A nested container already tests the structure |
| `shell/Inspector.tsx` | With no widgets to inspect there is nothing to show |
| `shell/Topbar.tsx` | Undo/redo and device do not test dragging |
| `shell/WidgetPanel.tsx` | Replaced by a minimal palette inside the page |
| `fragments.ts` + test | A convenient entry point, but it is not the skeleton |
| `columns/BuilderColumn.tsx` | Same: access, not skeleton |
| DnD's horizontal axis | With a single stacked container type, it is unnecessary |

### Result

- **4,062 → 2,787 lines.**
- **47 → 30 tests**, all on what really matters: the data cycle and the
  gap computation.
- The registry declares **one widget**. The canvas renders any depth of nested
  containers.
- `WidgetPanel` was simplified to a 40-line `Palette` inside `BuilderPage`.

### What was learned

- **Excess scope is not just noise, it is debugging debt.** The more code
  sits on top of an untested part, the more expensive it is to find why it fails. The
  `:scope` bug lived under 7 widgets and 3 levels of nesting.
- **Building the skeleton first is faster, not slower.** Three sessions
  building on top of something broken, versus one session cutting back.
- **One widget is enough to test a builder.** The container has the two
  properties that matter: it is draggable and it is nestable. That covers the tree, the
  drag, the gap, the save and the recursive render.
- Deleting your own code hurts, but it leaves the repo telling the truth: what is
  tested and what is not.

### Pending

- **Confirm in a real browser.** It is still not connected. The logic is covered
  by tests; the gesture (pointer, drag ghost, autoscroll) has not been seen.
- Step 10: keyboard, visible focus, RTL, dark mode.

---

## Session 4 — "Edit with BuilderDash" badge on the public page

**Date:** September 30, 2026
**Milestone:** Milestone 2 brought forward (first real use of `page:fragments`)

### The idea

Have the button in EmDash's visual editing bar, next to the "Edit mode"
toggle, instead of only in the admin list.

### What was discovered

**EmDash's bar is not extensible.** It is an HTML string with fixed elements
(`visual-editing/toolbar.ts`). It has a `hidden` option meant precisely for "a page
that shows its own bar", **but the middleware never passes it**
(`request-context.ts:51`), and there is no hook for plugins.

In other words: you cannot add a button to that bar, nor hide it to put in your own.
It is the same class of limit as the actions column.

**And a second finding:** `PageFragmentEvent` only carries `page`. **There is no `user`**, so
the hook cannot know whether the visitor is an editor.

### What was done

A **badge of our own** that lives next to EmDash's pill, injected via
`page:fragments`:

- It is emitted on every request but **starts hidden**, and is revealed in the browser with the
  same `emdash-editor` flag that EmDash's bootstrap uses. This way the HTML is identical
  for everyone and **the shared cache keeps working**.
- It **resolves the entry automatically** from `page.content`, without the client's template
  declaring anything.
- It escapes all its interpolations, because `kind: "html"` is inserted verbatim.

Verified on the real site: it appears on `/`, `/pricing` and `/contact` with the correct
entry; it does not appear on 404 or on admin routes.

### What was learned

- **`page:fragments` works and is already in use.** The Milestone 2 wall has first
  ground won: the hook runs, resolves the entry and injects HTML.
- **Per-session filtering on the server breaks the cache.** EmDash documents it for its
  `"client"` mode and it applies here too: deciding on the client with a non-secret flag
  is the right approach.
- **`kind: "html"` escapes nothing.** It is the most dangerous surface of the fragments
  API: the responsibility for escaping lies entirely with the plugin.
- **When there is no extension point, the way out is a surface of our own next to it**, not
  patching core. The second time the same rule applies (actions column, bar).

### Pending

- **The `emdash-editor` flag is written by the admin on a normal login.** The
  dev-bypass I used for testing does not set it, so in the browser you will have to
  log in for real to see the badge.
- Confirm in a real browser (still not connected).
- Milestone 1, step 11: keyboard, focus, RTL, dark mode.

---

## Session 3 — Drag & drop rewritten

**Date:** September 30, 2026
**Milestone:** Milestone 1, step 8 revised

### The symptom

"Drag and drop is not working that well."

### The root cause

`resolveSlot` used `container.querySelectorAll(":scope > [data-bd-child]")`. **`:scope`
does not work inside a ShadowRoot**: it always returns empty. With no children detected, the
insertion index never advanced and **the node always landed at the start or the end**,
never where you pointed. The whole canvas lives in a shadow root, so it always failed.

I found it with an integration test that dumped the real DOM, not by reading the code.

### The four problems there were

1. **Empty `:scope` in ShadowRoot** → the gap was never computed. *This was the one that
   broke everything.*
2. **Nested zones**: one `DropZone` per gap generated zones inside zones, with
   `dragover` firing on several at once. The highlight jumped between rows.
3. **Wrong axis**: a section's columns go in a row (X axis) but were
   resolved on Y, so a 2-column section always gave the same gap.
4. **Duplicate wrapper**: `ColumnSlot` and `ContainerBody` both rendered
   `.bd-column`, one inside the other.

### What was done

- **One zone per container** instead of one per gap. The gap is computed from the
  pointer position against the children.
- **Explicit axis** (`horizontal` for sections, `vertical` for the rest).
- **`container.children` + `hasAttribute`** instead of `:scope`.
- **Single wrapper**: `bare` in `ContainerBody` when the parent already provides the box.
- **A single `target`** read by the panel, the click and the drop, so they do not diverge.
- **35 tests**, including a regression test for `:scope`.

### What was learned

- **`:scope` is not reliable inside a ShadowRoot.** It is not just jsdom: there are
  inconsistencies between engines. `children` is more verbose and always works.
- **Integration tests on the real DOM found what reading the code did not
  see.** Dumping the `outerHTML` is what revealed the problem.
- **An intermediate `<div>` breaks a container's flex**: `display: flex` stops
  applying to the real children. That is why the measurement wrapper and the layout wrapper must be
  the same element.
- **CSS comments with backticks break the TypeScript template literal**
  that holds the stylesheet.

### Pending

- **Confirm in a real browser.** The built-in browser is not connected to this
  session, so the real gesture (pointer, drag ghost, autoscroll) could not be
  tested visually. The logic is covered by tests, but the feel is not.
- Step 11: keyboard movement, visible focus, RTL, dark mode.

---

## Session 2 — Milestone 1 implemented and entry point in the content list

**Date:** September 30, 2026
**Milestone:** Milestone 1 (work environment) — steps 2 to 10 completed

### What was done

1. **Widget registry** (`src/schema/`) with 7 widgets in 3 categories, types and
   helpers (`childWidgets`, `canContain`, `defaultProps`, `blockTypeFor`).

2. **Tree operations** (`src/editor/store/tree.ts`): insert, move, delete,
   duplicate, update props/styles, flatten. Pure and immutable.

3. **Serialization** (`src/editor/store/serialize.ts`): tree ↔ `blocks` + `json`,
   with `_parent` as the only hierarchy pointer and styles joined by `_key`.

4. **16 tests** (`serialize.test.ts`) that validate the full data cycle. **All
   green.** They found a real index failure in `moveNode`.

5. **React store** (`useBuilder.ts`) with undo/redo via snapshots and dirty state.

6. **Complete shell**: topbar (breadcrumb, device selector, undo/redo, save),
   widget panel, canvas with Shadow DOM and inspector with tabs.

7. **Isolated drag & drop** in `src/editor/dnd/index.tsx` using the native HTML5 API.
   Nobody outside that folder touches the library.

8. **Entry point** (`src/editor/columns/BuilderColumn.tsx`): a "Builder" column
   in the content list with a button per row.

9. **Development environment working**: server on `localhost:4322`, plugin
   registered with `enabled: true`, `adminMode: "react"`, and all the admin
   modules compiling without errors.

### What was learned

- **`plugins/` does not exist in EmDash.** That is WordPress. "Plugins" is a registry in
  `astro.config.mjs`, and the plugin is an npm package sibling to the site. Detail in
  `05-milestone-1-setup.md`.
- **A native plugin is not enabled from the plugins-manager.** That mechanism is only
  for sandboxed ones; a native plugin's lifecycle is the deploy.
- **There is no extension for the rows' actions column.** `PluginAdminModule`
  only has `pages`, `widgets`, `fields`, `contentEditorPanels` and
  `contentListColumns`, and columns are read-only cells. The button goes in its
  own column.
- **Astro 7 hides the real error** when the config fails: it only prints
  `Dev server process exited before becoming ready`. The diagnosis is in
  `.astro/dev.log`. I lost quite a bit of time on this.
- **`moveNode`'s `index` took three attempts** to get clear. The correct semantics
  is "insertion gap in the corrected list" (0 to `children.length`), which is
  exactly what a destination zone produces. The tests pin it down.
- **TypeScript with `moduleResolution: "bundler"` does not resolve `.ts` extensions** in
  imports while Node ESM does require them. Solved by migrating the tests to Vitest, which
  uses the same resolver as Vite.
- **Lingui 5's `i18n._` accepts `(id, values)` or a descriptor**, not a bare object.
  And Kumo's `Badge` uses `variant`, not `appearance`, for color.

### Decisions made

| # | Decision | Value |
| --- | --- | --- |
| 6 | Drag & drop library | Native HTML5 API, isolated in `dnd/` |
| 7 | Test runner | Vitest (same resolver as Vite) |
| 8 | Entry point | Own column, not the actions column |
| 9 | Builder parameters | Query string (`?collection=&id=`), not `useParams` |

### Next step

Milestone 1, step 11: **keyboard and polish**. Move nodes with the keyboard (an
accessibility requirement, not an extra), visible focus, RTL, and verify dark mode.

After that, close Milestone 1 and move on to Milestone 2 (`page:fragments`), which is the
most dangerous wall in the project.

### Pending decisions

- **Project name.** The test site is called `builderdash` and the plugin
  `@emdash/builderdash`. They coincide and it is confusing. Should the site be renamed?
- **Styles `json` field.** `useBuilderEntry.ts` expects a
  `builder_styles` field in the `pages` collection that **does not yet exist in the seed**. It has to be
  added for saving to work end to end.
- **Switch in the admin.** If it should be possible to enable/disable it without a redeploy, via
  `ctx.settings`. A decision for a later milestone.

---

## Session 1 — Initial session: analysis, planning and start of Milestone 1
**Date:** September 30, 2026
**Milestone:** full planning + start of Milestone 1

### What was done

1. **Complexity analysis.** EmDash 1.0.1's plugin model was investigated
   against the installed code and the online documentation (`docs.emdashcms.com`).

2. **Four hard constraints were identified** that shape the entire design.
   They are summarized in `README.md` and developed in `01-decisions.md`:
   - The sandboxed admin can only return Block Kit, never React → native plugin.
   - `page:fragments` is native-only → public rendering without touching templates requires
     native.
   - The schema is read-only for plugins: there is no `schema:write`.
   - A block type does not allow `json` or `reference` → styles go in a sibling
     field.

3. **The visual language was documented.** The admin is **Kumo** (Cloudflare) with
   `data-theme="classic"`, `data-mode` for light/dark, `dir` for RTL, and
   `--font-emdash` = Noto Sans variable. The color tokens, the motion
   utilities and the list of available components were cataloged
   (`04-visual-guide.md`).

4. **The full milestone plan was written** (`03-milestone-plan.md`): 8 milestones, with
   a visible deliverable, definition of done and risk for each.

5. **The data contract was frozen** (`02-data-contract.md`): in-memory tree,
   two layers joined by `_key`, `_parent` as the only hierarchy pointer, and the
   format of per-breakpoint styles.

6. **Milestone 1 was started** with the `plugin-builderdash/` package structure.

### What was learned

- **EmDash already gives away 70 % of Elementor's store.** A `blocks` field is an array
  of typed, versioned blocks with `_type`/`_version`/`_key`, with breaking
  migration and fingerprints. There is no need to invent a data model; it has to be respected.
- **Field Kit is the exact precedent.** `@emdash-cms/plugin-field-kit` is a *native*
  plugin that adds widgets to `json` fields from the seed, with the promise that
  deleting the plugin does not invalidate the data. Our style layer repeats that pattern.
- **Hierarchy does not exist in a `blocks` field.** It is a flat array. It is solved with
  a `_parent` per block; `_children` was discarded for duplicating information.
- **The brand color has to be reserved.** If it is used on everything, it stops signaling.

### Decisions made

| # | Decision | Value |
| --- | --- | --- |
| 1 | Canvas | Live DOM + Shadow DOM (not iframe) |
| 2 | Storage | `blocks` + sibling `json` field, joined by `_key` |
| 3 | CSS on the client | CSS utilities + data attributes; budget in Milestone 4 |
| 4 | Editor location | Full admin page first |
| 5 | Drag & drop | Isolated in `dnd/` behind its own interface |

### Next step

Continue Milestone 1 in the order of `05-milestone-1-setup.md`, starting with step 2
(widget registry) and step 3 (pure tree operations), and reaching step 4
(serialization) with tests, which is where the milestone is truly validated.

### Pending decisions

- Concrete drag & drop library (candidate: `@dnd-kit`). Closed in step 8.
- Whether the package is also published as sandboxed for the declarative admin, or only
  native. For now: **native only**, because the editor requires it.
- Final name of the npm package (`@emdash/builderdash` is provisional).
