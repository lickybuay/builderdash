# 02 — Data contract

This is **the most important document in the project**. It defines what a page looks
like on the inside. Everything else (editor, render, migrations) derives from here.

If anything in this contract changes, it must be noted in the dev log and
`01-decisions.md` must be reviewed.

---

## The in-memory tree

The editor works with a tree. It is serialized into two layers on save and
deserialized on load.

```ts
type NodeType =
  | "section"     // top-level container, has columns
  | "column"      // column inside a section
  | "heading"
  | "text"
  | "image"
  | "button"
  | "divider";

interface BuilderNode {
  /** Stable identity. It is the `_key` of the content layer. */
  key: string;
  type: NodeType;
  /** Content values → layer 1 (`blocks`). */
  props: Record<string, unknown>;
  /** Style values → layer 2 (`json`). */
  style: StyleByBreakpoint;
  /** Children, in order. Empty on leaf widgets. */
  children: BuilderNode[];
  /** `key` of the parent, or `null` at the root. Redundant but speeds up rendering. */
  parent: string | null;
}

/** Root: a flat array of sections, in order. */
type BuilderTree = BuilderNode[];
```

### Why `key` and not `_key`

In memory it is called `key` for brevity. On serialization it is written as `_key`, which is
the name EmDash requires on a stored block:

```json
{ "_type": "builder_heading", "_version": 1, "_key": "wid_b2", "text": "Hola" }
```

`_key` is also the link to the style layer. It is the only piece that joins the
two layers and that is why it is **never regenerated when editing**. It is generated
only once, when the node is created, and is preserved across saves, revisions and migrations.

---

## Layer 1 — Content (`blocks`)

Each node becomes a block. The node's `type` maps to a block type
with a `builder_` prefix:

| `NodeType` | Block `_type` |
| --- | --- |
| `container` | `builder_container` |

### The hierarchy CANNOT be stored with `_parent`

> **Corrected after testing against the real server.** The original design stored a
> `_parent` field on each block. **EmDash rejects it:**
>
> ```
> 400 VALIDATION_ERROR
> builder_layout[1]: Unrecognized key: "_parent"
> ```
>
> A stored block only allows `_type`, `_version`, `_key` and **the fields
> declared in its type's definition**. Any extra key fails schema validation.
> It is not configurable.

This forces us to **declare the hierarchy as a field of the block type itself**. Since
a block type does not allow `json` or `reference`, the parent pointer has to be an
explicitly declared field:

```json
{
  "slug": "parent_key",
  "label": "Parent",
  "type": "string"
}
```

And the stored block looks like this:

```json
[
  { "_type": "builder_container", "_version": 1, "_key": "a1", "gap": "md" },
  { "_type": "builder_container", "_version": 1, "_key": "b2", "gap": "md", "parent_key": "a1" }
]
```

### Why it is still a flat array

A `blocks` field is an ordered array, with no nesting. The structure is rebuilt by
grouping by `parent_key`, respecting the array order.

**The array order is the render order.** It is walked once and grouped by parent.

### Discarded alternative

Storing a `_children: ["b2", "c3"]` on each container. Discarded because it duplicates
information (the parent and children can get out of sync) and requires two writes to
move a node. One pointer, one write.

### Validation rules

- `parent_key` always points to an existing `_key` in the same array.
- A container without `parent_key` is at the root.
- Maximum depth: no explicit limit, but the editor bounds it when nesting.

---

## Layer 2 — Styles (`json`)

A flat object, with `_key` as the key and breakpoints inside.

```json
{
  "sec_a1": { "desktop": { "padding": { "t": "80", "r": "24", "b": "80", "l": "24" },
                           "background": "#ffffff" } },
  "wid_b2": { "desktop": { "typography": { "size": "48", "weight": "700", "lineHeight": "1.1" } },
              "tablet":  { "typography": { "size": "36" } },
              "mobile":  { "typography": { "size": "28" } } }
}
```

### Shape of the values

