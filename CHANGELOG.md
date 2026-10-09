# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). While in `0.x`, the data format and the API
may change between minor versions.

## [Unreleased]

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
