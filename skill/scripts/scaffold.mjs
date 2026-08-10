#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	rmdir,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCli, fail, parseCommonArgs, signalExitCode } from "./cli.mjs";
import { validateCapabilities } from "./validate-capabilities.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const TEMPLATE_ROOT = join(REPO_ROOT, "template");
const SKILL_MANIFEST_PATH = join(SCRIPT_DIR, "..", "jeomwon-skill.json");
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const SETUP_STEP_CONTRACT = [
	["app-url", "local-env", ["NEXT_PUBLIC_APP_URL", "JEOMWON_APP_ORIGINS"]],
	["site-url", "convex-env-with-local-default", ["SITE_URL"]],
	[
		"convex",
		"convex-provision",
		["CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL", "CONVEX_SITE_URL"],
	],
	["convex-auth", "convex-auth-keys", ["JWT_PRIVATE_KEY", "JWKS"]],
	["google-oauth", "google-oauth", ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]],
	["admin-emails", "admin-emails", ["JEOMWON_ADMIN_EMAILS"]],
	["anonymous-login", "anonymous-login", ["AUTH_ANONYMOUS_LOGIN"]],
	[
		"resend",
		"resend",
		["RESEND_API_KEY", "RESEND_SENDER_EMAIL_AUTH", "RESERVATION_EMAIL_MODE"],
	],
	["openai", "openai", ["OPENAI_API_KEY", "AGENT_RUNTIME"]],
	[
		"polar",
		"polar",
		["POLAR_WEBHOOK_SECRET", "POLAR_ORGANIZATION_TOKEN", "POLAR_PRODUCT_IDS"],
	],
];
const SETUP_VARIABLE_PROJECTS = {
	NEXT_PUBLIC_APP_URL: ["web"],
	JEOMWON_APP_ORIGINS: ["convex"],
	SITE_URL: ["backend", "convex"],
	CONVEX_URL: ["backend"],
	NEXT_PUBLIC_CONVEX_URL: ["app"],
	CONVEX_SITE_URL: ["convex"],
	JWT_PRIVATE_KEY: ["convex"],
	JWKS: ["convex"],
	AUTH_GOOGLE_ID: ["convex"],
	AUTH_GOOGLE_SECRET: ["convex"],
	JEOMWON_ADMIN_EMAILS: ["convex"],
	AUTH_ANONYMOUS_LOGIN: ["convex", "app"],
	RESEND_API_KEY: ["convex"],
	RESEND_SENDER_EMAIL_AUTH: ["convex"],
	RESERVATION_EMAIL_MODE: ["convex"],
	OPENAI_API_KEY: ["app"],
	AGENT_RUNTIME: ["app"],
	POLAR_WEBHOOK_SECRET: ["convex"],
	POLAR_ORGANIZATION_TOKEN: ["convex"],
	POLAR_PRODUCT_IDS: ["convex"],
};
const TEXT_EXTENSIONS = new Set([
	".cjs",
	".css",
	".env",
	".example",
	".gitignore",
	".html",
	".js",
	".json",
	".jsx",
	".md",
	".mjs",
	".ts",
	".tsx",
	".txt",
	".yaml",
	".yml",
]);
const EXCLUDED_NAMES = new Set([
	".next",
	".react-email",
	".turbo",
	"node_modules",
	"qa-artifacts",
]);

class UserFacingError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

const parsed = parseCommonArgs(process.argv.slice(2));
if (parsed.error) fail(parsed.error, parsed.detail);
const cli = createCli("scaffold", parsed.language);
const usage =
	"bun scaffold.mjs <target-dir> <project-name> [--lang ko|en|auto]";
if (parsed.help) {
	cli.help(usage);
	process.exit(0);
}
const [targetArg, ...nameParts] = parsed.positional;
if (!targetArg || nameParts.length === 0) fail("usage", usage);
const projectName = nameParts.join(" ").trim();
if (!projectName) fail("usage", usage);
const targetDir = resolve(process.cwd(), targetArg);
const slug = slugify(projectName);
if (!slug) fail("project_name_invalid", projectName);

