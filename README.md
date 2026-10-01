# Builderdash

A visual page builder for [EmDash](https://github.com/emdash-cms/emdash), in the spirit of Elementor: a block palette, a live canvas with drag & drop, and a Structure panel to navigate and reorder the page tree.

> **Status: early.** The editor shell works end to end (drag, nest, reorder, undo/redo, save). The only widget today is the **Container**. Public rendering, the style engine and more widgets come next.

It is a **native** EmDash plugin: the editor is a React admin page, which sandboxed plugins cannot provide.

## Requirements

- EmDash `>= 1.0` on Astro, with `@astrojs/react`
- React 18 or 19

## Install

The package is not on npm yet. Until then, install it from GitHub (pnpm 9+):

```bash
pnpm add "github:lickybuay/builderdash#path:/plugin-builderdash"
```

The `prepare` script builds `dist/` on install.

### 1. Register the plugin

```js
// astro.config.mjs
import react from "@astrojs/react";
import emdash from "emdash/astro";
import { builderdashPlugin } from "@emdash/builderdash";

export default defineConfig({
	integrations: [
		react(),
		emdash({
			// ...database, storage
			plugins: [builderdashPlugin({ collection: "pages" })],
		}),
	],
});
```

### 2. Add the builder fields to your schema

A plugin cannot create fields or block types at runtime, so the site declares them in its `seed/seed.json`.

On the collection you want to build (`pages` by default), add two fields:

```json
{ "slug": "builder_layout", "label": "Builder layout", "type": "blocks",
  "validation": { "allowedTypes": ["builder_container"], "maxItems": 100 } },
{ "slug": "builder_styles", "label": "Builder styles", "type": "json" }
```

And the block type under `blockTypes`:

```json
{
  "slug": "builder_container",
  "label": "Container",
  "category": "Builder",
  "currentVersion": 1,
  "versions": [{
    "version": 1,
    "fields": [
      { "slug": "gap", "label": "Gap", "type": "select", "defaultValue": "md",
        "validation": { "options": ["none", "sm", "md", "lg"] } },
      { "slug": "direction", "label": "Direction", "type": "select", "defaultValue": "column",
        "validation": { "options": ["column", "row"] } },
      { "slug": "parent_key", "label": "Parent", "type": "string",
        "validation": { "maxLength": 32 } }
    ]
  }]
}
```

The demo site in this repository (`../seed/seed.json`) has a complete working example.

## Use

In the admin, open the content list of the collection: each entry gets an **Edit with BuilderDash** button. It opens the builder at:

```
/_emdash/admin/plugins/builderdash/builder?collection=pages&id=<entry id>
```

- Drag **Container** from the left panel onto the canvas, or click it to insert into the selection.
- **Structure** (right panel, toggled from the toolbar) shows the tree. Drag rows to reorder or nest.
- Keyboard: arrows move the selected node in the canvas; in Structure, ↑↓ move focus, ←→ collapse/expand, Alt+↑↓ reorder.
- `Cmd/Ctrl+S` saves, `Cmd/Ctrl+Z` undoes, `Cmd/Ctrl+Shift+Z` redoes.

## Known limitations

- The content list button is limited to the `pages` collection.
- Saved layouts are not rendered on the public site yet.

## Development

This package lives in a pnpm workspace together with a demo EmDash site. See the [repository README](../README.md).

```bash
pnpm --filter @emdash/builderdash typecheck
pnpm --filter @emdash/builderdash test
pnpm --filter @emdash/builderdash build
```

## License

MIT
