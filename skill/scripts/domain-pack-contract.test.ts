import { afterEach, describe, expect, test } from "bun:test";
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

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const injectPath = join(repoRoot, "skill/scripts/inject.mjs");
const temporaryRoots: string[] = [];

function readLegacyPack(): Record<string, unknown> {
	const examples = readFileSync(join(repoRoot, "skill/EXAMPLES.md"), "utf8");
	const jsonBlock = examples.match(/```json\n([\s\S]*?)\n```/);
	if (!jsonBlock?.[1]) {
		throw new Error("EXAMPLES.md must contain a JSON domain pack");
	}
	const pack = JSON.parse(jsonBlock[1]) as Record<string, unknown>;
	delete pack.schemaVersion;
	return pack;
}

function createFixture(rawPack: string | Uint8Array) {
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
	const packPath = join(root, "domain-pack.json");
	writeFileSync(packPath, rawPack);
	return { target, packPath, configPath, emailPath };
}

function injectRaw(rawPack: string | Uint8Array) {
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

function sha256(path: string) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function managedBytes(fixture: ReturnType<typeof createFixture>) {
	return {
		config: readFileSync(fixture.configPath),
		email: readFileSync(fixture.emailPath),
	};
}

function expectSentinelsUnchanged(fixture: ReturnType<typeof createFixture>) {
	expect(readFileSync(fixture.configPath, "utf8")).toBe("config sentinel\n");
	expect(readFileSync(fixture.emailPath, "utf8")).toBe("email sentinel\n");
}

function reverseObjectKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reverseObjectKeys);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.reverse()
			.map(([key, child]) => [key, reverseObjectKeys(child)]),
	);
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("domain-pack version contract", () => {
	test("legacy v0 renders the characterized managed bytes", () => {
		const { fixture, result } = injectRaw(JSON.stringify(readLegacyPack()));

		expect(result.status).toBe(0);
		expect(sha256(fixture.configPath)).toBe(
			"d0b444fb41b285be22473a82d64cc5302550bd8ef433ab7084d985aacd296aae",
		);
		expect(sha256(fixture.emailPath)).toBe(
			"416d3a54e76b97f838c3a14f7339d7202c78f6379e3f8df9a9afba941c463d1c",
		);
	});

	test("missing version migrates and canonical v1 renders identical bytes", () => {
		const legacy = injectRaw(JSON.stringify(readLegacyPack()));
		const canonical = injectRaw(
			JSON.stringify({ schemaVersion: 1, ...readLegacyPack() }),
		);

		expect(legacy.result.status).toBe(0);
		expect(canonical.result.status).toBe(0);
		expect(managedBytes(canonical.fixture)).toEqual(
			managedBytes(legacy.fixture),
		);
	});

	test("canonical rendering is deterministic and idempotent without reordering arrays", () => {
		const pack = { schemaVersion: 1, ...readLegacyPack() };
		const regular = injectRaw(JSON.stringify(pack));
		const reordered = injectRaw(JSON.stringify(reverseObjectKeys(pack)));

		expect(regular.result.status).toBe(0);
		expect(reordered.result.status).toBe(0);
		expect(managedBytes(reordered.fixture)).toEqual(
			managedBytes(regular.fixture),
		);

		const beforeRerun = managedBytes(reordered.fixture);
		const rerun = spawnSync(
			"bun",
			[injectPath, reordered.fixture.target, reordered.fixture.packPath],
			{ cwd: repoRoot, encoding: "utf8", timeout: 15_000 },
		);
		expect(rerun.status).toBe(0);
		expect(managedBytes(reordered.fixture)).toEqual(beforeRerun);

		const generated = readFileSync(reordered.fixture.configPath, "utf8");
		expect(generated.indexOf('"designer-min"')).toBeLessThan(
			generated.indexOf('"designer-seo"'),
		);
		expect(generated.indexOf('"haircut"')).toBeLessThan(
			generated.indexOf('"color"'),
		);
	});

	test("validated copy strings preserve exact decoded bytes", () => {
		const pack = readLegacyPack();
		const copy = pack.copy as Record<string, unknown>;
		const exactCopy = '  줄 1\\nline 2 "quoted" 😀  ';
		copy.confirmed = exactCopy;
		const { fixture, result } = injectRaw(JSON.stringify(pack));

		expect(result.status).toBe(0);
		expect(readFileSync(fixture.configPath, "utf8")).toContain(
			JSON.stringify(exactCopy),
		);
		expect(readFileSync(fixture.emailPath, "utf8")).toContain(
			JSON.stringify(exactCopy),
		);
	});

	test("normalization is pure and does not mutate parsed input", () => {
		const pack = readLegacyPack();
		const probe = `
const { normalizeDomainPack } = await import(${JSON.stringify(injectPath)});
const input = ${JSON.stringify(pack)};
const before = JSON.stringify(input);
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
};
freeze(input);
const canonical = normalizeDomainPack(input);
if (JSON.stringify(input) !== before) throw new Error("input mutated");
if (canonical.schemaVersion !== 1) throw new Error("not canonical v1");
if (canonical.features.waitlist !== false) throw new Error("default missing");
console.log("PURE NORMALIZATION PASS");`;
		const result = spawnSync("bun", ["-e", probe], {
			cwd: repoRoot,
			encoding: "utf8",
			timeout: 15_000,
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("PURE NORMALIZATION PASS");
	});

	for (const version of [0, "1", -1, 0.5, 1.5, 2, 999] as const) {
		test(`schemaVersion ${JSON.stringify(version)} is rejected as unsupported before writes`, () => {
			const pack = { schemaVersion: version, ...readLegacyPack() };
			const { fixture, result, output } = injectRaw(JSON.stringify(pack));

			expect(result.status).not.toBe(0);
			expect(output).toContain("ERROR [pack_schema_unsupported]");
			expectSentinelsUnchanged(fixture);
		});
	}

	for (const [label, mutate] of [
		[
			"top-level",
			(pack: Record<string, unknown>) => {
				pack.unknown = true;
			},
		],
		[
			"nested feature",
			(pack: Record<string, unknown>) => {
				(pack.features as Record<string, unknown>).unknown = true;
			},
		],
		[
			"nested resource",
			(pack: Record<string, unknown>) => {
				(
					(pack.resources as Array<Record<string, unknown>>)[0] as Record<
						string,
						unknown
					>
				).unknown = true;
			},
		],
	] as const) {
		test(`unknown ${label} key is rejected before writes`, () => {
			const pack = { schemaVersion: 1, ...readLegacyPack() };
			mutate(pack);
			const { fixture, result, output } = injectRaw(JSON.stringify(pack));

			expect(result.status).not.toBe(0);
			expect(output).toContain("unknown keys");
			expectSentinelsUnchanged(fixture);
		});
	}

	for (const [label, rawPack] of [
		[
			"top-level",
			JSON.stringify({ schemaVersion: 1, ...readLegacyPack() }).replace(
				'"schemaVersion":1',
				'"schemaVersion":1,"schemaVersion":999',
			),
		],
		[
			"nested",
			JSON.stringify({ schemaVersion: 1, ...readLegacyPack() }).replace(
				'"email":true',
				'"email":true,"email":false',
			),
		],
		[
			"escaped-equivalent",
			JSON.stringify({ schemaVersion: 1, ...readLegacyPack() }).replace(
				'"email":true',
				'"email":true,"\\u0065mail":false',
			),
		],
	] as const) {
		test(`duplicate ${label} object key is rejected before writes`, () => {
			const { fixture, result, output } = injectRaw(rawPack);

			expect(result.status).not.toBe(0);
			expect(output).toContain("duplicate key");
			expectSentinelsUnchanged(fixture);
		});
	}

	test("malformed JSON is rejected before writes", () => {
		const { fixture, result, output } = injectRaw('{"schemaVersion":1,');

		expect(result.status).not.toBe(0);
		expect(output).toContain("ERROR [pack_invalid]");
		expectSentinelsUnchanged(fixture);
	});

	test("invalid UTF-8 is rejected before writes", () => {
		const { fixture, result, output } = injectRaw(
			new Uint8Array([0x7b, 0xff, 0x7d]),
		);

		expect(result.status).not.toBe(0);
		expect(output).toContain("ERROR [pack_invalid]");
		expectSentinelsUnchanged(fixture);
	});

	test("excessive JSON nesting is rejected at the bounded parser", () => {
		const rawPack = `${"[".repeat(65)}0${"]".repeat(65)}`;
		const { fixture, result, output } = injectRaw(rawPack);

		expect(result.status).not.toBe(0);
		expect(output).toContain("JSON nesting exceeds 64");
		expectSentinelsUnchanged(fixture);
	});

	test("excessive JSON value count is rejected at the bounded parser", () => {
		const rawPack = `[${"0,".repeat(100_000)}0]`;
		const { fixture, result, output } = injectRaw(rawPack);

		expect(result.status).not.toBe(0);
		expect(output).toContain("JSON value count exceeds 100000");
		expectSentinelsUnchanged(fixture);
	});

	test("oversized input is rejected at the bounded input boundary", () => {
		const rawPack = `${JSON.stringify({ schemaVersion: 1, ...readLegacyPack() })}${" ".repeat(1024 * 1024)}`;
		const { fixture, result, output } = injectRaw(rawPack);

		expect(result.status).not.toBe(0);
		expect(output).toContain("domain pack exceeds 1048576 bytes");
		expectSentinelsUnchanged(fixture);
	});
});
