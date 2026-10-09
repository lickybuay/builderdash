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
const SHARED_ADMIN_DEPS = [
	"emdash > @emdash-cms/admin > @lingui/core",
	"emdash > @emdash-cms/admin > @lingui/react",
	"emdash > @emdash-cms/admin > @tanstack/react-query",
	"emdash > @emdash-cms/admin > @cloudflare/kumo"
];
/**
* Astro integration that makes the builder share the admin's libraries (see
* `SHARED_ADMIN_DEPS`). Register it next to `emdash()`:
*
*   integrations: [react(), builderdash(), emdash({ plugins: [builderdashPlugin()] })]
*/
function builderdash() {
	return {
		name: "@lickybuay/builderdash",
		hooks: { "astro:config:setup": ({ updateConfig }) => {
			updateConfig({ vite: { optimizeDeps: { include: [...SHARED_ADMIN_DEPS] } } });
		} }
	};
}

//#endregion
export { PLUGIN_ID, PLUGIN_VERSION, SHARED_ADMIN_DEPS, builderdash, builderdashPlugin, createPlugin, createPlugin as default };