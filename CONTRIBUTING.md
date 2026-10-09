# Contributing to BuilderDash

Thanks for helping! BuilderDash is a native [EmDash](https://github.com/emdash-cms/emdash)
plugin: a visual page builder in the spirit of Elementor. This repository holds only the
plugin; you try it inside an EmDash site.

## Prerequisites

- **Node.js 22.16+** (`.nvmrc` pins 22)
- **pnpm 11** — `npm install -g pnpm@11` (or `corepack enable` where corepack is available;
  Node 25 no longer bundles it)

## Set up

```bash
git clone https://github.com/<you>/builderdash.git
cd builderdash
pnpm install
```

### Try your changes in an EmDash site

Create a site next to the plugin and link the plugin into it, so every edit shows up
without publishing anything:

```bash
cd ..
pnpm create emdash@latest my-site   # Node.js, Starter template
cd my-site
pnpm add link:../builderdash
pnpm exec builderdash-setup --skip-install --with-render
pnpm dev
```

Then open `http://localhost:4321/_emdash/admin`, open a page and click
**Edit with BuilderDash**.

A linked plugin has its own `node_modules`, so the site must resolve the shared libraries
from ONE place or the builder breaks with "useLingui hook was used without
I18nProvider". Add the plugin's peers as direct dependencies of the site
(`@cloudflare/kumo`, `@emdash-cms/admin`, `@lingui/core`, `@lingui/react`,
`@tanstack/react-query`, same versions EmDash uses) and dedupe them in
`astro.config.mjs`:

```js
vite: {
	optimizeDeps: { include: ["react", "react-dom", "@lingui/core", "@lingui/react"] },
	resolve: {
		dedupe: ["react", "react-dom", "@lingui/core", "@lingui/react",
			"@tanstack/react-query", "@emdash-cms/admin", "@cloudflare/kumo", "emdash"],
	},
},
```

## Checks

Run before pushing (CI runs the same):

```bash
pnpm typecheck
pnpm test
pnpm build      # the package ships dist/: commit it when it changes
```

## Pull requests

- Branch from `main`; one topic per PR.
- Fill in the PR template. Any change to the builder UI needs before/after screenshots.
- Add tests for behaviour you change (`src/**/*.test.ts(x)`, Vitest + jsdom).
- Commit messages: an imperative subject, and a body that explains **why**.
- Value fields (colors, lengths, shadows…) follow the conventions in
  [`.claude/rules/`](.claude/rules/): one control per kind, validated with the same
  functions the renderer uses.
- Never interpolate a stored value into CSS or HTML without its validator in
  `src/render/styles.ts`.

For a larger change, open an issue first so we can agree on the approach.

## Docs

Design notes, the data contract and the dev log live in [`docs/`](docs/). Some of them are
in Spanish; English contributions are welcome everywhere.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
