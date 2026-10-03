#!/usr/bin/env bash
#
# Builderdash quick install.
#
# Run from the root of an EmDash site. It:
#   1. installs the package (skipped when it is already a dependency),
#   2. registers the plugin in astro.config.*,
#   3. adds the builder fields and block type to the seed (creating the seed
#      with a `pages` collection when the site has none, e.g. the blank
#      template),
#   4. validates the seed with the EmDash CLI.
#
# Every step is idempotent: running it twice changes nothing the second time.
# Files are backed up as <file>.builderdash.bak before they are modified.

set -euo pipefail

PACKAGE="@lickybuay/builderdash"
SOURCE="${BUILDERDASH_SOURCE:-github:lickybuay/builderdash}"
COLLECTIONS="pages,posts"

SKIP_INSTALL=0
APPLY_SCHEMA=0
WITH_RENDER=0
BLOCKS_COMPONENT=""

usage() {
	cat <<EOF
Usage: install.sh [options]

Run from the root of an EmDash site.

Options:
  --collections=a,b  Collections to enable the builder on (default: pages,posts).
                     Only those present in the seed are used.
  --skip-install     Do not install the package (configure only).
  --with-render[=path]
                     Create src/pages/builder-render.astro, the route the live
                     preview uses to re-render edited content blocks. path is
                     the component that renders the content blocks
                     (auto-detected: src/components/MarketingBlocks.astro).
  --apply-schema     Also apply the seed schema to the local database
                     (emdash seed --no-content). Writes to the database.
  -h, --help         Show this help.

Environment:
  BUILDERDASH_SOURCE  Package source (default: github:lickybuay/builderdash).
EOF
}

while [ $# -gt 0 ]; do
	case "$1" in
		--collections=*) COLLECTIONS="${1#*=}" ;;
		--collections)
			[ $# -ge 2 ] || { echo "--collections needs a value" >&2; exit 1; }
			COLLECTIONS="$2"; shift ;;
		--skip-install) SKIP_INSTALL=1 ;;
		--with-render) WITH_RENDER=1 ;;
		--with-render=*) WITH_RENDER=1; BLOCKS_COMPONENT="${1#*=}" ;;
		--apply-schema) APPLY_SCHEMA=1 ;;
		-h | --help) usage; exit 0 ;;
		*) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
	esac
	shift
done

info() { printf '\033[36m›\033[0m %s\n' "$1"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!\033[0m %s\n' "$1" >&2; }
fail() { printf '\033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

# --- Preflight ---------------------------------------------------------------

command -v node >/dev/null 2>&1 || fail "Node.js is required."
[ -f package.json ] || fail "No package.json here. Run this from the root of your EmDash site."
grep -q '"emdash"' package.json || fail "This does not look like an EmDash site (no \"emdash\" dependency in package.json)."

CONFIG=""
for candidate in astro.config.mjs astro.config.ts astro.config.mts astro.config.js; do
	if [ -f "$candidate" ]; then CONFIG="$candidate"; break; fi
done
[ -n "$CONFIG" ] || fail "No astro.config.* found."

# The seed path comes from package.json ("emdash": { "seed": ... }) when set.
SEED="$(node -e '
	const pkg = require("./package.json");
	process.stdout.write((pkg.emdash && pkg.emdash.seed) || "seed/seed.json");
')"
SEED_CREATED=0
if [ ! -f "$SEED" ]; then
	# Sites without a seed (the blank template) get one created in step 3.
	SEED="seed/seed.json"
	SEED_CREATED=1
fi

# Fail before touching anything when no requested collection exists.
if [ "$SEED_CREATED" -eq 0 ]; then
	SEED="$SEED" COLLECTIONS="$COLLECTIONS" node -e '
		const seed = JSON.parse(require("node:fs").readFileSync(process.env.SEED, "utf8"));
		const present = (seed.collections || []).map((c) => c.slug);
		const wanted = process.env.COLLECTIONS.split(",").map((s) => s.trim()).filter(Boolean);
		if (!wanted.some((slug) => present.includes(slug))) {
			console.error(`None of the requested collections (${wanted.join(", ")}) exist in ${process.env.SEED}.`);
			console.error(`Seed collections: ${present.join(", ") || "none"}. Use --collections=<slug>.`);
			process.exit(1);
		}
	' || fail "Nothing to enable the builder on."
fi

if [ -f pnpm-lock.yaml ]; then PM="pnpm"
elif [ -f yarn.lock ]; then PM="yarn"
else PM="npm"; fi

# --- 1. Install --------------------------------------------------------------

if [ "$SKIP_INSTALL" -eq 1 ]; then
	info "Skipping install (--skip-install)."
elif grep -q "\"$PACKAGE\"" package.json; then
	ok "$PACKAGE is already a dependency."
else
	info "Installing $PACKAGE with ${PM}…"
	case "$PM" in
		pnpm) pnpm add "$SOURCE" ;;
		yarn) yarn add "$SOURCE" ;;
		npm) npm install "$SOURCE" ;;
	esac
	ok "Installed $PACKAGE."