let scaffoldError;
let stagingRoot;
let interruptSignal;
const recordInterrupt = (signal) => {
	interruptSignal ||= signal;
};
const handleInterrupt = () => recordInterrupt("SIGINT");
const handleTerminate = () => recordInterrupt("SIGTERM");
const checkInterrupt = () => {
	if (interruptSignal)
		throw new UserFacingError("interrupted", interruptSignal);
};
process.on("SIGINT", handleInterrupt);
process.on("SIGTERM", handleTerminate);
try {
	if (existsSync(targetDir) && (await readdir(targetDir)).length > 0) {
		throw new UserFacingError("target_not_empty", targetDir);
	}
	await mkdir(dirname(targetDir), { recursive: true });
	stagingRoot = await mkdtemp(
		join(dirname(targetDir), `.${basename(targetDir)}.jeomwon-stage-`),
	);
	checkInterrupt();
	const stagedTarget = join(stagingRoot, "output");
	const skillManifest = await readSkillManifest();
	const templateSource = await resolveTemplateSource(
		stagingRoot,
		skillManifest,
	);
	checkInterrupt();
	const templateManifest = await validateTemplateCompatibility(
		templateSource.root,
		skillManifest,
	);
	const contentHash = await hashTemplateContent(templateSource.root);
	if (
		templateSource.expectedContentHash &&
		contentHash !== templateSource.expectedContentHash
	) {
		throw new UserFacingError(
			"bundled_content_mismatch",
			`${contentHash} (expected ${templateSource.expectedContentHash})`,
		);
	}
	await mkdir(stagedTarget, { recursive: true });
	await copyTemplate(templateSource.root, stagedTarget);
	await rewriteProject(stagedTarget, slug);
	await writeScaffoldReceipt(stagedTarget, {
		projectName,
		slug,
		skillManifest,
		templateManifest,
		source: templateSource.source,
		contentHash,
	});
	checkInterrupt();
	if (existsSync(targetDir)) await rmdir(targetDir);
	await rename(stagedTarget, targetDir);
} catch (error) {
	scaffoldError = error;
} finally {
	if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
	if (!scaffoldError && interruptSignal) {
		scaffoldError = new UserFacingError("interrupted", interruptSignal);
	}
	process.off("SIGINT", handleInterrupt);
	process.off("SIGTERM", handleTerminate);
}
if (interruptSignal) {
	fail("interrupted", interruptSignal, signalExitCode(interruptSignal));
}
if (scaffoldError instanceof UserFacingError) {
	fail(scaffoldError.code, scaffoldError.message);
}
if (scaffoldError) {
	fail(
		"scaffold_failed",
		scaffoldError instanceof Error
			? scaffoldError.message
			: String(scaffoldError),
	);
}

console.log(`[PASS scaffold_created] ${projectName}`);
console.log(`Target: ${targetDir}`);
console.log(`NPM scope: @${slug}/`);
if (process.env.JEOMWON_BOOTSTRAP !== "1") {
	cli.next([
		`cd ${JSON.stringify(relative(process.cwd(), targetDir) || ".")}`,
		`bun ${JSON.stringify(join(SCRIPT_DIR, "inject.mjs"))} . <domain-pack.json>`,
		"bun setup",
		'git init && git add . && git commit -m "Initial jeomwon scaffold"',
	]);
}

