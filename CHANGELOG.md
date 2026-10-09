# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). While in `0.x`, the data format and the API
may change between minor versions.

## [Unreleased]

### Added

- Template element: embed a saved template by reference, picked in the Inspector,
  shown in the canvas right away.
- Templates list: the title and pencil open the builder (`?native=1` keeps
  EmDash's editor); a new template shows a single Create button.
- `template-preview.astro` route, created by `builderdash-setup --with-render`.

### Fixed

- `builderdash-setup` declared only the container and content-block types, so a
  fresh site could not save headings, text, images, buttons, dividers or
  templates. The seed schema is now generated from the widget registry
  (`@lickybuay/builderdash/seed`).
- A template embedding itself (directly or through another) no longer loops the
  page render; nesting and expansions per page are capped.
- A template inside a container now renders; the canvas no longer hides an
  embedded template's content.
- `bodyClasses` no longer throws for a route without an entry.

## [0.1.0] - 2026-10-09

First public alpha.

### Added

- Live preview of the real page in an iframe, with desktop, tablet and mobile views.
- Drag and drop from the element list, inside the preview and in the Structure panel.
- Add in place: a "Drag widget here" area, a hover tab on containers (add above, drag,
  delete with confirmation) and a "+" in empty containers.
- Element context menu: Duplicate, Copy, Paste, Copy style, Paste style, Reset style,
  Delete, with keyboard shortcuts; clipboard shared across tabs.
- Inspector with one control per value kind: color picker, lengths with units and
  `calc()`/`clamp()`, linked spacing box, font weight, line height, box shadow builder,
  z-index; values inherited from wider devices shown as placeholders.
- Templates: blank canvas on "Add New", template parts, live template references.
- Site content blocks (Hero, FAQ, Pricing…) next to the builder's own widgets.
- `builderdash-setup` installer for the plugin registration and the seed fields.
- `builderdash()` Astro integration, so the builder shares EmDash's admin libraries
  when installed as a package.