fi

if ! grep -q '"@astrojs/react"' package.json; then
	warn "@astrojs/react is not installed. The builder needs it: run 'npx astro add react'."
fi

# --- 2. astro.config ---------------------------------------------------------

info "Registering the plugin in ${CONFIG}…"
CONFIG="$CONFIG" PACKAGE="$PACKAGE" node <<'NODE'
const fs = require("node:fs");
const file = process.env.CONFIG;
const pkg = process.env.PACKAGE;
const call = "builderdashPlugin()";
let src = fs.readFileSync(file, "utf8");

if (/\bbuilderdashPlugin\b/.test(src)) {
	console.log("  already registered, nothing to do.");
	process.exit(0);
}

const manual = () => {
	console.error(
		`  Could not find an emdash({ ... }) call in ${file}.\n` +
			`  Add it manually (see "Manual configure" in the README).`,
	);
	process.exit(2);
};

// Locate the object literal passed to emdash(...).
const start = src.search(/\bemdash\(\s*\{/);
if (start === -1) manual();
const open = src.indexOf("{", start);

// Find the matching closing brace, skipping strings and comments.
let depth = 0;
let close = -1;
for (let i = open; i < src.length; i++) {
	const ch = src[i];
	if (ch === '"' || ch === "'" || ch === "`") {
		for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === "\\") i++;
		continue;
	}
	if (ch === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i === -1) break; continue; }
	if (ch === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
	if (ch === "{") depth++;
	if (ch === "}" && --depth === 0) { close = i; break; }
}
if (close === -1) manual();

const body = src.slice(open, close);
const plugins = /plugins\s*:\s*\[/.exec(body);
if (plugins) {
	// Prepend to the existing plugins array.
	const at = open + plugins.index + plugins[0].length;
	const empty = /^\s*\]/.test(src.slice(at));
	src = src.slice(0, at) + call + (empty ? "" : ", ") + src.slice(at);
} else {
	// Add a plugins key as the first property, matching the next line's indent.
	const indent = (/\n([ \t]+)/.exec(src.slice(open)) || [, "\t\t\t"])[1];
	src = src.slice(0, open + 1) + `\n${indent}plugins: [${call}],` + src.slice(open + 1);
}

// Import after the last top-level import statement.
const imports = [...src.matchAll(/^import\b[\s\S]*?;[ \t]*$/gm)];
const line = `import { builderdashPlugin } from "${pkg}";\n`;
if (imports.length > 0) {
	const last = imports[imports.length - 1];
	const at = last.index + last[0].length + 1;
	src = src.slice(0, at) + line + src.slice(at);
} else {
	src = line + src;
}

fs.copyFileSync(file, `${file}.builderdash.bak`);
fs.writeFileSync(file, src);
console.log("  registered.");
NODE
ok "$CONFIG configured."

# --- 3. Seed -----------------------------------------------------------------

if [ "$SEED_CREATED" -eq 1 ]; then
	info "No seed found: creating $SEED with a pages collection…"
else
	info "Adding the builder schema to ${SEED}…"
fi
TOUCHED_FILE="$(mktemp)"
trap 'rm -f "$TOUCHED_FILE"' EXIT
SEED="$SEED" SEED_CREATED="$SEED_CREATED" COLLECTIONS="$COLLECTIONS" TOUCHED_FILE="$TOUCHED_FILE" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const file = process.env.SEED;
const created = process.env.SEED_CREATED === "1";
const wanted = process.env.COLLECTIONS.split(",").map((s) => s.trim()).filter(Boolean);

const fields = [
	{
		slug: "builder_layout",
		label: "Builder layout",
		type: "blocks",
		validation: { allowedTypes: ["builder_container", "builder_content_ref"], maxItems: 100 },
	},
	{ slug: "builder_styles", label: "Builder styles", type: "json" },
];

const parentField = { slug: "parent_key", label: "Parent", type: "string", validation: { maxLength: 32 } };

const blockTypes = [{
	slug: "builder_container",
	label: "Container",
	description: "A layout container nested by the Builderdash page builder",
	category: "Builder",
	currentVersion: 1,
	versions: [
		{
			version: 1,
			fields: [
				{ slug: "gap", label: "Gap", type: "select", defaultValue: "md",
					validation: { options: ["none", "sm", "md", "lg"] } },
				{ slug: "direction", label: "Direction", type: "select", defaultValue: "column",
					validation: { options: ["column", "row"] } },
				parentField,
			],
		},
	],
}, {
	// Places one of the entry's existing content blocks in the layout.
	slug: "builder_content_ref",
	label: "Content block",
	description: "Places one of the entry's content blocks in the Builderdash layout",
	category: "Builder",
	currentVersion: 1,
	versions: [
		{
			version: 1,
			fields: [
				{ slug: "ref_key", label: "Content block", type: "string", validation: { maxLength: 64 } },
				parentField,
			],
		},
	],
}];

let raw = "";
let seed;
if (created) {
	// Same shape as the starter template's pages collection.
	seed = {
		$schema: "https://emdashcms.com/seed.schema.json",
		version: "1",
		collections: [
			{
				slug: "pages",
				label: "Pages",
				labelSingular: "Page",
				urlPattern: "/{slug}",
				supports: ["drafts", "revisions", "preview", "search", "seo"],
				fields: [{ slug: "title", label: "Title", type: "string", required: true }],
			},
		],
	};
} else {
	raw = fs.readFileSync(file, "utf8");
	seed = JSON.parse(raw);
}

const present = (seed.collections || []).map((c) => c.slug);
const targets = wanted.filter((slug) => present.includes(slug));
for (const slug of wanted) {
	if (!present.includes(slug)) console.log(`  skipped "${slug}": not in the seed.`);
}
if (targets.length === 0) {
	console.error(
		`  None of the requested collections (${wanted.join(", ")}) exist in the seed.\n` +
			`  Seed collections: ${present.join(", ") || "none"}. Use --collections=<slug>.`,
	);
	process.exit(2);
}

let changed = 0;
for (const slug of targets) {
	const collection = seed.collections.find((c) => c.slug === slug);
	collection.fields = collection.fields || [];
	for (const field of fields) {
		const existing = collection.fields.find((f) => f.slug === field.slug);
		if (!existing) {
			collection.fields.push(field);
			changed++;
			continue;
		}
		// Older installs only allowed containers in the layout.
		const allowed = existing.validation?.allowedTypes;
		const wanted = field.validation?.allowedTypes;
		if (Array.isArray(allowed) && Array.isArray(wanted)) {
			const missingTypes = wanted.filter((type) => !allowed.includes(type));
			if (missingTypes.length > 0) {
				existing.validation.allowedTypes = [...allowed, ...missingTypes];
				changed++;
			}
		}
	}
}

seed.blockTypes = seed.blockTypes || [];
for (const blockType of blockTypes) {
	if (seed.blockTypes.some((b) => b.slug === blockType.slug)) continue;
	seed.blockTypes.push(blockType);
	changed++;
}

fs.writeFileSync(process.env.TOUCHED_FILE, targets.join(", "));

if (changed === 0) {
	console.log("  already present, nothing to do.");
	process.exit(0);
}

// Like JSON.stringify(value, null, indent), but a small object or array that
// fits on one line stays on one line, as the templates write them, so the
// diff shows the builder's additions and not a reformatted file.
function formatJson(value, indent, depth = 0) {
	const inline = JSON.stringify(value);
	const pad = indent.repeat(depth);
	if (value === null || typeof value !== "object") return inline;
	const nested = Object.values(value).some((child) => child && typeof child === "object" && Object.keys(child).length > 0);
	if (!nested && pad.length + inline.length <= 100) {
		return Array.isArray(value)
			? "[" + value.map((item) => JSON.stringify(item)).join(", ") + "]"
			: "{ " + Object.entries(value).map(([key, item]) => JSON.stringify(key) + ": " + JSON.stringify(item)).join(", ") + " }";
	}
	const inner = indent.repeat(depth + 1);
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		return "[\n" + value.map((item) => inner + formatJson(item, indent, depth + 1)).join(",\n") + "\n" + pad + "]";
	}
	const entries = Object.entries(value);
	if (entries.length === 0) return "{}";
	return "{\n" + entries.map(([key, item]) => inner + JSON.stringify(key) + ": " + formatJson(item, indent, depth + 1)).join(",\n") + "\n" + pad + "}";
}

