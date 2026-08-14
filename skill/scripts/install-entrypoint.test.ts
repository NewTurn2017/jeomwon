import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
const installerPath = join(repoRoot, "install.sh");
const temporaryRoots: string[] = [];

type InstallRun = {
	readonly status: number | null;
	readonly output: string;
	readonly arguments: readonly string[];
};

function runInstaller(
	agent: "all" | "claude" | "codex",
	bunVersion = "1.3.14",
): InstallRun {
	const root = mkdtempSync(join(tmpdir(), "jeomwon-install-test-"));
	temporaryRoots.push(root);
	const bin = join(root, "bin");
	const argumentsPath = join(root, "arguments.txt");
	mkdirSync(bin);
	const fakeBun = join(bin, "bun");
	writeFileSync(
		fakeBun,
		`#!/bin/sh
if [ "$1" = "--version" ]; then
	printf '%s\\n' "\${FAKE_BUN_VERSION}"
	exit 0
fi
printf '%s\\n' "$@" > "\${JEOMWON_TEST_ARGUMENTS}"
`,
	);
	chmodSync(fakeBun, 0o755);

	const result = spawnSync("bash", [installerPath, "--agent", agent], {
		encoding: "utf8",
		env: {
			...process.env,
			FAKE_BUN_VERSION: bunVersion,
			HOME: join(root, "home"),
			JEOMWON_TEST_ARGUMENTS: argumentsPath,
			PATH: `${bin}:/usr/bin:/bin`,
		},
	});
	const argumentsText =
		result.status === 0 ? readFileSync(argumentsPath, "utf8") : "";

	return {
		status: result.status,
		output: `${result.stdout}\n${result.stderr}`,
		arguments: argumentsText.trim().split("\n").filter(Boolean),
	};
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("curl installer entrypoint", () => {
	test("Given Claude mode When installed Then universal and Claude skill targets are selected", () => {
		const result = runInstaller("claude");

		expect(result.status).toBe(0);
		expect(result.arguments).toContain("universal");
		expect(result.arguments).toContain("claude-code");
		expect(result.arguments).not.toContain("codex");
	});

	test("Given Codex mode When installed Then universal and Codex skill targets are selected", () => {
		const result = runInstaller("codex");

		expect(result.status).toBe(0);
		expect(result.arguments).toContain("universal");
		expect(result.arguments).toContain("codex");
		expect(result.arguments).not.toContain("claude-code");
	});

	test("Given all mode When installed Then both host skill targets are selected", () => {
		const result = runInstaller("all");

		expect(result.status).toBe(0);
		expect(result.arguments).toContain("universal");
		expect(result.arguments).toContain("claude-code");
		expect(result.arguments).toContain("codex");
		expect(result.arguments).toContain("skills@1.5.22");
		expect(result.arguments).toContain(
			"https://github.com/NewTurn2017/jeomwon/tree/v0.1.1/skill",
		);
	});

	test("Given the wrong Bun version When installed Then recovery is explicit and no install runs", () => {
		const result = runInstaller("all", "1.3.13");

		expect(result.status).toBe(2);
		expect(result.output).toContain("bun-v1.3.14");
		expect(result.arguments).toEqual([]);
	});

	test("Given an unsupported agent When parsed Then installation fails closed", () => {
		const result = spawnSync(
			"bash",
			[installerPath, "--agent", "unsupported"],
			{ encoding: "utf8" },
		);

		expect(result.status).toBe(2);
		expect(`${result.stdout}\n${result.stderr}`).toContain(
			"claude | codex | all",
		);
	});
});
