/**
 * Admin entrypoint.
 *
 * Exports the maps and extension arrays the EmDash admin consumes. The page is
 * mounted at `/_emdash/admin/plugins/builderdash/<path>`; the column is merged
 * into the content lists of the collections it declares, and the notice panel
 * into the content editor's sidebar.
 */

import type { PluginAdminModule } from "@emdash-cms/admin";

import { BuilderPage } from "./BuilderPage";
import { contentListColumns } from "./columns/BuilderColumn";
import { contentEditorPanels } from "./panels/BuilderNoticePanel";

export const pages: PluginAdminModule["pages"] = {
	"/builder": BuilderPage,
};

export { BuilderPage, contentEditorPanels, contentListColumns };

export { builderUrl } from "./columns/BuilderColumn";