// Keep the file's indentation style (tabs for a new file, like the templates).
const indent = created || /\n\t/.test(raw) ? "\t" : ((/\n( +)\S/.exec(raw) || [, "  "])[1]);
if (created) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
} else {
	fs.copyFileSync(file, `${file}.builderdash.bak`);
}
fs.writeFileSync(file, formatJson(seed, indent) + "\n");
console.log(`  added ${changed} item(s) to: ${targets.join(", ")}.`);
NODE
TOUCHED="$(cat "$TOUCHED_FILE")"

if [ "$SEED_CREATED" -eq 1 ]; then
	# Point EmDash at the new seed, the way the official templates do.
	SEED="$SEED" node <<'NODE'
const fs = require("node:fs");
const raw = fs.readFileSync("package.json", "utf8");
const pkg = JSON.parse(raw);
if (!pkg.emdash || pkg.emdash.seed !== process.env.SEED) {
	pkg.emdash = { ...(pkg.emdash || {}), seed: process.env.SEED };
	const indent = /\n\t/.test(raw) ? "\t" : ((/\n( +)\S/.exec(raw) || [, "  "])[1]);
	fs.copyFileSync("package.json", "package.json.builderdash.bak");
	fs.writeFileSync("package.json", JSON.stringify(pkg, null, indent) + "\n");
	console.log(`  package.json now points emdash.seed at ${process.env.SEED}.`);
}
NODE
fi
ok "$SEED updated (builder enabled on: ${TOUCHED})."

