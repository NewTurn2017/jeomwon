import { describe, expect, test } from "bun:test";
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
const packagedArtifacts = [
	"EXPECTED-OUTPUT.txt",
	"PROMPT.md",
	"RUN-WORKSHOP-Mac.command",
	"RUN-WORKSHOP-Windows.bat",
	"RUNBOOK.md",
	"TROUBLESHOOTING.md",
];

function readJson(path: string) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function walkStrings(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(walkStrings);
	if (value && typeof value === "object")
		return Object.values(value).flatMap(walkStrings);
	return [];
}

describe("workshop first-five-minute contract", () => {
	test("requires an interview-created pack and immutable bundled archive identity", () => {
		const contract = readJson(join(lecture, "workshop-contract.json"));
		const source = contract.distribution.skillSource;

		expect(contract.schemaVersion).toBe(2);
		expect(contract.commands.workingDirectory).toBe("empty-workspace");
		expect(contract.commands.packPath).toBeUndefined();
		expect(contract.journey.existingDomainPackAllowed).toBe(false);
		expect(contract.journey.packCreatedBy).toBe("jeomwon-interview");
		expect(contract.journey.outputPack).toBe("domain-pack.json");
		expect(contract.journey.approvalToken).toBe("확정");
		expect(source.kind).toBe("release-asset");
		expect(source.tag).toBe(contract.distribution.release.tag);
		expect(source.archiveSha256).toBe(
			contract.distribution.release.asset.sha256,
		);
		expect(source.contentSha256).toBe(
			"89cb17caa933c622aacb24b385dd952fa7f49e8cf5b84b872c515beac799a1ae",
		);
	});

	test("pins the published v0.1.3 release and stable installer URL", () => {
		const contract = readJson(join(lecture, "workshop-contract.json"));
		const strings = walkStrings(contract);

		expect(contract.distribution.release).toEqual({
		status: "published",
			tag: "v0.1.3",
			skillVersion: "0.1.3",
			templateVersion: "0.1.3",
			url: "https://github.com/NewTurn2017/jeomwon/releases/tag/v0.1.3",
			asset: {
				name: "jeomwon-template-v0.1.3.tar.gz",
				url: "https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.3/jeomwon-template-v0.1.3.tar.gz",
				sha256:
					"41ac8c763e57391f5faa29dae72c9bc80e219c9e35213fc3a9b8d48c607d1886",
			},
		});
		expect(contract.distribution.localCheckout.developmentOnly).toBe(true);
		expect(
			strings.some((value) => /raw\.githubusercontent\.com/i.test(value)),
		).toBe(false);
		expect(strings.some((value) => /\/main(?:\/|$)/i.test(value))).toBe(false);
		expect(contract.distribution.installer.url).toBe(
			"https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.3/install.sh",
		);
		expect(contract.distribution.installer.sourcePath).toBe("install.sh");
		expect(contract.distribution.skillInstallCommand).toBe(
			"curl -fsSL https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.3/install.sh | bash -s -- --agent all",
		);
		expect(contract.distribution.skillSource.installArguments).toContain(
			"https://github.com/NewTurn2017/jeomwon/tree/v0.1.3/skill",
		);
	});

	test("pins host install, interview, bootstrap, setup, and live boundary markers", () => {
		const contract = readJson(join(lecture, "workshop-contract.json"));

		expect(contract.toolchain.bun).toBe("1.3.14");
		expect(contract.toolchain.skillsCli).toBe("1.5.22");
		expect(contract.toolchain.hosts.claude.install).toBe(
			"curl -fsSL https://claude.ai/install.sh | bash",
		);
		expect(contract.toolchain.hosts.codex.install).toBe(
			"curl -fsSL https://chatgpt.com/codex/install.sh | sh",
		);
		expect(contract.expectedMarkers).toEqual([
			"INSTALL PASS jeomwon v0.1.3",
			"PREFLIGHT PASS",
			"[SKIP verify_qa]",
			"VERIFY PASS",
		]);
		expect(contract.journey.stages).toEqual([
			"create-empty-directory",
			"install-host-cli",
			"authenticate-host",
			"install-jeomwon-skill",
			"launch-host",
			"interview",
			"approve-domain-pack",
			"bootstrap",
			"convex-login",
			"google-oauth",
			"bun-setup",
			"live-qa",
			"manual-smoke",
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
		expect(contract.quickStart).toEqual({
			mac: "RUN-WORKSHOP-Mac.command",
			windows: "RUN-WORKSHOP-Windows.bat",
			primaryHost: "claude-code",
			compatibleHosts: ["claude-code", "codex"],
			steps: [
				"create-empty-directory",
				"install-skill",
				"launch-interview",
			],
			networkRequiredForInstall: true,
		});
		expect(contract.commands.skillRoot).toBe(
			"${JEOMWON_SKILL_DIR:-${CLAUDE_SKILL_DIR:-$HOME/.agents/skills/jeomwon}}",
		);
	});

	test("keeps root and packaged assets synchronized with valid local references", () => {
		const canonicalContract = readFileSync(
			join(lecture, "workshop-contract.json"),
		);
		validateWorkshopChecksumVariants(variants, packagedArtifacts);

		for (const variant of variants) {
			if (variant === lecture) {
				expect(readFileSync(join(variant, "workshop-contract.json"))).toEqual(
					canonicalContract,
				);
			} else {
				expect(existsSync(join(variant, "workshop-contract.json"))).toBe(false);
			}
			for (const file of packagedArtifacts) {
				const expected = readFileSync(join(lecture, "assets/student", file));
				expect(readFileSync(join(variant, "assets/student", file))).toEqual(
					expected,
				);
			}
			expect(
				existsSync(join(variant, "assets/student/salon-domain-pack.json")),
			).toBe(false);
			const html = readFileSync(join(variant, "index.html"), "utf8");
			const expectedSlides = variant.endsWith(
				"소상공인-agentic-saas-실습-STUDENT",
			)
				? 20
				: 21;
			expect((html.match(/<section\b/g) ?? []).length).toBe(expectedSlides);
			expect(html).toContain('data-workshop-demo="pre-provisioned-real-app"');
			expect(html).toContain('data-host-primary="claude-code"');
			expect(html).toContain(
				"curl -fsSL https://claude.ai/install.sh | bash",
			);
			expect(html).toContain(
				"curl -fsSL https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.3/install.sh",
			);
			expect(html).toContain("[SKIP verify_qa]");
			expect(html).toContain("VERIFY PASS");
			expect(html).toContain('data-copy-target="claude-install-command"');
			expect(html).toContain('data-copy-target="jeomwon-install-command"');
			expect(html).toContain("bun setup --lang ko");
			expect(html).not.toContain("salon-domain-pack.json");
			expect(html).not.toContain("준비된 살롱 pack");
			expect(html).not.toContain("PASS  OFFLINE VERIFIED");
			for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
				const reference = match[1];
				if (reference === undefined || /^(?:https?:|#|mailto:)/.test(reference))
					continue;
				expect(existsSync(join(variant, reference))).toBe(true);
			}
		}
	});
});
