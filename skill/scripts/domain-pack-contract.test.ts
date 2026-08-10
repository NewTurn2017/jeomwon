import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
	cleanupFixtures,
	expectSentinelsUnchanged,
	injectPath,
	injectRaw,
	managedBytes,
	readLegacyPack,
	repoRoot,
	reverseObjectKeys,
	sha256,
} from "./domain-pack-test-helpers";

afterEach(cleanupFixtures);

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
});
