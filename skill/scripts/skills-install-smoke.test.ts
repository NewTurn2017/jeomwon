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

type TemplateManifestOverrides = {
	templateApi?: number;
	domainPackWriter?: number;
};

type CompatibilityCase = {
	label: string;
	code: string;
	entries: Record<string, string>;
};

const MATCHING_TEMPLATE_MANIFEST = {
	schemaVersion: 1,
	templateVersion: "0.1.1",
	templateApi: 1,
	contracts: {
		domainPackWriter: 0,
		capabilitySchema: 1,
		setupSchema: 2,
		qaContract: 2,
	},
};

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const skillPath = join(repoRoot, "skill");
const rootWorkflowPath = join(repoRoot, ".github/workflows/ci.yml");
const temporaryRoots: string[] = [];

function temporaryRoot(prefix: string): string {
	const root = mkdtempSync(join(tmpdir(), prefix));
	temporaryRoots.push(root);
	return root;
}

function installedScaffold(root: string): string {
	const scripts = join(root, "installed skill/scripts");
	mkdirSync(scripts, { recursive: true });
	cpSync(join(skillPath, "scripts"), scripts, { recursive: true });
	const assets = join(skillPath, "assets");
	if (existsSync(assets)) {
		cpSync(assets, join(root, "installed skill/assets"), { recursive: true });
	}
	const skillManifest = join(skillPath, "jeomwon-skill.json");
	if (existsSync(skillManifest)) {
		cpSync(skillManifest, join(root, "installed skill/jeomwon-skill.json"));
	}
	return join(scripts, "scaffold.mjs");
}

function writeTemplateEntries(root: string, entries: Record<string, string>) {
	for (const [archivePath, content] of Object.entries(entries)) {
		const templateIndex = archivePath.indexOf("/template/");
		if (templateIndex < 0) continue;
		const destination = join(root, archivePath.slice(templateIndex + 1));
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, content);
	}
}

function git(root: string, args: string[]): ReturnType<typeof spawnSync> {
	return spawnSync("git", ["-C", root, ...args], {
		encoding: args[0] === "archive" ? undefined : "utf8",
	});
}

function compatibleTemplateEntries(
	overrides: TemplateManifestOverrides = {},
): Record<string, string> {
	const manifest = structuredClone(MATCHING_TEMPLATE_MANIFEST);
	if (overrides.templateApi !== undefined) {
		manifest.templateApi = overrides.templateApi;
	}
	if (overrides.domainPackWriter !== undefined) {
		manifest.contracts.domainPackWriter = overrides.domainPackWriter;
	}
	const capabilitySource = readFileSync(
		join(repoRoot, "template/jeomwon-capabilities.json"),
		"utf8",
	);
	const capabilityManifest = JSON.parse(capabilitySource) as {
		capabilities: Array<{
			surfaces: string[];
			symbols: Array<{ path: string }>;
			evidence: { paths: string[]; liveGate: string | null };
		}>;
	};
	const entries: Record<string, string> = {
		"jeomwon-v0.1.0/template/jeomwon-template.json": `${JSON.stringify(manifest)}\n`,
		"jeomwon-v0.1.0/template/package.json":
			'{"name":"jeomwon-app","packageManager":"bun@1.3.14","dependencies":{"backend":"@jeomwon/backend"}}\n',
		"jeomwon-v0.1.0/template/apps/app/package.json":
			'{"name":"@jeomwon/app","dependencies":{"backend":"@jeomwon/backend"}}\n',
		"jeomwon-v0.1.0/template/packages/backend/domain.config.ts":
			"export const domainConfig = {};\n",
		"jeomwon-v0.1.0/template/packages/backend/extension.config.ts":
			readFileSync(
				join(repoRoot, "template/packages/backend/extension.config.ts"),
				"utf8",
			),
		"jeomwon-v0.1.0/template/jeomwon-capabilities.json": capabilitySource,
		"jeomwon-v0.1.0/template/setup-config.json": readFileSync(
			join(repoRoot, "template/setup-config.json"),
			"utf8",
		),
		"jeomwon-v0.1.0/template/scripts/qa-contract.ts": readFileSync(
			join(repoRoot, "template/scripts/qa-contract.ts"),
			"utf8",
		),
		"jeomwon-v0.1.0/template/scripts/setup/config.ts": readFileSync(
			join(repoRoot, "template/scripts/setup/config.ts"),
			"utf8",
		),
		"jeomwon-v0.1.0/template/scripts/setup/types.ts": readFileSync(
			join(repoRoot, "template/scripts/setup/types.ts"),
			"utf8",
		),
		"jeomwon-v0.1.0/template/.github/workflows/check.yml": readFileSync(
			join(repoRoot, "template/.github/workflows/check.yml"),
			"utf8",
		),
	};
	for (const capability of capabilityManifest.capabilities) {
		const paths = [
			...capability.surfaces,
			...capability.symbols.map(({ path }) => path),
			...capability.evidence.paths,
			...(capability.evidence.liveGate ? [capability.evidence.liveGate] : []),
		];
		for (const path of paths) {
			entries[`jeomwon-v0.1.0/${path}`] ||= readFileSync(
				join(repoRoot, path),
				"utf8",
			);
		}
	}
	return entries;
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
	const prefix = `.${target.slice(parent.length + 1)}.jeomwon-bootstrap.lock`;
	return readdirSync(parent).filter((name) => name === prefix);
}

