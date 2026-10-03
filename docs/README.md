# Builderdash — working document

An EmDash plugin that adds an Elementor-style visual page builder.

**This directory is the project's memory between sessions.** Any agent or person
picking up the work should first read `README.md` (this file) and then the document
for the milestone in progress.

## Index

| Document | Contents |
| --- | --- |
| `README.md` | Vision, frozen decisions, current status, navigation |
| `01-decisions.md` | The five architecture decisions and their rationale |
| `02-data-contract.md` | The data contract: `Node`, content layer, style layer |
| `03-milestone-plan.md` | The full roadmap, milestone by milestone |
| `04-visual-guide.md` | How to replicate EmDash's visual language (Kumo) |
| `05-milestone-1-setup.md` | Detailed specification of the milestone in progress |
| `06-dev-log.md` | Session-by-session progress log |

## Vision in one sentence

A native EmDash visual builder: widget panel on the left, canvas in the center,
inspector on the right, drag & drop, responsive styles and public rendering —
built in parts, without ever rewriting the shell.

## Constraints that shape everything

These are not opinions: they are limits verified against the EmDash 1.0.1 code and
its documentation. Any design that ignores them will hit a wall.

1. **It has to be a native plugin.** The sandboxed admin can only return
   *Block Kit* (JSON), never React. A drag & drop canvas is impossible without React.
2. **`page:fragments` is native-only.** The sandbox only offers
   `page:metadata` (meta tags, JSON-LD), which is useless for layout HTML. Without
   fragments there is no public rendering without touching the client's templates.
3. **The schema is read-only for plugins.** There is no `schema:write`
   capability. The builder's block types are declared in a *seed*, not at
   runtime. There is no "create widget from the UI".
4. **A block type does not allow `json` or `reference`.** That is why styles go
   in a **sibling** `json` field of the entry, not inside the block.
5. **There is no one-click install.** Native = `pnpm add` + editing `astro.config.mjs` +
   redeploy. It is a *developer-first* product by design, not a limitation that can be worked around.

## Frozen decisions

Summary; the detail is in `01-decisions.md`.

| # | Decision | Value |
| --- | --- | --- |
| 1 | Canvas | Live DOM inside the admin + **Shadow DOM** to isolate styles |
| 2 | Storage | **`blocks` for content + `json` field for styles**, joined by `_key` |
| 3 | CSS on the client | CSS utilities + inline `<style>` in the fragment (budget to be set in Milestone 4) |
| 4 | Where the editor lives | Full admin page (large canvas); sidebar panel as a shortcut later |
| 5 | Drag & drop | Isolated in its own module with a stable interface, so the library can be swapped |

## Current status

**Current stage: the skeleton — in progress, steps 1 to 9 completed.**

The package lives in `plugin-builderdash/` (pnpm workspace). The specification is in
`05-milestone-1-setup.md`. Session history is in `06-dev-log.md`.

The stage tests a single thing: **the overall structure with the container as the only
draggable element.** One widget, zero inspector, zero rendered styles. Everything
else is added once the skeleton is proven.

## Working rules

- **Never touch the site's `tokens.css` or `Base.astro`** for visual changes to the
  admin. The builder's look comes from the Kumo tokens (`04-visual-guide.md`).
- **`schema/` and `style-engine/` are the only shared source of truth** between
  editor and render. If they diverge, something was duplicated there.
- **Every stage ends in something that can be opened and seen.** Never a stage of pure
  invisible infrastructure.
- **Data is saved from the start**, even if the editor is ugly. Without a store, everything
  after is throwaway prototypes.
- **The shell is built first and never touched again.** Widgets are always added
  inside it. If adding a widget forces you to touch the canvas, the shell is badly
  built.
- **Keep scope tight.** If something does not answer the stage's question, it does not go in. Excess
  scope is not just noise: it is debugging debt (see the dev log, session 5).
