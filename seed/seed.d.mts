//#region src/schema/seed.d.ts
/**
 * The seed schema the builder needs, generated from the widget registry.
 *
 * EmDash only stores block types the seed declares: a widget missing here can
 * be added in the builder but never saved ("block type … is unavailable").
 * Generating the seed from `WIDGETS` keeps every widget storable, and is what
 * `builderdash-setup` writes into a site's `seed/seed.json` (it imports this
 * module from `seed/seed.mjs`, so it has no runtime dependencies).
 */
/** A field of an EmDash seed block type. */
interface SeedField {
  slug: string;
  label: string;
  type: string;
  defaultValue?: unknown;
  validation?: Record<string, unknown>;
}
interface SeedBlockType {
  slug: string;
  label: string;
  description?: string;
  category: string;
  currentVersion: number;
  versions: Array<{
    version: number;
    fields: SeedField[];
  }>;
}
interface BuilderSeedSchema {
  /** Fields every buildable collection gets. */
  fields: Array<Record<string, unknown>>;
  /** One block type per widget. */
  blockTypes: SeedBlockType[];
}
/**
 * Seed fields and block types for the builder. `includeContentRef: false` is
 * for a collection whose entries have no content blocks of their own to place
 * (templates).
 */
declare function builderSeedSchema(options?: {
  includeContentRef?: boolean;
}): BuilderSeedSchema;
//#endregion
export { BuilderSeedSchema, SeedBlockType, SeedField, builderSeedSchema };