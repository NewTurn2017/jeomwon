import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(import.meta.path), "../..");
const roots: string[] = [];
const excludedBasenames = new Set([
	".DS_Store",
	".env.local",
	".next",
	".react-email",
	".turbo",
	".vercel",
	"node_modules",
	"next-env.d.ts",
	"qa-artifacts",
]);

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function runCheck(root: string) {
	return spawnSync(
		"bun",
		[join(root, "skill/scripts/build-template-archive.mjs"), "--check"],
		{ cwd: root, encoding: "utf8" },
	);
}

test("local framework artifacts do not stale the immutable template archive", () => {
	const root = mkdtempSync(join(tmpdir(), "jeomwon archive artifacts "));
	roots.push(root);

	cpSync(join(repoRoot, "template"), join(root, "template"), {
		recursive: true,
		filter: (path) => !excludedBasenames.has(basename(path)),
	});
	for (const source of [
		"skill/scripts/build-template-archive.mjs",
		"skill/jeomwon-skill.json",
		"skill/assets/jeomwon-template-v0.1.0.tar.gz",
	]) {
		const destination = join(root, source);
		mkdirSync(dirname(destination), { recursive: true });
		cpSync(join(repoRoot, source), destination);
	}

	expect(runCheck(root).status).toBe(0);

	mkdirSync(join(root, "template/.vercel"), { recursive: true });
	writeFileSync(
		join(root, "template/.vercel/project.json"),
		'{"projectId":"local-only"}\n',
	);
	writeFileSync(
		join(root, "template/apps/app/next-env.d.ts"),
		'/// <reference types="next" />\n',
	);
	expect(runCheck(root).status).toBe(0);

	const readme = join(root, "template/README.md");
	writeFileSync(readme, `${readFileSync(readme, "utf8")}\nmutation\n`);
	const includedMutation = runCheck(root);
	expect(includedMutation.status).toBe(1);
	expect(`${includedMutation.stdout}${includedMutation.stderr}`).toContain(
		"BUNDLED TEMPLATE CHECK FAIL",
	);
});
