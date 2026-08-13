import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkshopChecksumVariants } from "./workshop-checksums.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const lecture = join(root, "lectures/소상공인-agentic-saas-실습");
const variants = [
	lecture,
	join(lecture, "소상공인-agentic-saas-실습-INSTRUCTOR"),
	join(lecture, "소상공인-agentic-saas-실습-STUDENT"),
];
const skillDirectoryVariable = ["$", "{CLAUDE_SKILL_DIR}"].join("");
const packagedArtifacts = [
	"EXPECTED-OUTPUT.txt",
	"PROMPT.md",
	"RUNBOOK.md",
	"TROUBLESHOOTING.md",
	"salon-domain-pack.json",
];

function readJson(path: string) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path: string) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walkStrings(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(walkStrings);
	if (value && typeof value === "object")
		return Object.values(value).flatMap(walkStrings);
	return [];
}

describe("workshop first-five-minute contract", () => {
	test("uses the checked-in pack and immutable bundled archive identity", () => {
		const contract = readJson(join(lecture, "workshop-contract.json"));
		const manifest = readJson(join(root, "skill/jeomwon-skill.json"));
		const source = contract.distribution.skillSource;

		expect(contract.schemaVersion).toBe(1);
		expect(contract.commands.workingDirectory).toBe("repository-root");
		expect(contract.commands.packPath).toBe(
			"lectures/소상공인-agentic-saas-실습/assets/student/salon-domain-pack.json",
		);
		const pack = readJson(join(root, contract.commands.packPath));
		expect(existsSync(join(root, contract.commands.packPath))).toBe(true);
		expect(pack.resources).toHaveLength(2);
		expect(
			pack.resources.every(
				(resource: { kind: string }) =>
					resource.kind === pack.services[0].resourceKind,
			),
		).toBe(true);
		expect(source.kind).toBe("bundled-archive");
		expect(source.archivePath).toBe(
			`skill/${manifest.templateSource.archivePath}`,
		);
		expect(source.archiveSha256).toBe(manifest.templateSource.archiveSha256);
		expect(source.contentSha256).toBe(manifest.templateSource.contentSha256);
		expect(sha256(join(root, source.archivePath))).toBe(source.archiveSha256);
	});

	test("pins the published release without mutable distribution URLs", () => {
		const contract = readJson(join(lecture, "workshop-contract.json"));
		const strings = walkStrings(contract);

		expect(contract.distribution.release).toEqual({
			status: "published",
			tag: "v0.1.0",
			commit: "68ead8a8e93e08001bf04dfb705d8fcd3c844ca5",
			url: "https://github.com/NewTurn2017/jeomwon/releases/tag/v0.1.0",
			asset: {
				name: "jeomwon-template-v0.1.0.tar.gz",
				url: "https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.0/jeomwon-template-v0.1.0.tar.gz",
				sha256:
					"fe74258da1c56e4811e5c9665aab5e940dd200fe2e6c5d6b13c39a64c95aa282",
			},
		});
		expect(contract.distribution.localCheckout.developmentOnly).toBe(true);
		expect(
			strings.some((value) => /raw\.githubusercontent\.com/i.test(value)),
		).toBe(false);
		expect(strings.some((value) => /\/main(?:\/|$)/i.test(value))).toBe(false);
		expect(contract.commands.install).toContain(
			"https://github.com/NewTurn2017/jeomwon/tree/v0.1.0/skill",
		);
		expect(contract.commands.install).not.toContain(".");
	});

	test("pins executable install, preflight, bootstrap, output, fallback, and live boundary markers", () => {
		const contract = readJson(join(lecture, "workshop-contract.json"));

		expect(contract.toolchain.bun).toBe("1.3.14");
		expect(contract.toolchain.skillsCli).toBe("1.5.22");
		expect(contract.commands.install).toContain("skills@1.5.22");
		expect(contract.commands.preflight.at(1)).toBe(
			`${skillDirectoryVariable}/scripts/preflight.mjs`,
		);
		expect(contract.commands.bootstrap.at(1)).toBe(
			`${skillDirectoryVariable}/scripts/bootstrap.mjs`,
		);
		expect(contract.expectedMarkers).toEqual([
			"PREFLIGHT PASS",
			"[SKIP verify_qa]",
			"VERIFY PASS",
		]);
		expect(contract.offline.stages).toEqual([
			"install",
			"typecheck",
			"lint",
			"test",
			"build_email",
			"build_app",
			"build_web",
		]);
		expect(contract.live.includedInBootstrap).toBe(false);
		expect(contract.fallback.kind).toBe("facilitator-pre-generated-target");
		expect(contract.fallback.requiredFiles).toContain("jeomwon-project.json");
		expect(contract.demo.slide).toBe(2);
		expect(contract.demo.kind).toBe("pre-provisioned-real-app");
		expect(contract.demo.credentialsProvisionedByBootstrap).toBe(false);
	});

	test("keeps root and packaged assets synchronized with valid local references", () => {
		const canonicalContract = readFileSync(
			join(lecture, "workshop-contract.json"),
		);
		validateWorkshopChecksumVariants(variants, packagedArtifacts);

		for (const variant of variants) {
			expect(readFileSync(join(variant, "workshop-contract.json"))).toEqual(
				canonicalContract,
			);
			for (const file of packagedArtifacts) {
				const expected = readFileSync(join(lecture, "assets/student", file));
				expect(readFileSync(join(variant, "assets/student", file))).toEqual(
					expected,
				);
			}
			const html = readFileSync(join(variant, "index.html"), "utf8");
			expect((html.match(/<section\b/g) ?? []).length).toBe(15);
			expect(html).toContain('data-workshop-demo="pre-provisioned-real-app"');
			expect(html).toContain("[SKIP verify_qa]");
			expect(html).toContain("VERIFY PASS");
			expect(html).not.toContain("PASS  OFFLINE VERIFIED");
			expect(html).not.toContain("./student/salon-domain-pack.json");
			for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
				const reference = match[1];
				if (reference === undefined || /^(?:https?:|#|mailto:)/.test(reference))
					continue;
				expect(existsSync(join(variant, reference))).toBe(true);
			}
		}
	});
});
