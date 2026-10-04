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
//#endregion
export { BuilderdashOptions, PLUGIN_ID, PLUGIN_VERSION, builderdashPlugin, createPlugin, createPlugin as default };