function writeInitialPack(root: string, name = "initial-pack.json"): string {
	const pack = join(root, name);
	const examples = readFileSync(join(repoRoot, "skill/EXAMPLES.md"), "utf8");
	const source = examples.match(/```json\n([\s\S]*?)\n```/)?.[1];
	if (!source) throw new Error("missing example pack");
	writeFileSync(pack, source);
	return pack;
}

function runScaffold(
	script: string,
	target: string,
	archive: string,
): ReturnType<typeof spawnSync> {
	const archiveSha256 = existsSync(archive)
		? createHash("sha256").update(readFileSync(archive)).digest("hex")
		: "0".repeat(64);
	const pack = writeInitialPack(dirname(target));
	return spawnSync("bun", [script, target, "Archive Scope", pack], {
		cwd: dirname(target),
		encoding: "utf8",
		timeout: 15_000,
		env: {
			...process.env,
			JEOMWON_TEMPLATE_ARCHIVE: archive,
			JEOMWON_TEMPLATE_ARCHIVE_SHA256: archiveSha256,
			NO_COLOR: "1",
		},
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
		const pack = writeInitialPack(dirname(target), "interrupt-pack.json");
		const child = spawn("bun", [script, target, "Interrupted Scope", pack], {
			cwd: dirname(target),
			env: {
				...process.env,
				JEOMWON_TEMPLATE_ARCHIVE: archive,
				JEOMWON_TEMPLATE_ARCHIVE_SHA256: createHash("sha256")
					.update(readFileSync(archive))
					.digest("hex"),
				NO_COLOR: "1",
			},
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
			rmSync(pack, { force: true });
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
		expect(
			installedManifest.some((entry) =>
				entry.startsWith(
					"f .agents/skills/jeomwon/assets/jeomwon-template-v0.1.1.tar.gz ",
				),
			),
		).toBe(true);

		const target = join(root, "installed-default-target");
		const installedPack = join(root, "installed-pack.json");
		const exampleSource = readFileSync(
			join(repoRoot, "skill/EXAMPLES.md"),
			"utf8",
		).match(/```json\n([\s\S]*?)\n```/)?.[1];
		if (!exampleSource) throw new Error("missing example pack");
		writeFileSync(installedPack, exampleSource);
		const scaffold = spawnSync(
			"bun",
			[
				join(canonical, "scripts/scaffold.mjs"),
				target,
				"Installed Default",
				installedPack,
			],
			{
				cwd: root,
				encoding: "utf8",
				timeout: 30_000,
				env: {
					...process.env,
					JEOMWON_TEMPLATE_ARCHIVE: undefined,
					JEOMWON_TEMPLATE_ARCHIVE_SHA256: undefined,
					JEOMWON_TEMPLATE_REF: undefined,
				},
			},
		);
		expect(scaffold.status).toBe(0);
		expect(
			JSON.parse(readFileSync(join(target, "jeomwon-project.json"), "utf8"))
				.templateSource.kind,
		).toBe("bundled-archive");
	}, 90_000);

	test("the bundled template archive is reproducible and matches its manifest checksum", () => {
		const root = temporaryRoot("jeomwon bundled reproducibility ");
		const first = join(root, "first.tar.gz");
		const second = join(root, "second.tar.gz");
		for (const output of [first, second]) {
			const result = spawnSync(
				"bun",
				[join(skillPath, "scripts/build-template-archive.mjs"), output],
				{ cwd: repoRoot, encoding: "utf8", timeout: 30_000 },
			);
			expect(result.status).toBe(0);
		}
		const digest = (path: string) =>
			createHash("sha256").update(readFileSync(path)).digest("hex");
		expect(digest(first)).toBe(digest(second));
		const manifest = JSON.parse(
			readFileSync(join(skillPath, "jeomwon-skill.json"), "utf8"),
		) as { templateSource: { archivePath: string; archiveSha256: string } };
		const bundled = join(skillPath, manifest.templateSource.archivePath);
		expect(digest(bundled)).toBe(manifest.templateSource.archiveSha256);
	}, 60_000);

	test("the bundled template freshness check rejects any included template byte mutation", () => {
		const root = temporaryRoot("jeomwon bundled freshness ");
		const fixtureSkill = join(root, "skill");
		mkdirSync(join(fixtureSkill, "scripts"), { recursive: true });
		mkdirSync(join(fixtureSkill, "assets"), { recursive: true });
		cpSync(
			join(skillPath, "scripts/build-template-archive.mjs"),
			join(fixtureSkill, "scripts/build-template-archive.mjs"),
		);
		cpSync(
			join(skillPath, "jeomwon-skill.json"),
			join(fixtureSkill, "jeomwon-skill.json"),
		);
		cpSync(
			join(skillPath, "assets/jeomwon-template-v0.1.1.tar.gz"),
			join(fixtureSkill, "assets/jeomwon-template-v0.1.1.tar.gz"),
		);
		cpSync(join(repoRoot, "template"), join(root, "template"), {
			recursive: true,
			filter: (path) =>
				![
					".DS_Store",
					".env.local",
					".next",
					".react-email",
					".turbo",
					"node_modules",
					"qa-artifacts",
				].includes(path.slice(path.lastIndexOf("/") + 1)),
		});
		const script = join(fixtureSkill, "scripts/build-template-archive.mjs");

		const baseline = spawnSync("bun", [script, "--check"], {
			cwd: root,
			encoding: "utf8",
		});
		expect(baseline.status).toBe(0);
		expect(`${baseline.stdout}${baseline.stderr}`).toContain(
			"BUNDLED TEMPLATE CHECK PASS",
		);

		writeFileSync(
			join(root, "template/README.md"),
			`${readFileSync(join(root, "template/README.md"), "utf8")}\nmutation\n`,
		);
		const mutated = spawnSync("bun", [script, "--check"], {
			cwd: root,
			encoding: "utf8",
		});
		expect(mutated.status).toBe(1);
		expect(`${mutated.stdout}${mutated.stderr}`).toContain(
			"BUNDLED TEMPLATE CHECK FAIL",
		);
	}, 60_000);

	test("root CI enforces the bundled template freshness check and full scaffold contract", () => {
		const workflow = readFileSync(rootWorkflowPath, "utf8");
		expect(workflow).toContain(
			"bun skill/scripts/build-template-archive.mjs --check",
		);
		expect(workflow).toContain(
			"./template/node_modules/.bin/tsc -p skill/tsconfig.json",
		);
		expect(workflow).toContain(
			"bun test skill/scripts/skills-install-smoke.test.ts skill/scripts/generator-contract.test.ts",
		);
	});
});

describe("archive-backed installed scaffold", () => {
	test("a local git repository cannot substitute bytes from an unrelated commit", async () => {
		const root = temporaryRoot("jeomwon unrelated git commit ");
		const repository = join(root, "repository");
		mkdirSync(repository, { recursive: true });
		writeTemplateEntries(repository, compatibleTemplateEntries());
		expect(git(repository, ["init", "-q"]).status).toBe(0);
		expect(git(repository, ["config", "user.name", "Jeomwon QA"]).status).toBe(
			0,
		);
		expect(
			git(repository, ["config", "user.email", "qa.invalid@example.invalid"])
				.status,
		).toBe(0);
		expect(git(repository, ["add", "template"]).status).toBe(0);
		expect(git(repository, ["commit", "-qm", "first"]).status).toBe(0);
		const firstCommit = String(
			git(repository, ["rev-parse", "HEAD"]).stdout,
		).trim();
		writeFileSync(join(repository, "unrelated.txt"), "second commit\n");
		expect(git(repository, ["add", "unrelated.txt"]).status).toBe(0);
		expect(git(repository, ["commit", "-qm", "second"]).status).toBe(0);
		const secondCommit = String(
			git(repository, ["rev-parse", "HEAD"]).stdout,
		).trim();
		const firstArchive = git(repository, [
			"archive",
			"--format=tar.gz",
			`--prefix=jeomwon-${firstCommit}/`,
			firstCommit,
		]);
		expect(firstArchive.status).toBe(0);
		const firstArchiveSha = createHash("sha256")
			.update(firstArchive.stdout as Buffer)
			.digest("hex");
		const script = installedScaffold(root);
		const target = join(root, "target");

		const result = spawnSync(
			"bun",
			[script, target, "Unrelated Commit", writeInitialPack(root)],
			{
				cwd: root,
				encoding: "utf8",
				env: {
					...process.env,
					JEOMWON_TEMPLATE_REF: secondCommit,
					JEOMWON_TEMPLATE_GIT_REPOSITORY: repository,
					JEOMWON_TEMPLATE_ARCHIVE_SHA256: firstArchiveSha,
				},
			},
		);

		expect(result.status).toBe(1);
		expect(`${result.stdout}${result.stderr}`).toContain(
			"ERROR [archive_checksum_mismatch]",
		);
		expect(existsSync(target)).toBe(false);
		expect(stagingEntries(target)).toEqual([]);
	});

	test("an installed skill scaffolds from its verified bundled immutable archive by default", () => {
		const root = temporaryRoot("jeomwon bundled default ");
		const script = installedScaffold(root);
		const target = join(root, "target");

		const result = spawnSync(
			"bun",
			[script, target, "Bundled Default", writeInitialPack(root)],
			{
				cwd: root,
				encoding: "utf8",
				timeout: 30_000,
				env: {
					...process.env,
					JEOMWON_TEMPLATE_ARCHIVE: undefined,
					JEOMWON_TEMPLATE_ARCHIVE_SHA256: undefined,
					JEOMWON_TEMPLATE_REF: undefined,
				},
			},
		);

		expect(result.status).toBe(0);
		const receipt = JSON.parse(
			readFileSync(join(target, "jeomwon-project.json"), "utf8"),
		) as { templateSource: Record<string, unknown> };
		expect(receipt.templateSource.kind).toBe("bundled-archive");
		expect(receipt.templateSource.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(receipt.templateSource).not.toHaveProperty("releaseTag");
		expect(receipt.templateSource).not.toHaveProperty("sourceCommit");
	});

	test("a valid archive supports quoted paths and rewrites the generated package scope", async () => {
		const root = temporaryRoot("jeomwon archive happy ");
		const script = installedScaffold(root);
		const archive = join(root, "template archive.tar");
		const target = join(root, "unrelated cwd/generated app");
		mkdirSync(dirname(target), { recursive: true });
		await writeArchive(archive, compatibleTemplateEntries());

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
		const receipt = JSON.parse(
			readFileSync(join(target, "jeomwon-project.json"), "utf8"),
		) as {
			templateApi: number;
			templateSource: {
				archiveSha256: string;
				contentSha256: string;
				[key: string]: unknown;
			};
		};
		expect(receipt.templateApi).toBe(1);
		expect(receipt.templateSource.kind).toBe("archive");
		expect(receipt.templateSource).not.toHaveProperty("releaseTag");
		expect(receipt.templateSource).not.toHaveProperty("sourceCommit");
		expect(receipt.templateSource.archiveSha256).toBe(
			createHash("sha256").update(readFileSync(archive)).digest("hex"),
		);
		expect(receipt.templateSource.contentSha256).toMatch(/^[a-f0-9]{64}$/);
	});

	test("a checksum mismatch fails before archive parsing or target publication", async () => {
		const root = temporaryRoot("jeomwon checksum mismatch ");
		const script = installedScaffold(root);
		const archive = join(root, "template.tar");
		const target = join(root, "target");
		await writeArchive(archive, compatibleTemplateEntries());

		const result = spawnSync(
			"bun",
			[script, target, "Checksum Failure", writeInitialPack(root)],
			{
				cwd: root,
				encoding: "utf8",
				env: {
					...process.env,
					JEOMWON_TEMPLATE_ARCHIVE: archive,
					JEOMWON_TEMPLATE_ARCHIVE_SHA256: "0".repeat(64),
					NO_COLOR: "1",
				},
			},
		);

		expect(result.status).toBe(1);
		expect(`${result.stdout}${result.stderr}`).toContain(
			"ERROR [archive_checksum_mismatch]",
		);
		expect(`${result.stdout}${result.stderr}`).not.toContain(
			"[PASS scaffold_created]",
		);
		expect(existsSync(target)).toBe(false);
		expect(stagingEntries(target)).toEqual([]);
	});

	const incompatibleTemplates: CompatibilityCase[] = [
		{
			label: "missing manifest",
			code: "template_manifest_missing",
			entries: {
				"jeomwon-v0.1.0/template/package.json": '{"name":"jeomwon-app"}\n',
			},
		},
		{
			label: "malformed manifest",
			code: "template_manifest_invalid",
			entries: {
				...compatibleTemplateEntries(),
				"jeomwon-v0.1.0/template/jeomwon-template.json": "{not-json\n",
			},
		},
		{
			label: "unsupported template API",
			code: "template_api_unsupported",
			entries: compatibleTemplateEntries({ templateApi: 999 }),
		},
		{
			label: "mismatched domain pack writer",
			code: "domain_pack_writer_mismatch",
			entries: compatibleTemplateEntries({ domainPackWriter: 999 }),
		},
	];

	const placeholderContracts: CompatibilityCase[] = [
		{
			label: "schema-only capability manifest",
			code: "capability_schema_mismatch",
			entries: {
				...compatibleTemplateEntries(),
				"jeomwon-v0.1.0/template/jeomwon-capabilities.json":
					'{"schemaVersion":1}\n',
			},
		},
		{
			label: "schema-only setup config",
			code: "setup_schema_mismatch",
			entries: {
				...compatibleTemplateEntries(),
				"jeomwon-v0.1.0/template/setup-config.json": '{"schemaVersion":2}\n',
			},
		},
		{
			label: "comment-only QA marker",
			code: "qa_contract_mismatch",
			entries: {
				...compatibleTemplateEntries(),
				"jeomwon-v0.1.0/template/scripts/qa-contract.ts":
					"// QA_GATE_CONTRACT\n",
			},
		},
	];

	test.each([
		...incompatibleTemplates,
		...placeholderContracts,
	])("$label fails compatibility before target publication", async ({
		code,
		entries,
	}) => {
		const root = temporaryRoot("jeomwon compatibility invalid ");
		const script = installedScaffold(root);
		const archive = join(root, "template.tar");
		const target = join(root, "target");
		await writeArchive(archive, entries);

		const result = runScaffold(script, target, archive);

		expect(result.status).toBe(1);
		expect(`${result.stdout}${result.stderr}`).toContain(`ERROR [${code}]`);
		expect(`${result.stdout}${result.stderr}`).not.toContain(
			"[PASS scaffold_created]",
		);
		expect(existsSync(target)).toBe(false);
		expect(stagingEntries(target)).toEqual([]);
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
		expect(result.code, result.output).toBe(130);
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
		expect(result.code, result.output).toBe(143);
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
