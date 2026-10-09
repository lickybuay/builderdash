# Template System — Design Document

> Estado: implementado. Este documento es el diseño original; la sección
> **Estado de implementación** al final refleja lo que existe hoy.

## Estado de implementación

- **Inserción**: copia de widgets (semántica "Saved Template" de Elementor),
  con opción "live reference" (`template_ref`) para partes repetidas.
- **Preview**: `src/pages/template-preview.astro` renderiza un template con el
  chrome real del sitio, leyendo el **draft** vía el API admin con la cookie del
  editor. El canvas del builder la usa para `collection=templates`.
- **Display conditions (parts)**: un template con `display_target` =
  `header`/`footer`/`sidebar` se renderiza en ese slot (`TemplatePart.astro` +
  `resolveTemplateParts` en `src/render/parts.ts`). Gana el más reciente.
- **Props**: `template_ref` quedó `internal` en el registry; el flujo activo es
  copia por defecto.


## Objetivo

Agregar un sistema de templates reutilizables estilo Elementor: crear composiciones de widgets una vez, guardarlas como templates, y reutilizarlas en cualquier página mediante un inserter con búsqueda y filtrado por categoría.

## Qué verifiqué

| Hallazgo | Archivo: línea |
|---|---|
| Colección `pages` con campo `content` (blocks) y `builder_layout` (nested blocks) | `seed/seed.json:655` |
| Dos capas de almacenamiento: `blocks` (contenido) + `json` (estilos) | `src/.../serialize.ts:49-52` |
| Árbol interno: `BuilderNode { key, type, props, style, children, parent }` | `src/.../tree.ts:14-27` |
| `content_ref` nodes apuntan a bloques del campo `content` de la página | `src/.../registry.ts:147-157` |
| Registry central para widgets: `WIDGETS[]` → palette, seed, defaults, render | `src/.../registry.ts:14-158` |
| `AdvancedValues` ya existe para `cssId`, `cssClasses`, `hide` | `src/.../tree.ts:59-65` |
| `blockTypeFor()` mapea `NodeType` → `builder_<type>` | `src/.../registry.ts:245-247` |
| `serializeTree` aplaná el árbol; `parent_key` reconstruye jerarquía | `src/.../serialize.ts:68-96` |

## Suposiciones

- `[SIN VERIFICAR]` La colección `templates` puede usar el mismo `blocks` field type que `builder_layout` para almacenar composiciones arbitrarias.
- `[SIN VERIFICAR]` `getEntryById()` y la API de EmDash permiten fetch de entries de cualquier colección desde el plugin.
- `[SIN VERIFICAR]` El renderizado de templates en el builder preview puede reutilizar `BuilderNode.astro` con los nodos del template.

## Ficheros a tocar

| Fichero | Acción |
|---|---|
| `seed/seed.json` | **Modificar** — Agregar colección `templates` |
| `src/schema/types.ts` | **Modificar** — Agregar `"template_ref"` a `NodeType` |
| `src/schema/registry.ts` | **Modificar** — Agregar widget `template_ref` |
| `src/editor/store/tree.ts` | **Modificar** — Permitir duplicados de `template_ref` |
| `src/editor/store/serialize.ts` | **Modificar** — Serializar `template_ref` |
| `src/editor/store/useBuilder.ts` | **Modificar** — Acción `insertTemplate` |
| `src/editor/template-inserter/TemplateInserter.tsx` | **Crear** — Modal del inserter |
| `src/editor/template-inserter/useTemplates.ts` | **Crear** — Hook de datos |
| `src/render/BuilderNode.astro` | **Modificar** — Renderizar `template_ref` |
| `src/editor/BuilderPage.tsx` | **Modificar** — Botón inserter + "Save as Template" |
| `src/editor/palette/TemplatePaletteItem.tsx` | **Crear** — Item en palette |
| `src/editor/save-as-template/SaveAsTemplateModal.tsx` | **Crear** — Guardar canvas como template |
| `emdash-env.d.ts` | **Auto-generado** — Tipos para colección `templates` |

