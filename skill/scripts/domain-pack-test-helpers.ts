import { expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { establishFixture } from "./established-test-fixture";

export const repoRoot = dirname(
	dirname(dirname(fileURLToPath(import.meta.url))),
);
export const injectPath = join(repoRoot, "skill/scripts/inject.mjs");
const temporaryRoots: string[] = [];

export function readLegacyPack(): Record<string, unknown> {
	const examples = readFileSync(join(repoRoot, "skill/EXAMPLES.md"), "utf8");
	const jsonBlock = examples.match(/```json\n([\s\S]*?)\n```/);
	if (!jsonBlock?.[1]) {
		throw new Error("EXAMPLES.md must contain a JSON domain pack");
	}
	const pack = JSON.parse(jsonBlock[1]) as Record<string, unknown>;
	delete pack.schemaVersion;
	return pack;
}

export function createFixture(rawPack: string | Uint8Array) {
	const root = mkdtempSync(join(tmpdir(), "jeomwon-domain-pack-contract-"));
	temporaryRoots.push(root);
	const target = join(root, "target");
	const configPath = join(target, "packages/backend/domain.config.ts");
	const emailPath = join(target, "packages/email/src/reservation-sample.ts");
	const biomePath = join(target, "node_modules/.bin/biome");
	mkdirSync(dirname(configPath), { recursive: true });
	mkdirSync(dirname(emailPath), { recursive: true });
	mkdirSync(dirname(biomePath), { recursive: true });
	writeFileSync(configPath, "config sentinel\n");
	writeFileSync(emailPath, "email sentinel\n");
	writeFileSync(biomePath, "#!/bin/sh\nexit 0\n");
	chmodSync(biomePath, 0o755);
	establishFixture(target, [
		"packages/backend/domain.config.ts",
		"packages/email/src/reservation-sample.ts",
	]);
	const packPath = join(root, "input-domain-pack.json");
	writeFileSync(packPath, rawPack);
	return { target, packPath, configPath, emailPath };
}

export function injectRaw(rawPack: string | Uint8Array) {
	const fixture = createFixture(rawPack);
	const result = spawnSync(
		"bun",
		[injectPath, fixture.target, fixture.packPath],
		{
			cwd: repoRoot,
			encoding: "utf8",
			timeout: 15_000,
		},
	);
	return { fixture, result, output: `${result.stdout}${result.stderr}` };
}

export function sha256(path: string) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function managedBytes(fixture: ReturnType<typeof createFixture>) {
	return {
		config: readFileSync(fixture.configPath),
		email: readFileSync(fixture.emailPath),
	};
}

export function expectSentinelsUnchanged(
	fixture: ReturnType<typeof createFixture>,
) {
	expect(readFileSync(fixture.configPath, "utf8")).toBe("config sentinel\n");
	expect(readFileSync(fixture.emailPath, "utf8")).toBe("email sentinel\n");
}

export function reverseObjectKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reverseObjectKeys);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.reverse()
			.map(([key, child]) => [key, reverseObjectKeys(child)]),
	);
}

export function cleanupFixtures() {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
}
