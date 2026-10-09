import { describe, expect, it, vi } from "vitest";

import { builderdash, builderdashPlugin, SHARED_ADMIN_DEPS } from "./index";

describe("builderdash() integration", () => {
	it("pre-bundles the admin's shared libraries through EmDash's dependency path", () => {
		const updateConfig = vi.fn();
		builderdash().hooks["astro:config:setup"]({ updateConfig });
		expect(updateConfig).toHaveBeenCalledWith({
			vite: { optimizeDeps: { include: [...SHARED_ADMIN_DEPS] } },
		});
		for (const dep of ["@lingui/core", "@lingui/react", "@tanstack/react-query"]) {
			expect(SHARED_ADMIN_DEPS).toContain(`emdash > @emdash-cms/admin > ${dep}`);
		}
	});

	it("keeps the plugin descriptor pointing at the admin entry", () => {
		expect(builderdashPlugin().adminEntry).toBe("@lickybuay/builderdash/admin");
	});
});