async function resolveTemplateSource(stagingRoot, skillManifest) {
	const archivePath = process.env.JEOMWON_TEMPLATE_ARCHIVE;
	if (archivePath) {
		const archiveSha256 = requireArchiveSha256();
		const resolvedArchivePath = resolve(process.cwd(), archivePath);
		await verifyArchiveChecksum(resolvedArchivePath, archiveSha256);
		const extracted = await extractArchiveTemplate(
			resolvedArchivePath,
			(path) => `Template fallback: JEOMWON_TEMPLATE_ARCHIVE=${path}`,
			join(stagingRoot, "archive-source"),
		);
		return {
			...extracted,
			source: {
				kind: "archive",
				archiveSha256,
			},
		};
	}
	const ref = process.env.JEOMWON_TEMPLATE_REF;
	if (ref) {
		if (["main", "master", "HEAD"].includes(ref)) {
			throw new UserFacingError("template_ref_mutable", ref);
		}
		const archiveSha256 = requireArchiveSha256();
		if (!/^[a-f0-9]{40}$/i.test(ref)) {
			throw new UserFacingError("template_ref_not_immutable", ref);
		}
		const sourceCommit = ref.toLowerCase();
		const localGitRepository = process.env.JEOMWON_TEMPLATE_GIT_REPOSITORY;
		if (localGitRepository) {
			return extractLocalGitCommit(
				resolve(process.cwd(), localGitRepository),
				sourceCommit,
				archiveSha256,
				join(stagingRoot, "git-ref-source"),
			);
		}
		const encodedRef = ref.split("/").map(encodeURIComponent).join("/");
		return downloadAndExtractTemplate(
			ref,
			`https://codeload.github.com/NewTurn2017/jeomwon/tar.gz/${encodedRef}`,
			join(stagingRoot, "archive-download"),
			archiveSha256,
			{
				kind: "git-ref",
				sourceCommit,
				archiveSha256,
			},
		);
	}
	if (existsSync(TEMPLATE_ROOT)) {
		const sourceCommit = resolveLocalCommit();
		return {
			root: TEMPLATE_ROOT,
			source: {
				kind: "local",
				...(sourceCommit ? { sourceCommit } : {}),
			},
		};
	}
	const bundled = skillManifest.templateSource;
	const bundledPath = resolve(SKILL_ROOT, bundled.archivePath);
	if (
		bundledPath === SKILL_ROOT ||
		!bundledPath.startsWith(
			`${SKILL_ROOT}${process.platform === "win32" ? "\\" : "/"}`,
		)
	) {
		throw new UserFacingError("skill_manifest_invalid", "bundled archive path");
	}
	await verifyArchiveChecksum(bundledPath, bundled.archiveSha256);
	const extracted = await extractArchiveTemplate(
		bundledPath,
		(path) => `Template fallback: bundled immutable archive ${path}`,
		join(stagingRoot, "bundled-source"),
	);
	return {
		...extracted,
		expectedContentHash: bundled.contentSha256,
		source: {
			kind: "bundled-archive",
			archiveSha256: bundled.archiveSha256,
		},
	};
}

async function extractLocalGitCommit(
	repository,
	commit,
	archiveSha256,
	workspace,
) {
	const resolved = Bun.spawnSync({
		cmd: ["git", "-C", repository, "rev-parse", `${commit}^{commit}`],
		stdout: "pipe",
		stderr: "ignore",
	});
	if (
		resolved.exitCode !== 0 ||
		resolved.stdout.toString().trim().toLowerCase() !== commit
	) {
		throw new UserFacingError("template_ref_unresolved", commit);
	}
	const archived = Bun.spawnSync({
		cmd: [
			"git",
			"-C",
			repository,
			"archive",
			"--format=tar.gz",
			`--prefix=jeomwon-${commit}/`,
			commit,
		],
		stdout: "pipe",
		stderr: "ignore",
	});
	if (archived.exitCode !== 0) {
		throw new UserFacingError("template_ref_archive_failed", commit);
	}
	await mkdir(workspace, { recursive: true });
	const archivePath = join(workspace, "git-ref.tar.gz");
	await writeFile(archivePath, archived.stdout);
	await verifyArchiveChecksum(archivePath, archiveSha256);
	const extracted = await extractArchiveTemplate(
		archivePath,
		() => `Template fallback: local git commit ${commit} (${repository})`,
		join(workspace, "source"),
	);
	return {
		...extracted,
		source: {
			kind: "git-ref",
			sourceCommit: commit,
			archiveSha256,
		},
	};
}

