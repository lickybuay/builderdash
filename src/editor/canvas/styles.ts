/**
 * Admin styles that must enter the canvas Shadow DOM.
 *
 * Theme custom properties (colors, typography) DO cross the shadow boundary and
 * inherit on their own. What does not cross is the Kumo stylesheets, so this
 * replicates the bare minimum using those same tokens.
 *
 * Everything uses logical properties so RTL works with no extra code, and Kumo
 * design tokens so dark mode is free.
 */

export const CANVAS_STYLES = `
:host {
  display: block;
  font-family: var(--font-emdash, ui-sans-serif, system-ui, sans-serif);
  color: var(--text-color-kumo-default);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*, *::before, *::after { box-sizing: border-box; }

.bd-canvas {
  min-height: 100%;
  padding: 24px;
  background: var(--color-kumo-canvas);
}

.bd-page {
  max-width: 960px;
  margin-inline: auto;
  padding: 16px;
  background: var(--color-kumo-base);
  border: 1px solid var(--color-kumo-line);
  border-radius: 10px;
}

/* Shown by the canvas error boundary instead of an empty host. */
.bd-canvas-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: 960px;
  margin-inline: auto;
  padding: 16px;
  font-size: 0.8125rem;
  color: var(--text-color-kumo-default);
  background: var(--color-kumo-base);
  border: 1px solid var(--color-kumo-danger, var(--color-kumo-line));
  border-radius: 10px;
}

.bd-canvas-error button {
  padding: 4px 10px;
  font: inherit;
  color: inherit;
  background: var(--color-kumo-control);
  border: 1px solid var(--color-kumo-line);
  border-radius: 6px;
  cursor: pointer;
}

/* --- Nodes --------------------------------------------------------------- */

.bd-node {
  position: relative;
  border-radius: 8px;
  transition: box-shadow 0.15s ease-out, background-color 0.15s ease-out;
}

.bd-node[data-selected="true"] {
  box-shadow: inset 0 0 0 2px var(--color-kumo-brand);
}

/* Focus must be visible: the node is reachable with Tab and operable with the
   keyboard, so the user has to see where they are. The ring is drawn inside so
   it does not shift the layout. */
.bd-node:focus-visible {
  outline: 2px solid var(--color-kumo-brand);
  outline-offset: 2px;
}

/* A selected node that also has focus reads slightly stronger, because that is
   the one the arrow keys act on. */
.bd-node[data-selected="true"]:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-kumo-brand), 0 0 0 4px var(--color-kumo-info-tint);
}

.bd-node[data-selected="true"] > .bd-node__label { opacity: 1; }

.bd-node__label {
  position: absolute;
  inset-block-start: -22px;
  inset-inline-start: 0;
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--color-kumo-base);
  background: var(--color-kumo-brand);
  border-radius: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease-out;
  white-space: nowrap;
}

/* A container reads as a nested box, so the structure is visible while
   dragging. The dashed edge is the container's own affordance. */
.bd-dropzone[data-role="container"],
.bd-dropzone:not(.bd-dropzone--root) {
  display: flex;
  flex-direction: column;
  min-height: 56px;
  padding: 8px;
  border: 1px dashed var(--color-kumo-fill-hover);
  border-radius: 8px;
  transition: border-color 0.15s ease-out, background-color 0.15s ease-out;
}

.bd-dropzone[data-gap="none"] { gap: 0; }
.bd-dropzone[data-gap="sm"]   { gap: 8px; }
.bd-dropzone[data-gap="md"]   { gap: 16px; }
.bd-dropzone[data-gap="lg"]   { gap: 32px; }

/* --- Drop zones ---------------------------------------------------------- */

.bd-dropzone { position: relative; min-height: 8px; }

/* A wrapper around each direct child of a drop zone. resolveSlot measures
   these, so there must be exactly one per child and no extra wrapper that
   changes the geometry. */
.bd-child { display: block; }

/* Empty slot: a visible groove until it has content. */
.bd-empty-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 72px;
  margin: 8px;
  padding: 12px;
  font-size: 0.8125rem;
  color: var(--text-color-kumo-subtle);
  background: var(--color-kumo-tint);
  border: 1px dashed var(--color-kumo-fill-hover);
  border-radius: 8px;
  text-align: center;
}

.bd-dropzone[data-bd-active="true"] > .bd-empty-slot {
  color: var(--text-color-kumo-brand);
  border-color: var(--color-kumo-brand);
  border-style: solid;
  background: var(--color-kumo-info-tint);
}

.bd-dropzone[data-bd-active="true"] {
  border-color: var(--color-kumo-brand);
}

/* The single insertion line, rendered by DropIndicator at the active slot. It
   is a real element in the flow, not absolutely positioned, so it pushes
   siblings apart and reads as "the node lands here". */
.bd-drop-line {
  height: 3px;
  margin-block: 2px;
  border-radius: 2px;
  background: var(--color-kumo-brand);
  animation: bd-drop-line-in 0.12s ease-out;
}

@keyframes bd-drop-line-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Root zone: the page itself. */
.bd-dropzone--root {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bd-dropzone--root > .bd-empty-slot {
  min-height: 200px;
}

.bd-dropzone--root[data-bd-active="true"] {
  box-shadow: inset 0 0 0 2px var(--color-kumo-brand);
}

@media (prefers-reduced-motion: reduce) {
  .bd-node, .bd-node__label, .bd-drop-line, .bd-dropzone {
    transition: none;
    animation: none;
  }
}

/* Device view: only the width of the paper changes. Breakpoints become
   functional at a later stage; for now this just sizes the canvas. */
.bd-page[data-breakpoint="tablet"] { max-width: 768px; }
.bd-page[data-breakpoint="mobile"] { max-width: 390px; }
`;
