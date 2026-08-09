#!/usr/bin/env bun
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

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const TEMPLATE_ROOT = join(REPO_ROOT, "template");
const TEMPLATE_REPO = "https://github.com/NewTurn2017/jeomwon";
const TEMPLATE_ARCHIVE_BASE =
	"https://codeload.github.com/NewTurn2017/jeomwon/tar.gz";
const DEFAULT_TEMPLATE_REF = "main";
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
	const templateSource = await resolveTemplateSource(stagingRoot);
	checkInterrupt();
	await mkdir(stagedTarget, { recursive: true });
	await copyTemplate(templateSource.root, stagedTarget);
	await rewriteProject(stagedTarget, slug);
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

async function resolveTemplateSource(stagingRoot) {
	if (existsSync(TEMPLATE_ROOT)) return { root: TEMPLATE_ROOT };
	const archivePath = process.env.JEOMWON_TEMPLATE_ARCHIVE;
	if (archivePath)
		return extractArchiveTemplate(
			resolve(process.cwd(), archivePath),
			(path) => `Template fallback: JEOMWON_TEMPLATE_ARCHIVE=${path}`,
			join(stagingRoot, "archive-source"),
		);
	const ref = process.env.JEOMWON_TEMPLATE_REF || DEFAULT_TEMPLATE_REF;
	const encodedRef = ref.split("/").map(encodeURIComponent).join("/");
	return downloadAndExtractTemplate(
		ref,
		`${TEMPLATE_ARCHIVE_BASE}/${encodedRef}`,
		join(stagingRoot, "archive-download"),
	);
}

async function downloadAndExtractTemplate(ref, archiveUrl, root) {
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
	return extractArchiveTemplate(
		path,
		() => `Template fallback: GitHub ref ${ref} (${archiveUrl})`,
		join(root, "source"),
	);
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
	return `template download failed (${detail}); clone ${TEMPLATE_REPO} or set JEOMWON_TEMPLATE_ARCHIVE`;
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
