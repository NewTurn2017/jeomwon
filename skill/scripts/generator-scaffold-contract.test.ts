import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	cleanupFixtures,
	createInjectFixture,
	injectPath,
	localTemplateEnvironment,
	repoRoot,
	scaffoldPath,
	temporaryRoots,
} from "./generator-test-helpers";

afterEach(cleanupFixtures, 30_000);

function createPack() {
	const fixture = createInjectFixture();
	return JSON.parse(readFileSync(fixture.packPath, "utf8"));
}

describe("generator retained contract", () => {
	test("Given a repository checkout When scaffolded without an override Then the local template source is used", () => {
		const parent = mkdtempSync(
			join(tmpdir(), "jeomwon local template baseline "),
		);
		temporaryRoots.push(parent);
		const target = join(parent, "generated app");
		const pack = join(parent, "pack.json");
		writeFileSync(pack, JSON.stringify({ schemaVersion: 1, ...createPack() }));

		const result = spawnSync(
			"bun",
			[scaffoldPath, target, "Local Template", pack],
			{
				cwd: repoRoot,
				encoding: "utf8",
				timeout: 30_000,
				env: localTemplateEnvironment(),
			},
		);

		expect(result.status).toBe(0);
		expect(readFileSync(join(target, "package.json"), "utf8")).toContain(
			'"name": "local-template"',
		);
		const receipt = JSON.parse(
			readFileSync(join(target, "jeomwon-project.json"), "utf8"),
		) as {
			templateApi: number;
			templateSource: {
				kind: string;
				sourceCommit?: string;
				contentSha256: string;
				[key: string]: unknown;
			};
		};
		expect(receipt.templateApi).toBe(1);
		expect(receipt.templateSource.kind).toBe("local");
		if (receipt.templateSource.sourceCommit !== undefined) {
			expect(receipt.templateSource.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
		}
		expect(receipt.templateSource).not.toHaveProperty("releaseTag");
		expect(receipt.templateSource).not.toHaveProperty("archiveSha256");
		expect(receipt.templateSource.contentSha256).toMatch(/^[a-f0-9]{64}$/);
	});

	test("Given a target path with spaces When scaffolded Then the package scope is rewritten", () => {
		const parent = mkdtempSync(join(tmpdir(), "jeomwon scaffold baseline "));
		temporaryRoots.push(parent);
		const target = join(parent, "generated app");
		const pack = join(parent, "pack.json");
		writeFileSync(pack, JSON.stringify({ schemaVersion: 1, ...createPack() }));

		const result = spawnSync(
			"bun",
			[scaffoldPath, target, "Quoted Scope", pack],
			{
				cwd: repoRoot,
				encoding: "utf8",
				timeout: 30_000,
				env: localTemplateEnvironment(),
			},
		);

		expect(result.status).toBe(0);
		expect(readFileSync(join(target, "package.json"), "utf8")).toContain(
			'"name": "quoted-scope"',
		);
		expect(
			readFileSync(join(target, "apps/app/package.json"), "utf8"),
		).toContain('"@quoted-scope/backend"');
	}, 30_000);

	test("Given the template seed When a valid pack is injected Then seed bytes remain compatible", () => {
		const fixture = createInjectFixture();
		const before = readFileSync(fixture.seedPath);

		const result = spawnSync(
			"bun",
			[injectPath, fixture.root, fixture.packPath],
			{
				cwd: repoRoot,
				encoding: "utf8",
				timeout: 15_000,
			},
		);

		expect(result.status).toBe(0);
		expect(readFileSync(fixture.seedPath)).toEqual(before);
	});
});
