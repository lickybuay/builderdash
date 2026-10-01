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
	 * Collection the builder page edits. Defaults to `pages`, which is the
	 * collection the marketing template ships with.
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
		entrypoint: "@emdash/builderdash",
		adminEntry: "@emdash/builderdash/admin",
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
			entry: "@emdash/builderdash/admin",
			pages: [{ path: "/builder", label: "Builder", icon: "note-pencil" }],
		},
	});
}

export default createPlugin;
