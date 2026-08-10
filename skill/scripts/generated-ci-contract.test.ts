import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workflowPath = process.env.JEOMWON_CI_WORKFLOW
	? resolve(process.cwd(), process.env.JEOMWON_CI_WORKFLOW)
	: join(repoRoot, "template/.github/workflows/check.yml");
const packagePath = join(repoRoot, "template/package.json");
const verifyPath = join(repoRoot, "skill/scripts/verify.mjs");
const temporaryRoots: string[] = [];

const workflowStages = [
	"bun install --frozen-lockfile",
	"bun run typecheck",
	"bun run lint",
	"bun test",
	"bun run build:email",
	"bun run build:app",
	"bun run build:web",
] as const;

const verifyStageNames = [
	"install",
	"typecheck",
	"lint",
	"test",
	"build_email",
	"build_app",
	"build_web",
] as const;

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function readWorkflowStages(workflow: string): string[] {
	return [...workflow.matchAll(/^\s+run:\s*(.+)$/gm)].map(
		([, command]) => command.trim(),
	);
}

function assertWorkflowContract(workflow: string) {
	expect(() => Bun.YAML.parse(workflow)).not.toThrow();
	expect(workflow).toContain('bun-version: "1.3.14"');
	expect(readWorkflowStages(workflow)).toEqual(workflowStages);
}

describe("generated CI verification contract", () => {
	test("generated CI and offline verify retain the same mandatory ordered stages", () => {
		assertWorkflowContract(readFileSync(workflowPath, "utf8"));

		const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
			packageManager?: string;
			scripts?: Record<string, string>;
		};
		const verifySource = readFileSync(verifyPath, "utf8");

		expect(packageJson.packageManager).toBe("bun@1.3.14");
		expect(packageJson.scripts).toMatchObject({
			"build:email": "bun run --cwd packages/email build",
			"build:app": "bun run --cwd apps/app build",
			"build:web": "bun run --cwd apps/web build",
		});
		const verifyStages = [...verifySource.matchAll(/name: "([^"]+)"/g)].map(
			([, name]) => name,
		);
		expect(verifyStages.slice(0, verifyStageNames.length)).toEqual(
			verifyStageNames,
		);
		expect(verifyStages.slice(verifyStageNames.length)).toEqual(["qa"]);
		expect(verifySource).toContain(
			'args: ["install", "--frozen-lockfile", "--offline"]',
		);
		expect(verifySource).toContain('args: ["test"]');
		for (const script of [
			"typecheck",
			"lint",
			"build:email",
			"build:app",
			"build:web",
		]) {
			expect(verifySource).toContain(`args: ["run", "${script}"]`);
		}
	});

	test("rejects a temporary workflow fixture when any mandatory stage is removed", () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), "jeomwon-ci-contract-"));
		temporaryRoots.push(fixtureRoot);
		const fixturePath = join(fixtureRoot, "check.yml");
		const missingTestStage = readFileSync(workflowPath, "utf8").replace(
			/^\s+- name: Run tests\n\s+run: bun test\n/m,
			"",
		);
		writeFileSync(fixturePath, missingTestStage);

		expect(() => Bun.YAML.parse(readFileSync(fixturePath, "utf8"))).not.toThrow();
		expect(() => assertWorkflowContract(readFileSync(fixturePath, "utf8"))).toThrow();
	});
});