# --- 3b. Live render route (optional) ----------------------------------------

if [ "$WITH_RENDER" -eq 1 ]; then
	ROUTE="src/pages/builder-render.astro"
	if [ -f "$ROUTE" ]; then
		ok "$ROUTE already exists, left untouched."
	else
		# The template ships next to this script (resolved through the bin link).
		SCRIPT_PATH="$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$0")"
		TEMPLATE="$(dirname "$SCRIPT_PATH")/templates/builder-render.astro"
		[ -f "$TEMPLATE" ] || fail "Render route template not found at $TEMPLATE."

		if [ -z "$BLOCKS_COMPONENT" ]; then
			for candidate in src/components/MarketingBlocks.astro src/components/Blocks.astro; do
				if [ -f "$candidate" ]; then BLOCKS_COMPONENT="$candidate"; break; fi
			done
		fi
		if [ -z "$BLOCKS_COMPONENT" ] || [ ! -f "$BLOCKS_COMPONENT" ]; then
			warn "No blocks component found. Re-run with --with-render=src/components/YourBlocks.astro"
			warn "(the component that renders the entry's content blocks), or copy"
			warn "$TEMPLATE by hand."
		else
			info "Creating ${ROUTE}…"
			ROUTE="$ROUTE" TEMPLATE="$TEMPLATE" BLOCKS_COMPONENT="$BLOCKS_COMPONENT" SEED="$SEED" \
				COLLECTIONS="$TOUCHED" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { ROUTE, TEMPLATE, BLOCKS_COMPONENT, SEED, COLLECTIONS } = process.env;

