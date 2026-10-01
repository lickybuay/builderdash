import { defineConfig } from "vitest/config";

// Vitest resolves `.ts` extensionless imports the same way the bundler does, so
// the tests exercise the exact source the plugin ships.
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		environment: "jsdom",
	},
});
