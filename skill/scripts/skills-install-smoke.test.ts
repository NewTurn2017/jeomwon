import { afterEach, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

declare const Bun: {
	Archive: new (
		entries: Record<string, string>,
	) => {
		bytes(options: { format: "tar" }): Promise<Uint8Array>;
	};
};

type InvalidArchive = {
	label: string;
	code: string;
	entries: Record<string, string> | null;
};

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const skillPath = join(repoRoot, "skill");
const temporaryRoots: string[] = [];

function temporaryRoot(prefix: string): string {
	const root = mkdtempSync(join(tmpdir(), prefix));
	temporaryRoots.push(root);
	return root;
}

function installedScaffold(root: string): string {
	const scripts = join(root, "installed skill/scripts");
	mkdirSync(scripts, { recursive: true });
	cpSync(
		join(skillPath, "scripts/scaffold.mjs"),
		join(scripts, "scaffold.mjs"),
	);
	cpSync(join(skillPath, "scripts/cli.mjs"), join(scripts, "cli.mjs"));
	return join(scripts, "scaffold.mjs");
}

async function writeArchive(
	path: string,
	entries: Record<string, string>,
): Promise<void> {
	const archive = new Bun.Archive(entries);
	writeFileSync(path, await archive.bytes({ format: "tar" }));
}

function manifest(root: string): string[] {
	if (!existsSync(root)) return [];
	const output: string[] = [];
	const visit = (directory: string) => {
		for (const name of readdirSync(directory).sort()) {
			const path = join(directory, name);
			const entry = lstatSync(path);
			const key = relative(root, path).split("\\").join("/");
			if (entry.isDirectory()) {
				output.push(`d ${key}`);
				visit(path);
			} else if (entry.isSymbolicLink()) {
				output.push(`l ${key} -> ${realpathSync(path)}`);
			} else {
				output.push(
					`f ${key} ${createHash("sha256").update(readFileSync(path)).digest("hex")}`,
				);
			}
		}
	};
	visit(root);
	return output;
}

function stagingEntries(target: string): string[] {
	const parent = dirname(target);
	if (!existsSync(parent)) return [];
	const prefix = `.${target.slice(parent.length + 1)}.jeomwon-stage-`;
	return readdirSync(parent).filter((name) => name.startsWith(prefix));
}

function runScaffold(
	script: string,
	target: string,
	archive: string,
): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [script, target, "Archive Scope"], {
		cwd: dirname(target),
		encoding: "utf8",
		timeout: 15_000,
		env: { ...process.env, JEOMWON_TEMPLATE_ARCHIVE: archive, NO_COLOR: "1" },
	});
}