// Block types the route may render: the `content` field's allowedTypes on
// the collections the builder was enabled on.
const seed = JSON.parse(fs.readFileSync(SEED, "utf8"));
const wanted = COLLECTIONS.split(",").map((s) => s.trim());
const types = new Set();
for (const collection of seed.collections || []) {
	if (!wanted.includes(collection.slug)) continue;
	for (const field of collection.fields || []) {
		if (field.slug === "builder_layout" || field.type !== "blocks") continue;
		for (const type of field.validation?.allowedTypes || []) types.add(type);
	}
}

let importPath = path.relative(path.dirname(ROUTE), BLOCKS_COMPONENT).split(path.sep).join("/");
if (!importPath.startsWith(".")) importPath = `./${importPath}`;

const source = fs
	.readFileSync(TEMPLATE, "utf8")
	.replace(/^import Blocks from ".*"; \/\/ builderdash:blocks-import$/m,
		`import Blocks from ${JSON.stringify(importPath)}; // builderdash:blocks-import`)
	.replace(/^const BLOCK_TYPES = new Set\(\[.*\]\); \/\/ builderdash:block-types$/m,
		`const BLOCK_TYPES = new Set(${JSON.stringify([...types])}); // builderdash:block-types`);

fs.mkdirSync(path.dirname(ROUTE), { recursive: true });
fs.writeFileSync(ROUTE, source);
console.log(`  renders ${types.size} block type(s) with ${importPath}.`);
NODE
			ok "$ROUTE created."
		fi
	fi
fi

# --- 4. Validate / apply -----------------------------------------------------

if [ -x node_modules/.bin/emdash ]; then
	info "Validating the seed…"
	node_modules/.bin/emdash seed "$SEED" --validate
	ok "Seed is valid."

	if [ "$APPLY_SCHEMA" -eq 1 ]; then
		info "Applying the schema to the local database…"
		node_modules/.bin/emdash seed "$SEED" --no-content
		ok "Schema applied."
	fi
else
	warn "EmDash CLI not found in node_modules; skipped seed validation."
fi

# --- Done --------------------------------------------------------------------

if [ "$SEED_CREATED" -eq 1 ] && [ "$APPLY_SCHEMA" -eq 0 ]; then
	warn "A new seed was created. If this site is already set up (it has a database),"
	warn "the seed is NOT applied automatically: re-run with --apply-schema."
fi

cat <<EOF

Builderdash is installed on: ${TOUCHED}.

Next:
EOF
if [ "$APPLY_SCHEMA" -eq 0 ]; then
	if [ -f data.db ]; then
		echo "  - This site already has a database: the seed is only applied on first setup."
	else
		echo "  - New site: the seed is applied when the dev server first starts. If the site"
		echo "    uses a database that is already set up (not data.db), apply it yourself:"
	fi
	echo "    npx emdash seed $SEED --no-content   (or re-run with --apply-schema)"
fi
cat <<EOF
  - Restart the dev server, open one of those collections in the admin and
    click "Edit with BuilderDash".
  - Render the layout on your site: see "Render on your site" in the README
    (BuilderLayout, header/footer, body classes).
EOF
if [ "$WITH_RENDER" -eq 0 ]; then
	echo "  - Re-run with --with-render to create the live render route."
fi
echo "  - Backups of modified files end in .builderdash.bak."
