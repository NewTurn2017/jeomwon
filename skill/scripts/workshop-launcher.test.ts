import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const launcher = join(
	repoRoot,
	"lectures/소상공인-agentic-saas-실습/assets/student/RUN-WORKSHOP-Mac.command",
);
const installer = join(repoRoot, "install.sh");
const temporaryRoots: string[] = [];

type Fixture = {
	readonly root: string;
	readonly home: string;
	readonly workspace: string;
	readonly bin: string;
	readonly launchedFrom: string;
	readonly bunLog: string;
};

function fixture(): Fixture {
	const root = mkdtempSync(join(tmpdir(), "jeomwon-launcher-test-"));
	temporaryRoots.push(root);
	const home = join(root, "home");
	const workspace = join(home, "Desktop/jeomwon-zero-test");
	const bin = join(root, "bin");
	const launchedFrom = join(root, "launched-from.txt");
	const bunLog = join(root, "bun.log");
	mkdirSync(bin, { recursive: true });

	writeExecutable(
		join(bin, "bun"),
		`#!/bin/sh
if [ "$1" = "--version" ]; then
	printf '1.3.14\\n'
	exit 0
fi
printf '%s\\n' "$*" >> "$JEOMWON_TEST_BUN_LOG"
`,
	);
	writeExecutable(
		join(bin, "bunx"),
		`#!/bin/sh
printf '%s\\n' "$*" >> "$JEOMWON_TEST_BUN_LOG"
`,
	);
	writeExecutable(
		join(bin, "claude"),
		`#!/bin/sh
pwd > "$JEOMWON_TEST_LAUNCHED_FROM"
`,
	);
	writeExecutable(
		join(bin, "curl"),
		`#!/bin/sh
output=""
while [ "$#" -gt 0 ]; do
	if [ "$1" = "-o" ]; then
		output="$2"
		shift 2
	else
		shift
	fi
done
cp "$JEOMWON_TEST_INSTALLER" "$output"
`,
	);

	return { root, home, workspace, bin, launchedFrom, bunLog };
}

function writeExecutable(path: string, content: string): void {
	writeFileSync(path, content);
	chmodSync(path, 0o755);
}

function run(f: Fixture): ReturnType<typeof spawnSync> {
	return spawnSync("bash", [launcher, "claude"], {
		encoding: "utf8",
		env: {
			...process.env,
			HOME: f.home,
			JEOMWON_INSTALLER_URL: "https://example.invalid/install.sh",
			JEOMWON_TEST_BUN_LOG: f.bunLog,
			JEOMWON_TEST_INSTALLER: installer,
			JEOMWON_TEST_LAUNCHED_FROM: f.launchedFrom,
			JEOMWON_WORKSPACE: f.workspace,
			PATH: `${f.bin}:/usr/bin:/bin`,
		},
	});
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("clean-room workshop launcher", () => {
	test("Given macOS launchers When distributed Then Finder can execute them", () => {
		for (const path of [
			launcher,
			join(
				repoRoot,
				"lectures/소상공인-agentic-saas-실습/소상공인-agentic-saas-실습-INSTRUCTOR/assets/student/RUN-WORKSHOP-Mac.command",
			),
			join(
				repoRoot,
				"lectures/소상공인-agentic-saas-실습/소상공인-agentic-saas-실습-STUDENT/assets/student/RUN-WORKSHOP-Mac.command",
			),
		]) {
			expect(statSync(path).mode & 0o111).not.toBe(0);
		}
	});

	test("Given an empty workspace When Claude starts Then install and cache run before launch", () => {
		const f = fixture();
		const result = run(f);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("INSTALL PASS jeomwon v0.1.4");
		expect(result.stdout).toContain("CLEAN ROOM READY");
		expect(readFileSync(f.launchedFrom, "utf8").trim()).toBe(f.workspace);
		const bunLog = readFileSync(f.bunLog, "utf8");
		expect(bunLog).toContain("skills@1.5.22");
		expect(bunLog).toContain("warm-cache.mjs --lang ko");
	});

	test("Given a non-empty workspace When launched Then it fails before install", () => {
		const f = fixture();
		mkdirSync(f.workspace, { recursive: true });
		writeFileSync(join(f.workspace, "existing.txt"), "do not overwrite\n");
		const result = run(f);

		expect(result.status).toBe(1);
		expect(`${result.stdout}\n${result.stderr}`).toContain(
			"workspace가 비어 있지 않습니다",
		);
		expect(() => readFileSync(f.bunLog, "utf8")).toThrow();
	});
});