function interruptScaffold(
	script: string,
	target: string,
	archive: string,
	signal: "SIGINT" | "SIGTERM",
	repeats = 1,
): Promise<{
	code: number | null;
	signal: NodeJS.Signals | null;
	output: string;
}> {
	return new Promise((resolveResult, reject) => {
		const child = spawn("bun", [script, target, "Interrupted Scope"], {
			cwd: dirname(target),
			env: { ...process.env, JEOMWON_TEMPLATE_ARCHIVE: archive, NO_COLOR: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		let interrupted = false;
		const deadline = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error("scaffold interrupt fixture exceeded 15 seconds"));
		}, 15_000);
		const observe = (chunk: Buffer) => {
			output += chunk.toString();
			if (!interrupted && output.includes("Template fallback:")) {
				interrupted = true;
				for (let count = 0; count < repeats; count++) child.kill(signal);
			}
		};
		child.stdout.on("data", observe);
		child.stderr.on("data", observe);
		child.once("error", (error) => {
			clearTimeout(deadline);
			reject(error);
		});
		child.once("close", (code, closeSignal) => {
			clearTimeout(deadline);
			resolveResult({ code, signal: closeSignal, output });
		});
	});
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("public skill installation", () => {
	test("installed script examples use CLAUDE_SKILL_DIR instead of the caller cwd", () => {
		const source = readFileSync(join(skillPath, "SKILL.md"), "utf8");
		expect(source).toContain(
			`bun "\${CLAUDE_SKILL_DIR}/scripts/bootstrap.mjs" <target-dir> <project-name> <domain-pack.json>`,
		);
		expect(source).not.toMatch(
			/`bun scripts\/(?:bootstrap|scaffold|inject|verify)\.mjs/,
		);
	});

	test("the pinned global Claude install creates one canonical skill and a resolving agent link", () => {
		const root = temporaryRoot("jeomwon skills install ");
		const home = join(root, "home");
		const claudeHome = join(home, ".claude");

		const result = spawnSync(
			"bunx",
			[
				"--bun",
				"skills@1.5.22",
				"add",
				".",
				"--skill",
				"jeomwon",
				"--agent",
				"universal",
				"claude-code",
				"--global",
				"--yes",
			],
			{
				cwd: repoRoot,
				encoding: "utf8",
				timeout: 90_000,
				env: {
					...process.env,
					HOME: home,
					CLAUDE_CONFIG_DIR: claudeHome,
					NO_COLOR: "1",
				},
			},
		);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		const canonical = join(home, ".agents/skills/jeomwon");
		const agentLink = join(claudeHome, "skills/jeomwon");
		expect(existsSync(canonical)).toBe(true);
		expect(lstatSync(agentLink).isSymbolicLink()).toBe(true);
		expect(realpathSync(agentLink)).toBe(realpathSync(canonical));
		expect(readFileSync(join(canonical, "SKILL.md"))).toEqual(
			readFileSync(join(skillPath, "SKILL.md")),
		);
		const installedManifest = manifest(home);
		expect(
			installedManifest.some((entry) =>
				entry.startsWith("f .agents/skills/jeomwon/SKILL.md "),
			),
		).toBe(true);
		expect(
			installedManifest.filter((entry) =>
				entry.startsWith("l .claude/skills/jeomwon -> "),
			),
		).toHaveLength(1);
		expect(
			installedManifest.some((entry) =>
				entry.startsWith("f .claude/skills/jeomwon/"),
			),
		).toBe(false);
	}, 90_000);
});

describe("archive-backed installed scaffold", () => {
	test("a valid archive supports quoted paths and rewrites the generated package scope", async () => {
		const root = temporaryRoot("jeomwon archive happy ");
		const script = installedScaffold(root);
		const archive = join(root, "template archive.tar");
		const target = join(root, "unrelated cwd/generated app");
		mkdirSync(dirname(target), { recursive: true });
		await writeArchive(archive, {
			"jeomwon-main/template/package.json":
				'{"name":"jeomwon-app","dependencies":{"backend":"@jeomwon/backend"}}\n',
			"jeomwon-main/template/apps/app/package.json":
				'{"name":"@jeomwon/app","dependencies":{"backend":"@jeomwon/backend"}}\n',
		});

		const result = runScaffold(script, target, archive);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		expect(`${result.stdout}${result.stderr}`).toContain(
			"[PASS scaffold_created]",
		);
		expect(readFileSync(join(target, "package.json"), "utf8")).toContain(
			'"name":"archive-scope"',
		);
		expect(
			readFileSync(join(target, "apps/app/package.json"), "utf8"),
		).toContain("@archive-scope/backend");
	});

	const invalidArchives: InvalidArchive[] = [
		{
			label: "missing template directory",
			code: "archive_template_missing",
			entries: { "jeomwon-main/README.md": "not a template\n" },
		},
		{
			label: "malformed archive",
			code: "archive_invalid",
			entries: null,
		},
		{
			label: "traversal archive",
			code: "archive_traversal",
			entries: {
				"../escape.txt": "must not escape\n",
				"jeomwon-main/template/package.json": '{"name":"jeomwon-app"}\n',
			},
		},
	];

	test.each(
		invalidArchives,
	)("$label fails without creating target bytes", async ({
		code,
		entries,
	}: InvalidArchive) => {
		const root = temporaryRoot("jeomwon archive invalid ");
		const script = installedScaffold(root);
		const archive = join(root, "invalid archive.tar");
		const target = join(root, "target");
		if (entries) await writeArchive(archive, entries);
		else writeFileSync(archive, "this is not an archive");
		const before = manifest(target);

		const result = runScaffold(script, target, archive);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(`${result.stdout}${result.stderr}`).toContain(`ERROR [${code}]`);
		expect(`${result.stdout}${result.stderr}`).not.toContain(
			"[PASS scaffold_created]",
		);
		expect(manifest(target)).toEqual(before);
		expect(stagingEntries(target)).toEqual([]);
	});

	test("repeated interrupts during archive copy exit 130 without publishing target or staging bytes", async () => {
		const root = temporaryRoot("jeomwon archive interrupt ");
		const script = installedScaffold(root);
		const archive = join(root, "interrupt archive.tar");
		const target = join(root, "path with spaces/generated app");
		mkdirSync(dirname(target), { recursive: true });
		const entries: Record<string, string> = {
			"jeomwon-main/template/package.json": '{"name":"jeomwon-app"}\n',
		};
		for (let index = 0; index < 512; index++) {
			entries[`jeomwon-main/template/data/file-${index}.txt`] = "x".repeat(
				32_768,
			);
		}
		await writeArchive(archive, entries);
		const before = manifest(root);

		const result = await interruptScaffold(
			script,
			target,
			archive,
			"SIGINT",
			2,
		);

		expect(result.output).toContain("Template fallback:");
		expect(result.code).toBe(130);
		expect(result.signal).toBeNull();
		expect(existsSync(target)).toBe(false);
		expect(stagingEntries(target)).toEqual([]);
		expect(manifest(root)).toEqual(before);
	}, 20_000);

	test("SIGTERM during archive copy exits 143 and removes same-parent staging", async () => {
		const root = temporaryRoot("jeomwon archive terminate ");
		const script = installedScaffold(root);
		const archive = join(root, "terminate archive.tar");
		const target = join(root, "path with spaces/terminated app");
		mkdirSync(dirname(target), { recursive: true });
		const entries: Record<string, string> = {
			"jeomwon-main/template/package.json": '{"name":"jeomwon-app"}\n',
		};
		for (let index = 0; index < 256; index++) {
			entries[`jeomwon-main/template/data/file-${index}.txt`] = "y".repeat(
				32_768,
			);
		}
		await writeArchive(archive, entries);
		const before = manifest(root);

		const result = await interruptScaffold(script, target, archive, "SIGTERM");

		expect(result.output).toContain("Template fallback:");
		expect(result.code).toBe(143);
		expect(result.signal).toBeNull();
		expect(existsSync(target)).toBe(false);
		expect(stagingEntries(target)).toEqual([]);
		expect(manifest(root)).toEqual(before);
	}, 20_000);

	test("a non-empty target is refused before archive access and remains byte-identical", () => {
		const root = temporaryRoot("jeomwon archive nonempty ");
		const script = installedScaffold(root);
		const target = join(root, "existing target");
		mkdirSync(target, { recursive: true });
		writeFileSync(join(target, "dirty.txt"), "preserve dirty worktree bytes\n");
		const before = manifest(target);

		const result = runScaffold(script, target, join(root, "missing.tar"));

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(`${result.stdout}${result.stderr}`).toContain(
			"ERROR [target_not_empty]",
		);
		expect(`${result.stdout}${result.stderr}`).not.toContain(
			"[PASS scaffold_created]",
		);
		expect(manifest(target)).toEqual(before);
		expect(stagingEntries(target)).toEqual([]);
	});
});
