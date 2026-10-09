import * as emdash from "emdash";
import { PluginDescriptor } from "emdash";

//#region src/plugin-id.d.ts
/**
 * Plugin identity constants.
 *
 * Kept in their own module so the admin entrypoint does not import the server
 * entrypoint (which pulls in `emdash` and would drag the runtime into the
 * browser bundle).
 */
declare const PLUGIN_ID = "builderdash";
declare const PLUGIN_VERSION = "0.1.0";
//#endregion
//#region src/index.d.ts
interface BuilderdashOptions {
  /**
   * @deprecated Ignored. The schema decides where the builder is available:
   * any collection that declares the `builder_layout` field. Kept so existing
   * `builderdashPlugin({ collection: "pages" })` calls still type-check.
   */
  collection?: string;
}
/** Build-time descriptor. Astro imports this while evaluating its config. */
declare function builderdashPlugin(options?: BuilderdashOptions): PluginDescriptor<BuilderdashOptions>;
/** Runtime definition. EmDash imports `createPlugin` by name. */
declare function createPlugin(options?: BuilderdashOptions): emdash.ResolvedPlugin<emdash.PluginStorageConfig>;
/**
 * Libraries the builder's admin code shares with EmDash's admin. They must be
 * ONE instance: the builder's hooks read the admin's providers (Lingui's
 * I18nProvider, React Query's QueryClientProvider).
 *
 * EmDash pre-bundles `@emdash-cms/admin` for the browser, and that bundle
 * inlines these libraries. The builder's admin module is served as source, so
 * without this it would import a second copy and fail with "useLingui hook was
 * used without I18nProvider". Listing them through EmDash's own dependency
 * path gives each its own pre-bundled entry, used by both.
 */
declare const SHARED_ADMIN_DEPS: readonly ["emdash > @emdash-cms/admin > @lingui/core", "emdash > @emdash-cms/admin > @lingui/react", "emdash > @emdash-cms/admin > @tanstack/react-query", "emdash > @emdash-cms/admin > @cloudflare/kumo"];
/** The subset of Astro's integration shape this needs (no runtime dependency on Astro). */
interface AstroIntegrationLike {
  name: string;
  hooks: {
    "astro:config:setup": (params: {
      updateConfig: (config: {
        vite: {
          optimizeDeps: {
            include: string[];
          };
        };
      }) => unknown;
    }) => void;
  };
}
/**
 * Astro integration that makes the builder share the admin's libraries (see
 * `SHARED_ADMIN_DEPS`). Register it next to `emdash()`:
 *
 *   integrations: [react(), builderdash(), emdash({ plugins: [builderdashPlugin()] })]
 */
declare function builderdash(): AstroIntegrationLike;
//#endregion
export { BuilderdashOptions, PLUGIN_ID, PLUGIN_VERSION, SHARED_ADMIN_DEPS, builderdash, builderdashPlugin, createPlugin, createPlugin as default };