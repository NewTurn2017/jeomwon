import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const scriptsRoot = join(repoRoot, "skill/scripts");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(label = "jeomwon cli contract ") {
	const root = mkdtempSync(join(tmpdir(), label));
	roots.push(root);
	return root;
}

function run(script: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
	return spawnSync(process.execPath, [script, ...args], {
		cwd: repoRoot,
		encoding: "utf8",
		env: { ...process.env, ...env },
		timeout: 30_000,
	});
}

async function runPty(
	script: string,
	args: string[],
	columns: number,
	env: Record<string, string> = {},
) {
	let output = "";
	const terminal = new Bun.Terminal({
		cols: columns,
		rows: 40,
		data(_terminal, data) {
			output += new TextDecoder().decode(data);
		},
	});
	try {
		const child = Bun.spawn([process.execPath, script, ...args], {
			cwd: repoRoot,
			env: { ...process.env, ...env },
			terminal,
		});
		const exitCode = await child.exited;
		return { exitCode, output: output.replaceAll("\r", "") };
	} finally {
		terminal.close();
	}
}

function expectLinesFit(
	output: string,
	width: number,
	displayWidth: (line: string) => number,
) {
	for (const line of output.split("\n").filter(Boolean)) {
		expect(displayWidth(line), line).toBeLessThanOrEqual(width);
	}
}

describe("shared CLI primitives", () => {
	test("locale precedence, auto semantics, NO_COLOR presence, and CJK width", async () => {
		const cli = await import(
			`${pathToFileURL(join(scriptsRoot, "cli.mjs")).href}?contract`
		);
		expect(cli.resolveLanguage("ko", { JEOMWON_CLI_LANG: "en" })).toBe("ko");
		expect(cli.resolveLanguage("auto", { JEOMWON_CLI_LANG: "ko" })).toBe("ko");
		expect(
			cli.resolveLanguage(undefined, {
				JEOMWON_CLI_LANG: "en",
				LC_ALL: "ko_KR",
			}),
		).toBe("en");
		expect(
			cli.resolveLanguage(undefined, {
				LC_ALL: "ko_KR",
				LC_MESSAGES: "en_US",
				LANG: "en_US",
			}),
		).toBe("ko");
		expect(
			cli.resolveLanguage(undefined, { LC_MESSAGES: "ko_KR", LANG: "en_US" }),
		).toBe("ko");
		expect(cli.resolveLanguage(undefined, { LANG: "ko_KR" })).toBe("ko");
		expect(cli.resolveLanguage(undefined, {})).toBe("en");
		expect(cli.colorEnabled({ NO_COLOR: "" }, true)).toBe(false);
		expect(cli.colorEnabled({}, true)).toBe(true);
		expect(cli.displayWidth("A한B")).toBe(4);
		expect(cli.displayWidth("\u001b[31m한\u001b[0m")).toBe(2);
		expect(cli.contentWidth(100)).toBe(72);
		expect(cli.contentWidth(20)).toBe(32);
	});
});

describe("real PTY width contract", () => {
	test("Korean and English renderers fit 32, 76, and 120-column terminals", async () => {
		const cli = await import(
			`${pathToFileURL(join(scriptsRoot, "cli.mjs")).href}?pty-contract`
		);
		const root = temporaryRoot("jeomwon pty contract ");
		const renderer = join(root, "renderer.mjs");
		writeFileSync(
			renderer,
			`import { createCli } from ${JSON.stringify(pathToFileURL(join(scriptsRoot, "cli.mjs")).href)};
const cli = createCli("probe", process.argv[2]);
cli.help("bun probe.mjs <target-dir> <project-name> <domain-pack.json> [--lang ko|en|auto]");
cli.stage("RUN", "stage_scaffold", "scaffold premium reservation workspace");
cli.next(["cd \\"C:\\\\A B\\"", "bun x convex login", "bun setup", "bun run qa"]);
cli.recovery(["bun", "probe.mjs", "C:\\\\A B", "--lang", process.argv[2]]);
cli.error("probe_error", "recover from malformed archive input");
`,
		);
		for (const columns of [32, 76, 120]) {
			const width = cli.contentWidth(columns);
			for (const language of ["ko", "en"]) {
				const help = await runPty(
					join(scriptsRoot, "bootstrap.mjs"),
					["--help", "--lang", language],
					columns,
					{ NO_COLOR: "" },
				);
				expect(help.exitCode).toBe(0);
				expect(help.output).not.toContain("\u001b[");
				expectLinesFit(help.output, width, cli.displayWidth);

				const rendered = await runPty(renderer, [language], columns, {
					NO_COLOR: "",
				});
				expect(rendered.exitCode).toBe(0);
				expectLinesFit(rendered.output, width, cli.displayWidth);
				expect(rendered.output.match(/\[NEXT next_steps\]/g)?.length).toBe(1);
				expect(rendered.output.match(/\[RECOVERY recovery\]/g)?.length).toBe(1);
				const cleanLines = rendered.output
					.split("\n")
					.map((line: string) => cli.stripAnsi(line));
				const compactJson = cleanLines.find((line: string) =>
					line.startsWith('["bun"'),
				);
				const jsonStart = cleanLines.indexOf("[");
				const jsonEnd = cleanLines.indexOf("]", jsonStart);
				const recoveryArgv = JSON.parse(
					compactJson ?? cleanLines.slice(jsonStart, jsonEnd + 1).join("\n"),
				);
				expect(recoveryArgv[2]).toBe("C:\\A B");
				expect(cleanLines).toContain('  cd "C:\\A B"');
			}
		}
	});
});

