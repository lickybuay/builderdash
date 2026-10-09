# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:
[Report a vulnerability](https://github.com/lickybuay/builderdash/security/advisories/new).

Include the steps to reproduce and the BuilderDash and EmDash versions. You will get an
answer as soon as possible; fixes are released before the details are made public.

## Scope

BuilderDash is a native plugin: it runs inside the EmDash site process with the site's
permissions. Especially relevant:

- **Stored values rendered as CSS or HTML** — styles, colors, custom CSS, CSS IDs and
  classes reach the public pages. Anything that escapes a declaration, a `<style>`
  element or an attribute is in scope.
- **The live preview** (`?_builder`, `/template-preview`) — edit mode must require a
  signed-in editor; a draft must never be served to anonymous visitors.
- **Admin routes and the builder clipboard** (`localStorage`) — data read back is
  untrusted.

## Supported versions

Only the latest release receives security fixes while the plugin is in alpha.