```ts
type Breakpoint = "desktop" | "tablet" | "mobile";

interface StyleByBreakpoint {
  desktop?: StyleValues;
  tablet?: StyleValues;
  mobile?: StyleValues;
}

// Settings that do not vary by device (the Inspector's "Extra" tab).
// It goes inside the same entry, under the fixed key `advanced`: the code that
// walks breakpoints uses the BREAKPOINTS list, never Object.keys.
interface AdvancedValues {
  cssId?: string;        // /^[A-Za-z][\w-]{0,63}$/
  cssClasses?: string;   // space-separated list, same regex
  zIndex?: string;       // integer
  hide?: { desktop?: boolean; tablet?: boolean; mobile?: boolean };
}

interface StyleValues {
  padding?:  { t?: string; r?: string; b?: string; l?: string };
  margin?:   { t?: string; r?: string; b?: string; l?: string };
  typography?: { size?: string; weight?: string; lineHeight?: string; align?: string };
  color?: string;
  background?: string;
  border?: { width?: string; radius?: string; color?: string };
  size?: { width?: string; maxWidth?: string; height?: string };
  [extra: string]: unknown;   // extensible without breaking the contract
}
```

Numeric values are stored **as a unitless string** (`"48"`, not `48` nor
`"48px"`). The `style-engine` decides the unit on emit. This allows using `rem`,
`%`, `px` or `clamp()` later without migrating the data.

### Identity of layer 2

The keys are the `_key`s from layer 1. A `_key` that does not exist in layer 1 is
**ignored on render and preserved on save** (this allows undo and avoids losing
data if a block type is temporarily removed).

---

## The widget registry (single source)

`schema/` declares each widget **only once**. From there come:

1. The left panel entry (label, icon, category).
2. The seed's block types (`builder_heading`, etc.).
3. The default `props` values when the widget is dropped.
4. The inspector controls (Milestone 3), generated from the fields.
5. The render (Milestone 2), which reads the same prop names.

```ts
interface WidgetField {
  slug: string;                    // prop name → block column
  label: string;
  type: "string" | "text" | "url" | "select" | "boolean" | "image" | "number";
  required?: boolean;
  options?: string[];              // for `select`
  default?: unknown;
}

interface WidgetDefinition {
  type: NodeType;
  label: string;                   // left panel label
  icon: string;                    // icon name from the admin's set
  category: string;                // grouping in the panel
  /** `true` if it accepts children (only `section` and `column` in Milestone 1). */
  container?: boolean;
  /** What it can contain: allowed child types. */
  accepts?: NodeType[];
  fields: WidgetField[];
}
```

**Hard rule:** if a field is not declared in `WidgetDefinition.fields`, it is not
stored in `props`. The inspector cannot invent props.

---

## Lifecycle of a piece of data

### When loading an entry

1. Read the `blocks` field → array of blocks.
2. Rebuild the tree by grouping by `_parent`, respecting the array order.
3. Read the `json` field → styles object.
4. Merge: each node gets `style = styles[node.key] ?? {}`.
5. If a layer 2 `_key` does not appear in layer 1, it is left orphaned but preserved.

### When saving

1. Walk the tree in depth order (sections, then their columns, then
   their widgets), emitting blocks with `_parent`.
2. Collect each node's `style` into the styles object.
3. **Reintroduce the orphaned styles** that were preserved in memory.
4. Write both layers in the same entry update.

### When moving a node

Only its `_parent` changes (and its position in the emit order). The styles are not
touched: they stay attached to the same `_key`. This is what makes dragging things
not lose the styling work.

### When deleting a node

The block **and its descendants** are deleted, and their layer 2 entries are removed.
To allow undo, the editor stores the complete entry (nodes + styles) in its
undo stack before applying the deletion.

---

## What is out of Milestone 1

Declared so it does not come as a surprise later:

- **There is no `repeater` in widgets yet.** A `repeater` inside a block is
  possible, but it is not needed until there are widgets that require it (Milestone 3+).
- **Styles are stored but barely rendered.** In Milestone 1 what matters is that the
  format exists and survives a save cycle. The visual engine is Milestone 4.
- **A single level of nesting.** Later milestones relax this without changing the
  contract, because the contract already supports arbitrary depth via `_parent`.


## Style rendering (Session 9)

- A single generator (`src/render/styles.ts`) produces the nodes' CSS, both
  on the site (`<style id="bd-styles">` in `BuilderLayout.astro`) and in the
  editor (`<style id="bd-live-styles">`, which replaces the server's).
- It only emits properties from a whitelist with validated values (lengths,
  colors, `var(--token)`); node keys must be alphanumeric; the
  result never contains `<`.
- Selectors: container → `[data-bd-container="k"]`; block → `[data-bd-key="k"]`,
  which is now a real `div.bd-element` (previously `display: contents`).
- Breakpoints: tablet ≤ 900 px, mobile ≤ 600 px (the template's cutoffs).
- Typography and text color only on `TEXT_STYLED_TYPES` (containers and, when
  they exist, text widgets).
- `__names` (node names) remains reserved in the same layer.