describe("script help and stable routing", () => {
	for (const name of ["bootstrap", "scaffold", "inject", "verify"]) {
		test(`${name} supports Korean and English help before positional handling without filesystem side effects`, () => {
			const accidentalTarget = join(repoRoot, "--help");
			expect(existsSync(accidentalTarget)).toBe(false);
			for (const lang of ["ko", "en"]) {
				const result = run(join(scriptsRoot, `${name}.mjs`), [
					"--help",
					"--lang",
					lang,
				]);
				expect(result.status).toBe(0);
				expect(result.stdout).toContain(`[HELP ${name}]`);
				expect(result.stderr).toBe("");
				expect(existsSync(accidentalTarget)).toBe(false);
			}
		});
	}

	test("unknown flags fail on stderr with a stable code and no stack", () => {
		const result = run(join(scriptsRoot, "bootstrap.mjs"), ["--wat"]);
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("ERROR [unknown_argument]");
		expect(result.stderr).not.toContain(" at ");
	});
});

function createBootstrapFixture() {
	const root = temporaryRoot();
	for (const name of ["bootstrap.mjs", "cli.mjs"])
		cpSync(join(scriptsRoot, name), join(root, name));
	const child = `import { basename } from "node:path";
const stage = basename(import.meta.path, ".mjs");
console.log("CHILD " + stage + " lang=" + process.env.JEOMWON_CLI_LANG + " sentinel=" + (process.env.JEOMWON_BOOTSTRAP === "1") + " qa=" + (process.env.JEOMWON_QA_BASE_URL ?? "stripped"));
if (process.env["FAIL_" + stage.toUpperCase()]) process.exit(Number(process.env["FAIL_" + stage.toUpperCase()]));
if (process.env["SIGNAL_" + stage.toUpperCase()]) process.kill(process.pid, process.env["SIGNAL_" + stage.toUpperCase()]);
`;
	for (const name of ["scaffold", "inject", "verify"])
		writeFileSync(join(root, `${name}.mjs`), child);
	return { root, bootstrap: join(root, "bootstrap.mjs") };
}

describe("bootstrap orchestration", () => {
	test("orders ASCII stages, propagates language, and prints one next_steps block", () => {
		const fixture = createBootstrapFixture();
		const target = join(fixture.root, "target with spaces");
		const pack = join(fixture.root, "pack with spaces.json");
		writeFileSync(pack, "{}");
		const result = run(
			fixture.bootstrap,
			[target, "Premium", "Desk", pack, "--lang", "ko"],
			{ NO_COLOR: "", JEOMWON_QA_BASE_URL: "http://127.0.0.1:9" },
		);
		expect(result.status).toBe(0);
		const output = result.stdout;
		const codes = ["stage_scaffold", "stage_inject", "stage_verify"];
		expect(codes.map((code) => output.indexOf(`[RUN ${code}]`))).toEqual(
			[...codes]
				.map((_, i, a) => a.slice(0, i + 1).length)
				.map((_, i) => output.indexOf(`[RUN ${codes[i]}]`)),
		);
		expect(output.indexOf("stage_scaffold")).toBeLessThan(
			output.indexOf("stage_inject"),
		);
		expect(output.indexOf("stage_inject")).toBeLessThan(
			output.indexOf("stage_verify"),
		);
		expect(output.match(/\[NEXT next_steps\]/g)?.length).toBe(1);
		expect(output.match(/lang=ko/g)?.length).toBe(3);
		expect(output.match(/sentinel=true/g)?.length).toBe(3);
		expect(output.match(/qa=http:\/\/127\.0\.0\.1:9/g)?.length).toBe(2);
		expect(output.match(/qa=stripped/g)?.length).toBe(1);
		expect(output).not.toContain("\u001b[");
		expect(output).not.toContain("bun setup\n  bun setup");
		expect(result.stderr).toBe("");
	});

	test("preserves a child exit and prints one public-bun recovery argv block", () => {
		const fixture = createBootstrapFixture();
		const result = run(
			fixture.bootstrap,
			[join(fixture.root, "target"), "Desk", join(fixture.root, "pack.json")],
			{ FAIL_INJECT: "7" },
		);
		expect(result.status).toBe(7);
		expect(result.stderr).toContain("ERROR [child_exit]");
		expect(result.stderr.match(/\[RECOVERY recovery\]/g)?.length).toBe(1);
		expect(result.stderr).toContain("bun");
		const recoveryLines = result.stderr.split("\n");
		const jsonStart = recoveryLines.findIndex(
			(line) => line === "[" || line.startsWith('["bun"'),
		);
		const errorStart = recoveryLines.findIndex(
			(line, index) => index > jsonStart && line.startsWith("ERROR ["),
		);
		const recoveryArgv = JSON.parse(
			recoveryLines.slice(jsonStart, errorStart).join("\n"),
		);
		expect(recoveryArgv[0]).toBe("bun");
		expect(recoveryArgv).toContain(join(fixture.root, "target"));
		expect(result.stdout).not.toContain("stage_verify");
	});

	test("maps repeated child SIGINT to exit 130 without hanging", () => {
		for (let index = 0; index < 2; index++) {
			const fixture = createBootstrapFixture();
			const result = run(
				fixture.bootstrap,
				[join(fixture.root, "target"), "Desk", join(fixture.root, "pack.json")],
				{ SIGNAL_SCAFFOLD: "SIGINT" },
			);
			expect(result.status).toBe(130);
			expect(result.stderr).toContain("ERROR [child_signal]");
		}
	});
});

