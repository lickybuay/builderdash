/**
 * Plugin descriptor and runtime definition.
 *
 * The descriptor is build-time metadata Astro imports; `createPlugin()` runs
 * when EmDash initializes and returns the resolved plugin.
 *
 * This plugin is NATIVE on purpose. The builder needs a React admin surface,
 * which a sandboxed plugin cannot provide: sandboxed admin pages are Block Kit
 * JSON, never React.
 */

import { definePlugin } from "emdash";
import type { PluginDescriptor } from "emdash";

import { PLUGIN_ID, PLUGIN_VERSION } from "./plugin-id";

export interface BuilderdashOptions {
	/**
	 * @deprecated Ignored. The schema decides where the builder is available:
	 * any collection that declares the `builder_layout` field. Kept so existing
	 * `builderdashPlugin({ collection: "pages" })` calls still type-check.
	 */
	collection?: string;
}

export { PLUGIN_ID, PLUGIN_VERSION };

/** Build-time descriptor. Astro imports this while evaluating its config. */
export function builderdashPlugin(
	options: BuilderdashOptions = {},
): PluginDescriptor<BuilderdashOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: "@lickybuay/builderdash",
		adminEntry: "@lickybuay/builderdash/admin",
		options,
	};
}

/** Runtime definition. EmDash imports `createPlugin` by name. */
export function createPlugin(options: BuilderdashOptions = {}) {
	void options;

	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		capabilities: ["content:read"],
		admin: {
			entry: "@lickybuay/builderdash/admin",
			// No `pages` entry: the builder edits one entry at a time and is opened
			// from the content list ("Edit with BuilderDash"), so it has no place
			// in the sidebar. The route comes from the admin module's `pages` map.
		},
	});
}

export default createPlugin;
