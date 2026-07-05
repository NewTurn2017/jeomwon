#!/usr/bin/env bun
import { existsSync } from "node:fs";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

class UserFacingError extends Error {}

function fail(message) {
	console.error(`ERROR: ${message}`);
	process.exit(1);
}

function usage() {
	fail("usage: bun skill/scripts/scaffold.mjs <target-dir> <project-name>");
}

const [targetArg, ...nameParts] = process.argv.slice(2);
if (!targetArg || nameParts.length === 0) {
	usage();
}

const projectName = nameParts.join(" ").trim();
if (!projectName) {
	usage();
}

const targetDir = resolve(process.cwd(), targetArg);
const slug = slugify(projectName);
if (!slug) {
	fail(`project name does not contain a valid npm scope slug: ${projectName}`);
}

let templateSource;
let scaffoldError;

try {
	templateSource = await resolveTemplateSource();
	if (existsSync(targetDir)) {
		const entries = await readdir(targetDir);
		if (entries.length > 0) {
			throw new UserFacingError(
				`target directory already exists and is not empty: ${targetDir}`,
			);
		}
	}

	await mkdir(targetDir, { recursive: true });
	await copyTemplate(templateSource.root, targetDir);
	await rewriteProject(targetDir, slug);
} catch (error) {
	scaffoldError = error;
} finally {
	if (templateSource) {
		await templateSource.cleanup();
	}
}

if (scaffoldError) {
	if (scaffoldError instanceof UserFacingError) {
		fail(scaffoldError.message);
	}
	throw scaffoldError;
}

console.log(`Scaffolded ${projectName}`);
console.log(`Target: ${targetDir}`);
console.log(`NPM scope: @${slug}/`);
console.log("");
console.log("Next:");
console.log(`  cd ${relative(process.cwd(), targetDir) || "."}`);
console.log(`  bun ${join(SCRIPT_DIR, "inject.mjs")} . <domain-pack.json>`);
console.log("  bun setup");
console.log(
	"  git init && git add . && git commit -m 'Initial jeomwon scaffold'",
);

async function resolveTemplateSource() {
	if (existsSync(TEMPLATE_ROOT)) {
		return {
			root: TEMPLATE_ROOT,
			cleanup: async () => {},
		};
	}

	const archivePath = process.env.JEOMWON_TEMPLATE_ARCHIVE;
	if (archivePath) {
		return extractArchiveTemplate({
			archivePath: resolve(process.cwd(), archivePath),
			logLine: (resolvedPath) =>
				`Template fallback: JEOMWON_TEMPLATE_ARCHIVE=${resolvedPath}`,
		});
	}

	const ref = process.env.JEOMWON_TEMPLATE_REF || DEFAULT_TEMPLATE_REF;
	const encodedRef = ref.split("/").map(encodeURIComponent).join("/");
	const archiveUrl = `${TEMPLATE_ARCHIVE_BASE}/${encodedRef}`;
	return downloadAndExtractTemplate(ref, archiveUrl);
}

async function downloadAndExtractTemplate(ref, archiveUrl) {
	const tempRoot = await mkdtemp(join(tmpdir(), "jeomwon-template-"));
	const archivePath = join(tempRoot, "jeomwon-template.tar.gz");

	try {
		await downloadArchive(archiveUrl, archivePath);
		const templateSource = await extractArchiveTemplate({
			archivePath,
			tempRoot,
			logLine: () =>
				`Template fallback: GitHub ref ${ref} (${archiveUrl})`,
		});
		return templateSource;
	} catch (error) {
		await cleanupTempRoot(tempRoot);
		throw error;
	}
}

async function downloadArchive(url, destination) {
	if (typeof fetch !== "function") {
		throw new UserFacingError(
			`전역 fetch를 찾을 수 없습니다. 최신 Bun/Node에서 실행하거나 \`git clone ${TEMPLATE_REPO}\` 후 레포 안에서 실행하거나 JEOMWON_TEMPLATE_ARCHIVE를 지정하세요.`,
		);
	}

	let response;
	try {
		response = await fetch(url);
	} catch (error) {
		throw new UserFacingError(templateAccessError(error.message));
	}

	if (!response.ok) {
		throw new UserFacingError(templateAccessError(`HTTP ${response.status}`));
	}

	let archive;
	try {
		archive = Buffer.from(await response.arrayBuffer());
	} catch (error) {
		throw new UserFacingError(templateAccessError(error.message));
	}

	await writeFile(destination, archive);
}

async function extractArchiveTemplate({ archivePath, tempRoot, logLine }) {
	if (!existsSync(archivePath)) {
		throw new UserFacingError(
			`JEOMWON_TEMPLATE_ARCHIVE 파일을 찾을 수 없습니다: ${archivePath}`,
		);
	}

	const workspace = tempRoot || (await mkdtemp(join(tmpdir(), "jeomwon-template-")));
	const extractRoot = join(workspace, "extract");
	await mkdir(extractRoot, { recursive: true });

	try {
		const archiveEntries = await listArchiveEntries(archivePath);
		const { prefix, entries } = findTemplateArchiveEntries(archiveEntries);
		await runTar([
			"-xzf",
			archivePath,
			"-C",
			extractRoot,
			...entries.map(escapeTarMemberPattern),
		]);

		const root = join(extractRoot, ...prefix.replace(/\/$/, "").split("/"));
		console.log(logLine(archivePath));
		return {
			root,
			cleanup: () => cleanupTempRoot(workspace),
		};
	} catch (error) {
		await cleanupTempRoot(workspace);
		throw error;
	}
}