## Diseño técnico

### 1. Colección `templates` en seed.json

```json
{
  "collections": [
    {
      "name": "templates",
      "label": "Templates",
      "fields": [
        { "slug": "title", "type": "string", "required": true },
        { "slug": "category", "type": "select", "options": ["Marketing", "Layout", "CTA", "Testimonials", "Pricing", "FAQ", "General"], "defaultValue": "General" },
        { "slug": "content", "type": "blocks", "allowedTypes": ["builder_container", "builder_heading", "builder_text", "builder_image", "builder_button", "builder_divider", "builder_content_ref", "builder_template_ref"] },
        { "slug": "css_id", "type": "string", "validation": { "pattern": "^[a-z][a-z0-9_-]*$" } },
        { "slug": "css_classes", "type": "text" },
        { "slug": "display_target", "type": "select", "options": ["anywhere", "page_content", "header", "footer", "sidebar"], "defaultValue": "anywhere" }
      ]
    }
  ]
}
```

- `content`: almacena la composición serializada (mismo formato que `builder_layout`).
- `css_id` / `css_classes`: atributos que se escriben en el wrapper del template al renderizar.
- `display_target`: campo reservado para display conditions futuros. El valor `anywhere` permite insertar en cualquier contexto. `header`/`footer`/`sidebar` se activarán cuando se implementen las condiciones de display.
- `category`: filtrado en el inserter.

### 2. Node type `template_ref`

```typescript
// types.ts
export type NodeType =
  | "container" | "content_ref" | "heading" | "text" | "image"
  | "button" | "divider" | "template_ref";
```

```typescript
// registry.ts — nuevo widget
{
  type: "template_ref",
  label: "Template",
  icon: "squares",
  category: "Content",
  topLevel: true,
  container: true,
  accepts: ["container", "heading", "text", "image", "button", "divider"],
  fields: [
    { slug: "ref_id", label: "Template", type: "string", required: true },
    { slug: "css_id", label: "CSS ID", type: "string" },
    { slug: "css_classes", label: "CSS Classes", type: "string" },
  ],
}
```

- `ref_id`: ULID del template en la colección `templates`.
- `css_id` / `css_classes`: override del template base. Se combinan con los del template.
- `container: true` + `accepts`: permite anidar widgets dentro del template (como un container).

### 3. Inserción de templates

```typescript
// useBuilder.ts — nueva acción
interface BuilderActions {
  // ... existentes
  insertTemplate: (templateId: string, parentKey: string | null, index?: number) => string | null;
  saveAsTemplate: (title: string, category: string) => string | null;
}
```

`insertTemplate`:
1. Fetch del template por `ref_id` desde la colección `templates`.
2. Deserializar su `content` en `BuilderNode[]` usando `deserializeEntry`.
3. Clonar nodos con nuevas keys (`cloneWithNewKeys`).
4. Insertar en el árbol en la posición del drop target.
5. Crear un `template_ref` node que referencia el template original.

`saveAsTemplate`:
1. Serializar el árbol actual (o selección actual) con `serializeTree`.
2. Crear un entry en la colección `templates` con `title`, `category`, `content`, `css_id`, `css_classes`.
3. Retornar el ULID del template creado.

### 4. Template Inserter (UI)

Modal de tres secciones:
- **Barra superior**: campo de búsqueda + filtro de categoría + botón "New template".
- **Grid de templates**: cards con thumbnail (preview renderizada), título, categoría.
- **Panel lateral** (cuando se crea uno nuevo): título, categoría, css_id, css_classes, botón "Save".

El thumbnail se genera renderizando el contenido del template en un iframe oculto.

### 5. Renderizado

En `BuilderNode.astro`:

