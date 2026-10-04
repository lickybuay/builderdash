import { definePlugin } from "emdash";

//#region src/plugin-id.ts
/**
* Plugin identity constants.
*
* Kept in their own module so the admin entrypoint does not import the server
* entrypoint (which pulls in `emdash` and would drag the runtime into the
* browser bundle).
*/
const PLUGIN_ID = "builderdash";
const PLUGIN_VERSION = "0.1.0";

//#endregion
//#region src/index.ts
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
/** Build-time descriptor. Astro imports this while evaluating its config. */
function builderdashPlugin(options = {}) {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: "@lickybuay/builderdash",
		adminEntry: "@lickybuay/builderdash/admin",
		options
	};
}
/** Runtime definition. EmDash imports `createPlugin` by name. */
function createPlugin(options = {}) {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		capabilities: ["content:read"],
		admin: { entry: "@lickybuay/builderdash/admin" }
	});
}

//#endregion
export { PLUGIN_ID, PLUGIN_VERSION, builderdashPlugin, createPlugin, createPlugin as default };