/**
 * `dist/` is committed, so installing from GitHub runs no build script (pnpm
 * blocks those by default). This fails when it is out of date: run
 * `npm run build` and commit `dist/`.
 *
 * Run: pnpm test
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

describe("dist", () => {
	it("matches a fresh build of src/index.ts", () => {
		const out = mkdtempSync(join(tmpdir(), "builderdash-dist-"));
		try {
			execFileSync(
				join(root, "node_modules/.bin/tsdown"),
				["src/index.ts", "--format", "esm", "--dts", "--out-dir", out],
				{ cwd: root, stdio: "ignore" },
			);
			const built = readdirSync(out).sort();
			expect(readdirSync(join(root, "dist")).sort()).toEqual(built);
			for (const file of built) {
				expect(readFileSync(join(root, "dist", file), "utf8"), `dist/${file} is stale: run npm run build`).toBe(
					readFileSync(join(out, file), "utf8"),
				);
			}
		} finally {
			rmSync(out, { recursive: true, force: true });
		}
	}, 30_000);
});
