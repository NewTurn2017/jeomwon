import { afterEach, describe, expect, test } from "bun:test";
import {
	cleanupFixtures,
	expectSentinelsUnchanged,
	injectRaw,
	readLegacyPack,
} from "./domain-pack-test-helpers";

afterEach(cleanupFixtures);

describe("domain-pack version contract", () => {
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
