import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	CapabilityValidationError,
	validateCapabilities,
} from "./validate-capabilities.mjs";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const validatorPath = join(repoRoot, "skill/scripts/validate-capabilities.mjs");
const manifestPath = join(repoRoot, "template/jeomwon-capabilities.json");
const temporaryRoots: string[] = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function manifest(): Record<string, unknown> {
	return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function capabilities(value: Record<string, unknown>) {
	return value.capabilities as Array<Record<string, unknown>>;
}

function firstCapability(value: Record<string, unknown>) {
	const capability = capabilities(value)[0];
	if (capability === undefined)
		throw new Error("missing first test capability");
	return capability;
}

function requireCapability(value: Record<string, unknown>, id: string) {
	const capability = capabilities(value).find((entry) => entry.id === id);
	if (capability === undefined) {
		throw new Error(`missing test capability: ${id}`);
	}
	return capability;
}

function temporaryManifest(value: unknown) {
	return temporaryManifestSource(JSON.stringify(value));
}

function temporaryManifestSource(source: string) {
	const root = mkdtempSync(join(tmpdir(), "jeomwon-capabilities-"));
	temporaryRoots.push(root);
	const path = join(root, "manifest.json");
	writeFileSync(path, source);
	return path;
}

function errorCode(path: string) {
	try {
		validateCapabilities(path);
	} catch (error) {
		expect(error).toBeInstanceOf(CapabilityValidationError);
		return (error as CapabilityValidationError).code;
	}
	throw new Error("expected capability validation to fail");
}

describe("capability release metadata", () => {
	test("validates the canonical manifest and every declared source/evidence path", () => {
		expect(validateCapabilities(manifestPath)).toEqual({
			schemaVersion: 1,
			capabilities: 10,
		});
	});

	test("keeps capture, Resend delivery, and account subscription evidence distinct", () => {
		const ids = capabilities(manifest()).map(({ id }) => id);
		expect(ids).toContain("delivery.reservationEmail.capture");
		expect(ids).toContain("delivery.reservationEmail.resend");
		expect(ids).toContain("billing.accountSubscription.polar");
		expect(ids).not.toContain("delivery.reservationEmail");
	});

	test("keeps Polar account subscription distinct from absent reservation commerce", () => {
		const entries = capabilities(manifest());
		const polar = entries.find(
			({ id }) => id === "billing.accountSubscription.polar",
		);
		const deposit = entries.find(
			({ id }) => id === "payment.reservationDeposit",
		);

		expect(polar).toMatchObject({
			enablement: { mode: "feature", default: false },
			maturity: "implemented",
		});
		expect(deposit).toMatchObject({
			enablement: { mode: "unavailable", default: false },
			maturity: "planned",
			surfaces: [],
			symbols: [],
		});
	});

	test("keeps no-show kit-owned, off by default, and promoted only to QA maturity", () => {
		const noShow = capabilities(manifest()).find(
			({ id }) => id === "attendance.noShow",
		);
		expect(noShow).toMatchObject({
			ownership: "kit-core",
			enablement: { mode: "feature", default: false },
			maturity: "qa-proven",
			evidence: { level: "qa", qaGate: 12, liveGate: null },
		});
	});
});

describe("strict capability validation", () => {
	test("rejects malformed JSON and unsupported schemas", () => {
		expect(errorCode(temporaryManifestSource("{not-json"))).toBe(
			"capability_manifest_invalid",
		);
		const incomplete = temporaryManifest({ schemaVersion: 999 });
		expect(errorCode(incomplete)).toBe("capability_manifest_invalid");

		const value = manifest();
		value.schemaVersion = 999;
		expect(errorCode(temporaryManifest(value))).toBe(
			"capability_schema_unsupported",
		);
	});

	test("rejects duplicate IDs, unknown fields, and unsafe paths", () => {
		const duplicate = manifest();
		capabilities(duplicate).push(structuredClone(firstCapability(duplicate)));
		expect(errorCode(temporaryManifest(duplicate))).toBe(
			"capability_id_duplicate",
		);

		const unknown = manifest();
		firstCapability(unknown).unknownField = true;
		expect(errorCode(temporaryManifest(unknown))).toBe(
			"capability_manifest_invalid",
		);

		const unsafe = manifest();
		firstCapability(unsafe).surfaces = ["../outside.ts"];
		expect(errorCode(temporaryManifest(unsafe))).toBe(
			"capability_path_invalid",
		);
	});

	test("rejects stale surface, evidence, and symbol declarations", () => {
		for (const mutate of [
			(capability: Record<string, unknown>) => {
				capability.surfaces = ["template/missing-surface.ts"];
			},
			(capability: Record<string, unknown>) => {
				const evidence = capability.evidence as Record<string, unknown>;
				evidence.paths = ["template/missing-evidence.json"];
			},
			(capability: Record<string, unknown>) => {
				capability.symbols = [
					{
						path: "template/packages/backend/convex/customerReservations.ts",
						name: "staleReservationSymbol",
					},
				];
			},
		]) {
			const value = manifest();
			mutate(firstCapability(value));
			const code = errorCode(temporaryManifest(value));
			expect([
				"capability_path_missing",
				"capability_symbol_missing",
			]).toContain(code);
		}
	});

	test("rejects default-on optional capabilities and maturity overclaims", () => {
		const defaultOn = manifest();
		const noShow = requireCapability(defaultOn, "attendance.noShow");
		noShow.enablement = { mode: "feature", default: true };
		expect(errorCode(temporaryManifest(defaultOn))).toBe(
			"capability_default_invalid",
		);

		const overclaim = manifest();
		const claimed = requireCapability(overclaim, "attendance.noShow");
		claimed.maturity = "live-proven";
		expect(errorCode(temporaryManifest(overclaim))).toBe(
			"capability_evidence_missing",
		);
	});
});

describe("capability CLI output", () => {
	test("prints one machine-readable PASS only after successful validation", () => {
		const result = spawnSync("bun", [validatorPath, manifestPath], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout.trim()).toBe(
			'CAPABILITIES PASS {"schemaVersion":1,"capabilities":10}',
		);
	});

	test("prints stable FAIL without misleading PASS for malformed or overclaimed input", () => {
		const value = manifest();
		const noShow = requireCapability(value, "attendance.noShow");
		noShow.maturity = "live-proven";
		const result = spawnSync("bun", [validatorPath, temporaryManifest(value)], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain(
			'CAPABILITIES FAIL {"code":"capability_evidence_missing"',
		);
		expect(`${result.stdout}${result.stderr}`).not.toContain(
			"CAPABILITIES PASS",
		);
	});
});
