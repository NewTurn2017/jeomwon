import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const skillRoot = join(repoRoot, "skill");
const script = join(skillRoot, "scripts/preflight.mjs");
const roots: string[] = [];
let pack = "";

function temp(label: string): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), label)));
	roots.push(root);
	return root;
}

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
	return Bun.spawnSync([process.execPath, script, ...args], {
		cwd: repoRoot,
		env: { ...process.env, NO_COLOR: "1", ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
}

function output(result: ReturnType<typeof run>): string {
	return `${result.stdout.toString()}${result.stderr.toString()}`;
}

beforeEach(() => {
	const root = temp("jeomwon preflight pack ");
	const example = readFileSync(join(skillRoot, "EXAMPLES.md"), "utf8").match(
		/```json\n([\s\S]*?)\n```/,
	)?.[1];
	if (example === undefined) throw new Error("missing domain pack example");
	pack = join(root, "domain-pack.json");
	writeFileSync(pack, example);
});

function archiveEnv(): NodeJS.ProcessEnv {
	const path = join(skillRoot, "assets/jeomwon-template-v0.1.3.tar.gz");
	return {
		JEOMWON_TEMPLATE_ARCHIVE: path,
		JEOMWON_TEMPLATE_ARCHIVE_SHA256: createHash("sha256")
			.update(readFileSync(path))
			.digest("hex"),
	};
}

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe("installed-skill preflight", () => {
	test("help is deterministic in Korean and English", () => {
		for (const language of ["ko", "en"]) {
			const result = run(["--help", "--lang", language]);
			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString()).toContain("[HELP preflight]");
			expect(result.stderr.toString()).toBe("");
		}
	});

	test("cold cache fails once before creating a target or starting scaffold", () => {
		const root = temp("jeomwon preflight cold ");
		const target = join(root, "target");
		const cache = join(root, "cache");
		const env = {
			...process.env,
			...archiveEnv(),
			BUN_INSTALL_CACHE_DIR: cache,
			NO_COLOR: "1",
		};
		const result = run([target, "Cold", pack], env);
		const text = output(result);
		expect(result.exitCode).toBe(1);
		expect(text).toContain("ERROR [cache_not_ready]");
		expect(text.match(/\[RECOVERY recovery\]/g)).toHaveLength(1);
		const lines = text.split("\n");
		const start = lines.indexOf("[");
		const end = lines.findIndex((line, index) => index > start && line === "]");
		expect(JSON.parse(lines.slice(start, end + 1).join("\n"))).toEqual([
			"env",
			`BUN_INSTALL_CACHE_DIR=${cache}`,
			"bun",
			join(skillRoot, "scripts/warm-cache.mjs"),
			"--lang",
			"en",
		]);
		expect(existsSync(target)).toBe(false);
	});

	test("a ready default cache passes without target mutation", () => {
		const root = temp("jeomwon preflight ready ");
		const target = join(root, "target");
		const result = run([target, "Ready", pack], {
			...archiveEnv(),
			BUN_INSTALL_CACHE_DIR: undefined,
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("PREFLIGHT PASS");
		expect(existsSync(target)).toBe(false);
	}, 120_000);

	test("v0 and v1 packs pass schema validation before the same cold-cache boundary", () => {
		const root = temp("jeomwon preflight packs ");
		const v1 = join(root, "v1.json");
		writeFileSync(
			v1,
			JSON.stringify({
				schemaVersion: 1,
				...JSON.parse(readFileSync(pack, "utf8")),
			}),
		);
		for (const packPath of [pack, v1]) {
			const result = run([join(root, "target"), "Pack", packPath], {
				...archiveEnv(),
				BUN_INSTALL_CACHE_DIR: join(root, "empty"),
			});
			expect(result.exitCode).toBe(1);
			expect(output(result)).toContain("[PASS preflight_pack]");
			expect(output(result)).toContain("ERROR [cache_not_ready]");
		}
	});

	test("archive hash mismatch is stable and target-free", () => {
		const root = temp("jeomwon preflight checksum ");
		const target = join(root, "target");
		const result = run([target, "Hash", pack], {
			JEOMWON_TEMPLATE_ARCHIVE: archiveEnv().JEOMWON_TEMPLATE_ARCHIVE,
			JEOMWON_TEMPLATE_ARCHIVE_SHA256: "0".repeat(64),
		});
		expect(result.exitCode).toBe(1);
		expect(output(result)).toContain("ERROR [archive_checksum_mismatch]");
		expect(existsSync(target)).toBe(false);
	});

	test("bad root, archive, pack, and dirty target fail with one recovery", () => {
		const root = temp("jeomwon preflight failures ");
		const dirty = join(root, "dirty");
		mkdirSync(dirty);
		writeFileSync(join(dirty, "keep"), "same");
		const cases: Array<[string, NodeJS.ProcessEnv, string, string]> = [
			[
				"skill_root_unresolved",
				{ CLAUDE_SKILL_DIR: join(root, "missing") },
				pack,
				join(root, "a"),
			],
			[
				"archive_missing",
				{
					JEOMWON_TEMPLATE_ARCHIVE: join(root, "missing.tar"),
					JEOMWON_TEMPLATE_ARCHIVE_SHA256: "0".repeat(64),
				},
				pack,
				join(root, "b"),
			],
			["pack_invalid", archiveEnv(), join(root, "bad.json"), join(root, "c")],
			["target_not_empty", archiveEnv(), pack, dirty],
			["target_unsafe", archiveEnv(), pack, join(skillRoot, "new-target")],
		];
		writeFileSync(join(root, "bad.json"), "{");
		for (const [code, env, packPath, target] of cases) {
			const result = run([target, "Failure", packPath], env);
			const text = output(result);
			expect(result.exitCode).toBe(1);
			expect(text).toContain(`ERROR [${code}]`);
			expect(text.match(/\[RECOVERY recovery\]/g)).toHaveLength(1);
		}
		expect(readFileSync(join(dirty, "keep"), "utf8")).toBe("same");
	});

	test("the exact Bun pin rejects a mismatched runtime version", async () => {
		const module = await import("./preflight-source.mjs");
		let mismatch: unknown;
		try {
			await module.checkBunVersion("0.0.0");
		} catch (error) {
			mismatch = error;
		}
		expect(mismatch).toMatchObject({ code: "bun_version_mismatch" });
	});

	test("canonical, installed, manual symlink, and agent-neutral env resolve the same root", () => {
		const root = temp("jeomwon preflight layouts ");
		const installed = join(root, ".agents/skills/jeomwon");
		cpSync(skillRoot, installed, { recursive: true });
		const manual = join(root, ".claude/skills/jeomwon");
		mkdirSync(dirname(manual), { recursive: true });
		symlinkSync(installed, manual);
		for (const [entry, env] of [
			[script, {}],
			[join(installed, "scripts/preflight.mjs"), {}],
			[join(manual, "scripts/preflight.mjs"), {}],
			[script, { CLAUDE_SKILL_DIR: manual }],
			[
				script,
				{
					JEOMWON_SKILL_DIR: installed,
					CLAUDE_SKILL_DIR: join(root, "must-not-win"),
				},
			],
		] as const) {
			const result = Bun.spawnSync(
				[process.execPath, entry, "--resolve-root"],
				{
					env: { ...process.env, ...env },
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString()).toContain("SKILL ROOT PASS");
		}
	});
});