```astro
{#if node.type === "template_ref"}
  <div
    id={node.props.css_id ?? template.css_id}
    class={[
      "bd-template",
      `bd-template-${template.category}`,
      node.props.css_classes,
      template.css_classes,
    ].filter(Boolean).join(" ")}
    data-template-id={node.props.ref_id}
    data-template-category={template.category}
  >
    {#for { key, index } of templateNodes}
      <BuilderNode node={key} />
    {/for}
  </div>
{/if}
```

Atributos `data-*` para targeting CSS:
- `data-template-id` — ULID único del template
- `data-template-category` — categoría del template
- `data-template-name` — slug derivado del título

### 6. Extensibilidad para display conditions

El campo `display_target` en la colección `templates` está reservado. Cuando se implementen display conditions:

- Se agregará una nueva colección `display_conditions` con reglas (`page_url`, `post_type`, `device`, etc.).
- Se asociarán templates a condiciones vía una relación many-to-many.
- `display_target` pasará de ser un select simple a un campo que indica el contexto predeterminado.
- El renderizado en el frontend leerá las condiciones activas y aplicará el template correspondiente.

## Pasos de implementación

### Paso 1 — Schema (seed.json)
- Agregar colección `templates` con campos: `title`, `category`, `content` (blocks), `css_id`, `css_classes`, `display_target`.
- Regenerar tipos con `pnpm dev` (o `npx emdash types`).

### Paso 2 — Node type `template_ref`
- Agregar `"template_ref"` a `NodeType` en `types.ts`.
- Agregar widget `template_ref` al registry con campos `ref_id`, `css_id`, `css_classes`.
- Agregar bloques `builder_template_ref` al `allowedTypes` de `builder_layout` en seed.json.

### Paso 3 — Serialización
- `serializeTree`: serializar `template_ref` como block con `ref_id`, `css_id`, `css_classes`.
- `deserializeEntry`: reconstruir `template_ref` nodes con props.
- `tree.ts`: permitir duplicados de `template_ref` (a diferencia de `content_ref` que solo se permite una vez).

### Paso 4 — Hook de datos `useTemplates`
- Fetch de templates desde la colección `templates`.
- Funciones: `listTemplates()`, `getTemplate(id)`, `createTemplate(data)`, `updateTemplate(id, data)`, `deleteTemplate(id)`.
- Cache con EmDash's `WithCacheHint`.

### Paso 5 — Template Inserter modal
- Crear `TemplateInserter.tsx` con búsqueda y filtrado.
- Grid de cards con preview.
- Integrar en `BuilderPage.tsx` como botón en el toolbar.

### Paso 6 — Inserción en el builder
- `insertTemplate` en `useBuilder.ts`: fetch → deserializar → clonar → insertar.
- Drag & drop desde palette → `insertTemplate`.
- Selección desde modal → `insertTemplate`.

### Paso 7 — Save as Template
- `saveAsTemplate` en `useBuilder.ts`: serializar → crear entry en `templates`.
- Modal `SaveAsTemplateModal.tsx` para título, categoría, css.
- Botón en toolbar o details panel.

### Paso 8 — Renderizado
- `BuilderNode.astro`: renderizar `template_ref` con wrapper, CSS attributes, `data-*` attributes.
- Resolver template por `ref_id` y renderizar sus nodos hijos.

### Paso 9 — Palette item
- `TemplatePaletteItem.tsx`: item en la paleta que abre el inserter al hacer click/drag.

### Paso 10 — Tests + Verificación
- Unit tests: `insertTemplate`, `saveAsTemplate`, `serializeTree` con `template_ref`.
- Verificar en el builder: insertar template, editar, guardar, re-renderizar.

## Preguntas

1. ¿Querés que el template insertado sea una **copia estática** (cada página tiene sus propios nodos) o **vinculado** (cambios al template original se propagan)? Empezaría con copia estática y agregar vinculación después.
2. ¿El inserter de templates debe estar disponible solo en el builder o también en el editor de contenido normal?
3. ¿Querés que incluya un seed template de ejemplo (un hero template, un pricing template)?