async function listArchiveEntries(archivePath) {
	const output = await runTar(["-tzf", archivePath]);
	return output
		.split("\n")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function findTemplateArchiveEntries(entries) {
	const prefixes = new Set();

	for (const entry of entries) {
		const normalized = normalizeArchiveEntry(entry);
		if (!normalized) {
			continue;
		}

		const parts = normalized.split("/");
		const templateIndex = parts.indexOf("template");
		if (templateIndex === -1) {
			continue;
		}

		prefixes.add(`${parts.slice(0, templateIndex + 1).join("/")}/`);
	}

	if (prefixes.size === 0) {
		throw new UserFacingError(
			`tarball 안에서 template/ 디렉터리를 찾을 수 없습니다: ${entries.length}개 항목 검사됨`,
		);
	}

	const prefix = [...prefixes].sort(compareTemplatePrefixes)[0];
	const selectedEntries = entries.filter((entry) => {
		const normalized = normalizeArchiveEntry(entry);
		return (
			normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)
		);
	});

	return {
		prefix,
		entries: selectedEntries,
	};
}

function normalizeArchiveEntry(entry) {
	const normalized = entry
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/\/+$/, "");

	if (!normalized || normalized.startsWith("/")) {
		return "";
	}

	if (normalized.split("/").includes("..")) {
		return "";
	}

	return normalized;
}

function compareTemplatePrefixes(left, right) {
	const leftDepth = left.split("/").filter(Boolean).length;
	const rightDepth = right.split("/").filter(Boolean).length;
	return leftDepth - rightDepth || left.localeCompare(right);
}

function escapeTarMemberPattern(entry) {
	return entry.replace(/([\\*?\[\]])/g, "\\$1");
}

function runTar(args) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn("tar", args, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			if (error.code === "ENOENT") {
				rejectRun(
					new UserFacingError(
						"시스템 tar 명령을 찾을 수 없습니다. macOS/Linux 환경에서 tar가 있는 PATH로 다시 실행하세요.",
					),
				);
				return;
			}
			rejectRun(error);
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolveRun(stdout);
				return;
			}

			rejectRun(
				new UserFacingError(
					`tar 압축 해제에 실패했습니다: ${stderr.trim() || `exit ${code}`}`,
				),
			);
		});
	});
}

async function cleanupTempRoot(tempRoot) {
	await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}

function templateAccessError(detail) {
	return `template 다운로드 실패 (${detail}). 레포가 비공개이거나 접근 불가. \`git clone ${TEMPLATE_REPO}\` 후 레포 안에서 실행하거나 JEOMWON_TEMPLATE_ARCHIVE를 지정하세요.`;
}

async function copyTemplate(source, destination) {
	const entries = await readdir(source, { withFileTypes: true });

	for (const entry of entries) {
		if (shouldExclude(entry.name)) {
			continue;
		}

		const sourcePath = join(source, entry.name);
		const destinationPath = join(destination, entry.name);

		if (entry.isDirectory()) {
			await mkdir(destinationPath, { recursive: true });
			await copyTemplate(sourcePath, destinationPath);
			continue;
		}

		if (entry.isFile()) {
			await mkdir(dirname(destinationPath), { recursive: true });
			await copyFile(sourcePath, destinationPath);
		}
	}
}

function shouldExclude(name) {
	return EXCLUDED_NAMES.has(name) || name === ".env.local";
}

async function rewriteProject(root, slugValue) {
	const files = await listFiles(root);

	for (const file of files) {
		if (!isTextFile(file)) {
			continue;
		}

		let text = await readFile(file, "utf8");
		const original = text;
		text = text
			.replaceAll("@jeomwon/", `@${slugValue}/`)
			.replaceAll('"name": "jeomwon-app"', `"name": "${slugValue}"`);

		if (text !== original) {
			await writeFile(file, text, "utf8");
		}
	}
}

async function listFiles(root) {
	const output = [];
	const entries = await readdir(root, { withFileTypes: true });

	for (const entry of entries) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) {
			if (!shouldExclude(entry.name)) {
				output.push(...(await listFiles(path)));
			}
			continue;
		}
		if (entry.isFile()) {
			output.push(path);
		}
	}

	return output;
}

function isTextFile(filePath) {
	const extension = filePath.slice(filePath.lastIndexOf("."));
	if (TEXT_EXTENSIONS.has(extension)) {
		return true;
	}

	const baseName = filePath.slice(filePath.lastIndexOf("/") + 1);
	return (
		baseName === "LICENSE" ||
		baseName === "bun.lock" ||
		baseName === "bunfig.toml"
	);
}

function slugify(value) {
	return value
		.trim()
		.toLowerCase()
		.replace(/['"]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}
