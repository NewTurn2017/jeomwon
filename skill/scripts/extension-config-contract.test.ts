import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	cleanupFixtures,
	injectPath,
	localTemplateEnvironment,
	readExamplePack,
	repoRoot,
	scaffoldPath,
	temporaryRoots,
} from "./generator-test-helpers";

const extensionPath = "packages/backend/extension.config.ts";

function freshTarget(): string {
	const root = mkdtempSync(join(tmpdir(), "jeomwon-extension-contract-"));
	temporaryRoots.push(root);
	const target = join(root, "generated-app");
	const initialPack = join(root, "initial-pack.json");
	writeFileSync(
		initialPack,
		JSON.stringify({ schemaVersion: 1, ...readExamplePack() }),
	);
	const result = spawnSync(
		"bun",
		[scaffoldPath, target, "Extension Contract", initialPack],
		{
			cwd: repoRoot,
			encoding: "utf8",
			env: localTemplateEnvironment(),
			timeout: 30_000,
		},
	);
	expect(`${result.stdout}${result.stderr}`).not.toContain("ERROR [");
	expect(result.status).toBe(0);
	return target;
}

function installBiomeStub(target: string): void {
	const path = join(target, "node_modules/.bin/biome");
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, "#!/bin/sh\nexit 0\n");
	chmodSync(path, 0o755);
}

function runImport(target: string) {
	return spawnSync(
		"bun",
		[
			"-e",
			`import { extensionConfig } from "./${extensionPath}"; console.log(JSON.stringify(extensionConfig));`,
		],
		{ cwd: target, encoding: "utf8", timeout: 10_000 },
	);
}

afterEach(cleanupFixtures, 30_000);

describe("project-owned extension config contract", () => {
	test("a fresh scaffold contains a strict typed seam that defaults every extension off", () => {
		const target = freshTarget();
		const source = readFileSync(join(target, extensionPath), "utf8");

		expect(source).toContain("schemaVersion: 1");
		expect(source).toContain("features: {}");
		expect(source).toContain("Readonly");
		expect(source).not.toMatch(/\bany\b|\sas\s|!\./);
		const compile = spawnSync(
			"bun",
			[
				join(repoRoot, "template/node_modules/typescript/bin/tsc"),
				"--noEmit",
				"--strict",
				"--target",
				"ES2022",
				"--module",
				"ESNext",
				"--moduleResolution",
				"Bundler",
				extensionPath,
			],
			{ cwd: target, encoding: "utf8", timeout: 20_000 },
		);
		expect(`${compile.stdout}${compile.stderr}`).toBe("");
		expect(compile.status).toBe(0);
	});

	test("the real module imports as the exact immutable empty default", () => {
		const target = freshTarget();
		const result = runImport(target);

		expect(`${result.stderr}`).toBe("");
		expect(result.stdout.trim()).toBe('{"schemaVersion":1,"features":{}}');
		expect(result.status).toBe(0);
	});

	test("sentinel project bytes survive legacy v0 then canonical v1 reinjection", () => {
		const target = freshTarget();
		installBiomeStub(target);
		const configPath = join(target, extensionPath);
		const sentinel = `${readFileSync(configPath, "utf8")}\n// project sentinel: 7f9c3a\n`;
		writeFileSync(configPath, sentinel);
		const legacy = readExamplePack();
		const root = dirname(target);
		const v0Path = join(root, "pack-v0.json");
		const v1Path = join(root, "pack-v1.json");
		writeFileSync(v0Path, JSON.stringify(legacy));
		writeFileSync(v1Path, JSON.stringify({ schemaVersion: 1, ...legacy }));

		for (const packPath of [v0Path, v1Path]) {
			const result = spawnSync("bun", [injectPath, target, packPath], {
				cwd: repoRoot,
				encoding: "utf8",
				timeout: 20_000,
			});
			expect(`${result.stdout}${result.stderr}`).not.toContain("ERROR [");
			expect(result.status).toBe(0);
			expect(readFileSync(configPath, "utf8")).toBe(sentinel);
		}
		const receipt = JSON.parse(
			readFileSync(join(target, "jeomwon-project.json"), "utf8"),
		) as { managedOutputs: Record<string, unknown> };
		expect(receipt.managedOutputs).not.toHaveProperty(extensionPath);
	});

	for (const [label, replacement, errorCode] of [
		["schema", "schemaVersion: 999", "extension_schema_unsupported"],
		[
			"feature",
			"features: { unsupportedSentinel: true }",
			"extension_feature_unsupported",
		],
	] as const) {
		test(`unsupported ${label} fails closed on import without changing reservation core`, () => {
			const target = freshTarget();
			const path = join(target, extensionPath);
			const corePath = join(
				target,
				"packages/backend/convex/engine/customerReservationLifecycle.ts",
			);
			const coreBefore = readFileSync(corePath);
			const source = readFileSync(path, "utf8");
			const needle = label === "schema" ? "schemaVersion: 1" : "features: {}";
			writeFileSync(path, source.replace(needle, replacement));

			const result = runImport(target);

			expect(result.status).not.toBe(0);
			expect(`${result.stdout}${result.stderr}`).toContain(errorCode);
			expect(readFileSync(corePath)).toEqual(coreBefore);
		});
	}

	test("the seam is absent from injector ownership and runtime discovery", () => {
		for (const path of [
			"skill/scripts/inject-managed.mjs",
			"skill/scripts/inject-publication.mjs",
			"skill/scripts/inject-receipt.mjs",
			"skill/scripts/inject.mjs",
		]) {
			expect(readFileSync(join(repoRoot, path), "utf8")).not.toContain(
				extensionPath,
			);
		}
		const source = readFileSync(
			join(repoRoot, "template", extensionPath),
			"utf8",
		);
		expect(source).not.toMatch(
			/import\s*\(|readdir|glob|registry|eventBus|hooks\s*\[/i,
		);
	});
});