async function downloadAndExtractTemplate(
	ref,
	archiveUrl,
	root,
	archiveSha256,
	source,
) {
	await mkdir(root, { recursive: true });
	const path = join(root, "jeomwon-template.tar.gz");
	let response;
	try {
		response = await fetch(archiveUrl);
	} catch (error) {
		throw new UserFacingError(
			"archive_download",
			templateAccessError(error.message),
		);
	}
	if (!response.ok)
		throw new UserFacingError(
			"archive_download",
			templateAccessError(`HTTP ${response.status}`),
		);
	await writeFile(path, new Uint8Array(await response.arrayBuffer()));
	await verifyArchiveChecksum(path, archiveSha256);
	const extracted = await extractArchiveTemplate(
		path,
		() => `Template fallback: immutable git ref ${ref} (${archiveUrl})`,
		join(root, "source"),
	);
	return { ...extracted, source };
}

async function extractArchiveTemplate(archivePath, logLine, workspace) {
	if (!existsSync(archivePath))
		throw new UserFacingError("archive_missing", archivePath);
	const outputRoot = join(workspace, "template");
	let files;
	try {
		const bytes = await Bun.file(archivePath).bytes();
		files = await new Bun.Archive(bytes).files();
	} catch (error) {
		throw new UserFacingError(
			"archive_invalid",
			error instanceof Error ? error.message : String(error),
		);
	}
	checkInterrupt();
	const names = [...files.keys()];
	for (const name of names) {
		if (isUnsafeArchivePath(name))
			throw new UserFacingError("archive_traversal", name);
	}
	checkInterrupt();
	const prefix = findTemplatePrefix(names);
	for (const [name, file] of files) {
		checkInterrupt();
		if (!name.startsWith(prefix)) continue;
		const member = name.slice(prefix.length);
		if (!member) continue;
		const destination = resolve(outputRoot, ...member.split("/"));
		if (
			destination !== outputRoot &&
			!destination.startsWith(
				`${outputRoot}${process.platform === "win32" ? "\\" : "/"}`,
			)
		)
			throw new UserFacingError("archive_traversal", name);
		await mkdir(dirname(destination), { recursive: true });
		await writeFile(destination, new Uint8Array(await file.arrayBuffer()));
	}
	console.log(logLine(archivePath));
	return { root: outputRoot };
}

function isUnsafeArchivePath(name) {
	const normalized = name.replaceAll("\\", "/");
	return (
		normalized.startsWith("/") ||
		normalized.startsWith("//") ||
		/^[A-Za-z]:\//.test(normalized) ||
		normalized.split("/").includes("..")
	);
}

