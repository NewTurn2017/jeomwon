import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

const sourceRoot = join(import.meta.dir, "../..");
const excluded = new Set([
	".git",
	".gjc",
	".omo",
	".next",
	".turbo",
	"_generated",
	"node_modules",
	"samples",
	"upstream",
]);
let parent = "";
let root = "";
const argv = [
	"skill/scripts/validate-doc-contracts.mjs",
	"--capabilities",
	"template/jeomwon-capabilities.json",
	"--project",
	"template/jeomwon-template.json",
	"--qa",
	"template/scripts/qa-contract.ts",
];

beforeAll(() => {
	parent = mkdtempSync(join(tmpdir(), "doc-contract-cli-"));
	root = join(parent, "repo");
	cpSync(sourceRoot, root, {
		recursive: true,
		filter: (path) => !excluded.has(path.split(sep).at(-1) ?? ""),
	});
});

afterAll(() => rmSync(parent, { recursive: true, force: true }));

function run() {
	return spawnSync("bun", argv, {
		cwd: root,
		encoding: "utf8",
		env: { ...process.env, JEOMWON_DOC_VERIFY_CHILD: "1" },
	});
}

function mutate(path: string, from: string, to: string, expected: string) {
	const absolute = join(root, path);
	const clean = readFileSync(absolute, "utf8");
	expect(clean.includes(from)).toBe(true);
	try {
		writeFileSync(absolute, clean.replace(from, to));
		const result = run();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(expected);
	} finally {
		writeFileSync(absolute, clean);
	}
}

describe("full documentation validator mutations", () => {
	test("generated build directories are excluded by basename without hiding source docs", () => {
		const generated = join(root, "template/apps/web/.next/server/app");
		mkdirSync(generated, { recursive: true });
		writeFileSync(
			join(generated, "_not-found.html"),
			'<a href="#missing">bad</a>',
		);
		const cache = join(root, "template/.turbo/nested");
		mkdirSync(cache, { recursive: true });
		writeFileSync(join(cache, "bad.md"), "[bad](#missing)");
		const result = run();
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("DOC CONTRACT PASS\n");
	});

	test("baseline passes without executing nested marked commands", () => {
		const result = run();
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("DOC CONTRACT PASS\n");
		expect(result.stderr).toBe("");
	});

	test("machine schema source drift makes stale docs fail", () => {
		mutate(
			"skill/scripts/domain-pack-constants.mjs",
			"DOMAIN_PACK_SCHEMA_VERSION = 1",
			"DOMAIN_PACK_SCHEMA_VERSION = 2",
			"identity_table_mismatch",
		);
	});

	test("malformed marker and verifier unsafe replacement fail closed", () => {
		mutate(
			"README.md",
			"```bash verify cwd=repo",
			"```bash verifx cwd=repo",
			"verify_marker_invalid",
		);
		mutate(
			"README.md",
			"bun skill/scripts/validate-doc-contracts.mjs --capabilities template/jeomwon-capabilities.json --project template/jeomwon-template.json --qa template/scripts/qa-contract.ts",
			"rm -rf /tmp/doc-contract-marker-probe",
			"verify_command_unknown",
		);
	});

	test("broken decoded fragment fails closed", () => {
		mutate(
			"README.md",
			"(skill/EXAMPLES.md#coverage-catalog)",
			"(skill/EXAMPLES.md#definitely-missing)",
			"local_anchor_missing",
		);
	});
});