describe("scaffold archive and standalone contracts", () => {
	test("standalone scaffold retains exactly one next_steps block", () => {
		const root = temporaryRoot();
		const result = run(join(scriptsRoot, "scaffold.mjs"), [
			join(root, "target"),
			"Standalone",
		]);
		expect(result.status).toBe(0);
		expect(result.stdout.match(/\[NEXT next_steps\]/g)?.length).toBe(1);
	});

	test("nonempty targets fail closed without changing retained bytes", () => {
		const root = temporaryRoot();
		const target = join(root, "occupied target");
		mkdirSync(target);
		const marker = join(target, "keep.txt");
		writeFileSync(marker, "keep-me");
		const result = run(join(scriptsRoot, "scaffold.mjs"), [target, "Occupied"]);
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("ERROR [target_not_empty]");
		expect(readFileSync(marker, "utf8")).toBe("keep-me");
	});

	test("invalid packs route a stable code to stderr only", () => {
		const root = temporaryRoot();
		const target = join(root, "target");
		mkdirSync(target);
		const pack = join(root, "bad pack.json");
		writeFileSync(pack, "{");
		const result = run(join(scriptsRoot, "inject.mjs"), [target, pack]);
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("ERROR [pack_invalid]");
		expect(result.stderr).not.toContain(" at ");
	});

	test("native archive extraction accepts a valid archive and rejects malformed and traversal input", async () => {
		const isolated = temporaryRoot();
		const scriptDir = join(isolated, "skill/scripts");
		mkdirSync(scriptDir, { recursive: true });
		for (const name of ["scaffold.mjs", "cli.mjs"])
			cpSync(join(scriptsRoot, name), join(scriptDir, name));
		const archivePath = join(isolated, "template archive.tar.gz");
		await Bun.Archive.write(
			archivePath,
			{ "repo/template/package.json": JSON.stringify({ name: "jeomwon-app" }) },
			{ compress: "gzip" },
		);
		const valid = run(
			join(scriptDir, "scaffold.mjs"),
			[join(isolated, "generated"), "Archive Path"],
			{ JEOMWON_TEMPLATE_ARCHIVE: archivePath },
		);
		expect(valid.status).toBe(0);
		expect(
			readFileSync(join(isolated, "generated/package.json"), "utf8"),
		).toContain('"name":"archive-path"');

		const malformed = join(isolated, "malformed.tar.gz");
		writeFileSync(malformed, "not an archive");
		const invalid = run(
			join(scriptDir, "scaffold.mjs"),
			[join(isolated, "invalid-target"), "Broken"],
			{ JEOMWON_TEMPLATE_ARCHIVE: malformed },
		);
		expect(invalid.status).toBe(1);
		expect(invalid.stderr).toContain("ERROR [archive_invalid]");

		const traversalArchive = join(isolated, "traversal.tar");
		await Bun.Archive.write(traversalArchive, {
			"../escape.txt": "must-not-write",
			"repo/template/package.json": "{}",
		});
		const traversalTarget = join(isolated, "traversal-target");
		const traversal = run(
			join(scriptDir, "scaffold.mjs"),
			[traversalTarget, "Traversal"],
			{ JEOMWON_TEMPLATE_ARCHIVE: traversalArchive },
		);
		expect(traversal.status).toBe(1);
		expect(traversal.stderr).toContain("ERROR [archive_traversal]");
		expect(existsSync(join(isolated, "escape.txt"))).toBe(false);
		expect(existsSync(traversalTarget)).toBe(false);
	});
});

describe("verification gate order", () => {
	test("test is mandatory before every build and QA stays opt-in", () => {
		const source = readFileSync(join(scriptsRoot, "verify.mjs"), "utf8");
		expect(source).toContain('name: "test"');
		expect(source.indexOf('name: "test"')).toBeLessThan(
			source.indexOf("runBuildSteps"),
		);
		expect(source).toContain("VERIFY PASS");
	});
});