function findTemplatePrefix(names) {
	const prefixes = new Set();
	for (const name of names) {
		const normalized = name.replaceAll("\\", "/").replace(/^\.\//, "");
		const parts = normalized.split("/");
		const index = parts.indexOf("template");
		if (index >= 0) prefixes.add(`${parts.slice(0, index + 1).join("/")}/`);
	}
	if (prefixes.size === 0)
		throw new UserFacingError(
			"archive_template_missing",
			`${names.length} entries`,
		);
	return [...prefixes].sort(
		(left, right) =>
			left.split("/").length - right.split("/").length ||
			left.localeCompare(right),
	)[0];
}

function templateAccessError(detail) {
	return `template download failed (${detail}); use a repository checkout or set JEOMWON_TEMPLATE_ARCHIVE with JEOMWON_TEMPLATE_ARCHIVE_SHA256`;
}

async function readSkillManifest() {
	if (!existsSync(SKILL_MANIFEST_PATH)) {
		throw new UserFacingError("skill_manifest_missing", SKILL_MANIFEST_PATH);
	}
	let value;
	try {
		value = JSON.parse(await readFile(SKILL_MANIFEST_PATH, "utf8"));
	} catch (error) {
		throw new UserFacingError(
			"skill_manifest_invalid",
			error instanceof Error ? error.message : String(error),
		);
	}
	if (!isValidSkillManifest(value)) {
		throw new UserFacingError("skill_manifest_invalid", SKILL_MANIFEST_PATH);
	}
	return value;
}

async function validateTemplateCompatibility(root, skillManifest) {
	const manifestPath = join(root, "jeomwon-template.json");
	if (!existsSync(manifestPath)) {
		throw new UserFacingError("template_manifest_missing", manifestPath);
	}
	let manifest;
	try {
		manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	} catch (error) {
		throw new UserFacingError(
			"template_manifest_invalid",
			error instanceof Error ? error.message : String(error),
		);
	}
	if (!isValidTemplateManifest(manifest)) {
		throw new UserFacingError("template_manifest_invalid", manifestPath);
	}
	const expected = skillManifest.compatibility;
	if (manifest.templateApi !== expected.templateApi) {
		throw new UserFacingError(
			"template_api_unsupported",
			`${manifest.templateApi} (expected ${expected.templateApi})`,
		);
	}
	if (manifest.contracts.domainPackWriter !== expected.domainPackWriter) {
		throw new UserFacingError(
			"domain_pack_writer_mismatch",
			`${manifest.contracts.domainPackWriter} (expected ${expected.domainPackWriter})`,
		);
	}
	for (const [key, code] of [
		["capabilitySchema", "capability_schema_mismatch"],
		["setupSchema", "setup_schema_mismatch"],
		["qaContract", "qa_contract_mismatch"],
	]) {
		if (manifest.contracts[key] !== expected[key]) {
			throw new UserFacingError(
				code,
				`${manifest.contracts[key]} (expected ${expected[key]})`,
			);
		}
	}
	if (manifest.templateVersion !== expected.templateVersion) {
		throw new UserFacingError(
			"template_version_mismatch",
			`${manifest.templateVersion} (expected ${expected.templateVersion})`,
		);
	}
	await validateTemplateContractFiles(root, manifest);
	return manifest;
}

async function validateTemplateContractFiles(root, manifest) {
	const domainConfigPath = join(root, "packages/backend/domain.config.ts");
	if (!existsSync(domainConfigPath)) {
		throw new UserFacingError("domain_pack_writer_mismatch", domainConfigPath);
	}
	await validateQaContractFile(root);
	let capabilityManifest;
	try {
		capabilityManifest = JSON.parse(
			await readFile(join(root, "jeomwon-capabilities.json"), "utf8"),
		);
	} catch (error) {
		throw new UserFacingError(
			"capability_schema_mismatch",
			error instanceof Error ? error.message : String(error),
		);
	}
	try {
		validateCapabilities(
			join(root, "jeomwon-capabilities.json"),
			dirname(root),
		);
	} catch (error) {
		throw new UserFacingError(
			"capability_schema_mismatch",
			error instanceof Error ? error.message : String(error),
		);
	}
	if (capabilityManifest.schemaVersion !== manifest.contracts.capabilitySchema)
		throw new UserFacingError(
			"capability_schema_mismatch",
			String(capabilityManifest.schemaVersion),
		);
	let setupConfig;
	try {
		setupConfig = JSON.parse(
			await readFile(join(root, "setup-config.json"), "utf8"),
		);
	} catch (error) {
		throw new UserFacingError(
			"setup_schema_mismatch",
			error instanceof Error ? error.message : String(error),
		);
	}
	if (setupConfig?.schemaVersion !== manifest.contracts.setupSchema) {
		throw new UserFacingError(
			"setup_schema_mismatch",
			String(setupConfig?.schemaVersion),
		);
	}
	try {
		validateSetupConfig(setupConfig);
	} catch (error) {
		throw new UserFacingError(
			"setup_schema_mismatch",
			error instanceof Error ? error.message : String(error),
		);
	}
}

async function validateQaContractFile(root) {
	let source;
	try {
		source = await readFile(join(root, "scripts/qa-contract.ts"), "utf8");
	} catch (error) {
		throw new UserFacingError(
			"qa_contract_mismatch",
			error instanceof Error ? error.message : String(error),
		);
	}
	validateQaContract(parseQaContract(source));
}

function validateSetupConfig(value) {
	if (
		!hasExactKeys(value, [
			"schemaVersion",
			"introMessage",
			"projects",
			"steps",
		]) ||
		value.schemaVersion !== 2 ||
		typeof value.introMessage !== "string" ||
		!value.introMessage.trim() ||
		!Array.isArray(value.projects) ||
		value.projects.length !== 4 ||
		!Array.isArray(value.steps) ||
		value.steps.length !== SETUP_STEP_CONTRACT.length
	)
		throw new Error("invalid setup config root");
	const projectIds = new Set();
	for (const project of value.projects) {
		if (!isRecord(project) || typeof project.id !== "string" || !project.id)
			throw new Error("invalid setup project");
		if (projectIds.has(project.id)) throw new Error("duplicate setup project");
		projectIds.add(project.id);
		if (project.type === "convex") {
			if (
				!hasOnlyKeys(project, [
					"id",
					"type",
					"workingDirectory",
					"exportCommand",
					"importCommand",
					"suppressCommandOutput",
					"ignoreLogs",
				]) ||
				![
					project.workingDirectory,
					project.exportCommand,
					project.importCommand,
				].every((entry) => typeof entry === "string" && entry.length > 0)
			)
				throw new Error("invalid convex setup project");
			validateOptionalFields(
				project,
				[],
				["suppressCommandOutput"],
				["ignoreLogs"],
			);
		} else if (
			project.type !== "envFile" ||
			!hasExactKeys(project, ["id", "type", "envFile", "exampleFile"]) ||
			![project.envFile, project.exampleFile].every(
				(entry) => typeof entry === "string" && entry.length > 0,
			)
		)
			throw new Error("invalid env setup project");
	}
	if (["convex", "backend", "web", "app"].some((id) => !projectIds.has(id)))
		throw new Error("missing setup project");
	const stepIds = new Set();
	for (const [index, expected] of SETUP_STEP_CONTRACT.entries()) {
		const step = value.steps[index];
		if (
			!hasOnlyKeys(step, [
				"id",
				"kind",
				"title",
				"description",
				"instructions",
				"variables",
				"required",
				"interactive",
				"skipMode",
				"whenFeature",
				"requiredMessage",
				"additionalInstructions",
			]) ||
			step.id !== expected[0] ||
			step.kind !== expected[1] ||
			typeof step.title !== "string" ||
			!step.title ||
			stepIds.has(step.id) ||
			!Array.isArray(step.variables) ||
			step.variables.length !== expected[2].length
		)
			throw new Error("invalid setup step");
		stepIds.add(step.id);
		validateOptionalFields(
			step,
			[
				"description",
				"instructions",
				"skipMode",
				"whenFeature",
				"requiredMessage",
			],
			["required", "interactive"],
			["additionalInstructions"],
		);
		for (const [variableIndex, expectedName] of expected[2].entries()) {
			const variable = step.variables[variableIndex];
			const expectedProjects = SETUP_VARIABLE_PROJECTS[expectedName];
			if (
				!hasOnlyKeys(variable, [
					"name",
					"projects",
					"details",
					"defaultValue",
					"template",
					"required",
					"secret",
					"info",
				]) ||
				variable.name !== expectedName ||
				!expectedProjects ||
				!Array.isArray(variable.projects) ||
				variable.projects.length !== expectedProjects.length ||
				variable.projects.some(
					(id, projectIndex) => id !== expectedProjects[projectIndex],
				)
			)
				throw new Error("invalid setup variable");
			validateOptionalFields(
				variable,
				["details", "defaultValue", "template"],
				["required", "secret"],
				["info"],
			);
		}
	}
}

function validateOptionalFields(value, strings, booleans, stringArrays) {
	for (const key of strings) {
		if (
			value[key] !== undefined &&
			(typeof value[key] !== "string" || !value[key])
		)
			throw new Error(`invalid ${key}`);
	}
	for (const key of booleans) {
		if (value[key] !== undefined && typeof value[key] !== "boolean")
			throw new Error(`invalid ${key}`);
	}
	for (const key of stringArrays) {
		if (
			value[key] !== undefined &&
			(!Array.isArray(value[key]) ||
				value[key].some((entry) => typeof entry !== "string" || !entry))
		)
			throw new Error(`invalid ${key}`);
	}
}

function parseQaContract(source) {
	const withoutComments = source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
	const declaration = withoutComments.match(
		/export\s+const\s+QA_GATE_CONTRACT\s*=\s*\[([\s\S]*?)\]\s+as\s+const\s*;/,
	);
	if (!declaration?.[1])
		throw new UserFacingError("qa_contract_mismatch", "missing declaration");
	const body = declaration[1];
	const pattern =
		/\{\s*id:\s*(\d+),\s*name:\s*("(?:\\.|[^"\\])*")\s*,\s*artifact:\s*("(?:\\.|[^"\\])*")\s*,?\s*\}/g;
	const gates = [];
	let remainder = body;
	for (const match of body.matchAll(pattern)) {
		gates.push({
			id: Number(match[1]),
			name: JSON.parse(match[2]),
			artifact: JSON.parse(match[3]),
		});
		remainder = remainder.replace(match[0], "");
	}
	if (!/^[\s,]*$/.test(remainder))
		throw new UserFacingError("qa_contract_mismatch", "invalid declaration");
	return gates;
}

function validateQaContract(value) {
	if (!Array.isArray(value) || value.length === 0)
		throw new UserFacingError("qa_contract_mismatch", "invalid gate array");
	const artifacts = new Set();
	for (const [index, gate] of value.entries()) {
		if (
			!hasExactKeys(gate, ["id", "name", "artifact"]) ||
			gate.id !== index + 1 ||
			typeof gate.name !== "string" ||
			gate.name.length === 0 ||
			typeof gate.artifact !== "string" ||
			!/^\d{2}-[a-z0-9-]+\.json$/.test(gate.artifact) ||
			artifacts.has(gate.artifact)
		)
			throw new UserFacingError("qa_contract_mismatch", `gate ${index + 1}`);
		artifacts.add(gate.artifact);
	}
}

function requireArchiveSha256() {
	const value = process.env.JEOMWON_TEMPLATE_ARCHIVE_SHA256?.toLowerCase();
	if (!value) {
		throw new UserFacingError(
			"archive_checksum_missing",
			"JEOMWON_TEMPLATE_ARCHIVE_SHA256",
		);
	}
	if (!/^[a-f0-9]{64}$/.test(value)) {
		throw new UserFacingError("archive_checksum_invalid", value);
	}
	return value;
}

async function verifyArchiveChecksum(path, expected) {
	if (!existsSync(path)) throw new UserFacingError("archive_missing", path);
	const actual = createHash("sha256")
		.update(new Uint8Array(await Bun.file(path).arrayBuffer()))
		.digest("hex");
	if (actual !== expected) {
		throw new UserFacingError(
			"archive_checksum_mismatch",
			`${actual} (expected ${expected})`,
		);
	}
}

function resolveLocalCommit() {
	const status = Bun.spawnSync({
		cmd: [
			"git",
			"-C",
			REPO_ROOT,
			"status",
			"--porcelain",
			"--untracked-files=all",
			"--",
			"template",
		],
		stdout: "pipe",
		stderr: "ignore",
	});
	if (status.exitCode !== 0 || status.stdout.toString().trim())
		return undefined;
	const result = Bun.spawnSync({
		cmd: ["git", "-C", REPO_ROOT, "rev-parse", "HEAD"],
		stdout: "pipe",
		stderr: "ignore",
	});
	if (result.exitCode !== 0) return undefined;
	const commit = result.stdout.toString().trim();
	return /^[a-f0-9]{40}$/i.test(commit) ? commit.toLowerCase() : undefined;
}

async function hashTemplateContent(root) {
	const hash = createHash("sha256");
	const files = await listFiles(root);
	files.sort();
	for (const path of files) {
		const key = relative(root, path).split("\\").join("/");
		hash.update(key);
		hash.update("\0");
		hash.update(await readFile(path));
		hash.update("\0");
	}
	return hash.digest("hex");
}

async function writeScaffoldReceipt(root, details) {
	const receipt = {
		schemaVersion: 1,
		projectName: details.projectName,
		projectSlug: details.slug,
		skillVersion: details.skillManifest.skillVersion,
		templateVersion: details.templateManifest.templateVersion,
		templateApi: details.templateManifest.templateApi,
		contracts: details.templateManifest.contracts,
		templateSource: {
			...details.source,
			contentHash: details.contentHash,
		},
	};
	await writeFile(
		join(root, "jeomwon-project.json"),
		`${JSON.stringify(receipt, null, 2)}\n`,
		"utf8",
	);
}

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
	return (
		isRecord(value) &&
		Object.keys(value).sort().join("\0") === [...expected].sort().join("\0")
	);
}

function hasOnlyKeys(value, allowed) {
	return (
		isRecord(value) && Object.keys(value).every((key) => allowed.includes(key))
	);
}

function isContractTuple(value, includeTemplateVersion) {
	const keys = [
		...(includeTemplateVersion ? ["templateVersion"] : []),
		"templateApi",
		"domainPackWriter",
		"capabilitySchema",
		"setupSchema",
		"qaContract",
	];
	return (
		hasExactKeys(value, keys) &&
		(!includeTemplateVersion || typeof value.templateVersion === "string") &&
		keys
			.filter((key) => key !== "templateVersion")
			.every((key) => Number.isInteger(value[key]) && value[key] >= 0)
	);
}

function isValidSkillManifest(value) {
	return (
		hasExactKeys(value, [
			"schemaVersion",
			"skillVersion",
			"compatibility",
			"templateSource",
		]) &&
		value.schemaVersion === 1 &&
		typeof value.skillVersion === "string" &&
		isContractTuple(value.compatibility, true) &&
		hasExactKeys(value.templateSource, [
			"kind",
			"archivePath",
			"archiveSha256",
			"contentSha256",
		]) &&
		value.templateSource.kind === "bundled-archive" &&
		typeof value.templateSource.archivePath === "string" &&
		/^[a-f0-9]{64}$/.test(value.templateSource.archiveSha256) &&
		/^[a-f0-9]{64}$/.test(value.templateSource.contentSha256)
	);
}

function isValidTemplateManifest(value) {
	return (
		hasExactKeys(value, [
			"schemaVersion",
			"templateVersion",
			"templateApi",
			"contracts",
		]) &&
		value.schemaVersion === 1 &&
		typeof value.templateVersion === "string" &&
		Number.isInteger(value.templateApi) &&
		value.templateApi > 0 &&
		isContractTuple(
			{ templateApi: value.templateApi, ...value.contracts },
			false,
		)
	);
}

async function copyTemplate(source, destination) {
	for (const entry of await readdir(source, { withFileTypes: true })) {
		checkInterrupt();
		if (shouldExclude(entry.name)) continue;
		const sourcePath = join(source, entry.name);
		const destinationPath = join(destination, entry.name);
		if (entry.isDirectory()) {
			await mkdir(destinationPath, { recursive: true });
			await copyTemplate(sourcePath, destinationPath);
		} else if (entry.isFile()) {
			await mkdir(dirname(destinationPath), { recursive: true });
			await copyFile(sourcePath, destinationPath);
			checkInterrupt();
		}
	}
}
function shouldExclude(name) {
	return EXCLUDED_NAMES.has(name) || name === ".env.local";
}
async function rewriteProject(root, slugValue) {
	for (const file of await listFiles(root)) {
		checkInterrupt();
		if (!isTextFile(file)) continue;
		const original = await readFile(file, "utf8");
		const text = original
			.replaceAll("@jeomwon/", `@${slugValue}/`)
			.replaceAll('"name": "jeomwon-app"', `"name": "${slugValue}"`)
			.replaceAll('"name":"jeomwon-app"', `"name":"${slugValue}"`);
		if (text !== original) await writeFile(file, text, "utf8");
	}
}
async function listFiles(root) {
	const output = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory() && !shouldExclude(entry.name))
			output.push(...(await listFiles(path)));
		else if (entry.isFile()) output.push(path);
	}
	return output;
}
function isTextFile(filePath) {
	return (
		TEXT_EXTENSIONS.has(extname(filePath)) ||
		["LICENSE", "bun.lock", "bunfig.toml"].includes(basename(filePath))
	);
}
function slugify(value) {
	return value
		.trim()
		.toLowerCase()
		.replace(/["']/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}
