#!/usr/bin/env bun
import { existsSync } from "node:fs";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const TEMPLATE_ROOT = join(REPO_ROOT, "template");
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

if (!existsSync(TEMPLATE_ROOT)) {
	fail(`missing template directory: ${TEMPLATE_ROOT}`);
}

if (existsSync(targetDir)) {
	const entries = await readdir(targetDir);
	if (entries.length > 0) {
		fail(`target directory already exists and is not empty: ${targetDir}`);
	}
}

await mkdir(targetDir, { recursive: true });
await copyTemplate(TEMPLATE_ROOT, targetDir);
await rewriteProject(targetDir, slug, projectName);

console.log(`Scaffolded ${projectName}`);
console.log(`Target: ${targetDir}`);
console.log(`NPM scope: @${slug}/`);
console.log("");
console.log("Next:");
console.log(`  cd ${relative(process.cwd(), targetDir) || "."}`);
console.log(
	`  bun ${join(REPO_ROOT, "skill/scripts/inject.mjs")} . <domain-pack.json>`,
);
console.log("  bun setup");
console.log(
	"  git init && git add . && git commit -m 'Initial jeomwon scaffold'",
);

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

async function rewriteProject(root, slugValue, displayName) {
	const files = await listFiles(root);

	for (const file of files) {
		if (!isTextFile(file)) {
			continue;
		}

		let text = await readFile(file, "utf8");
		const original = text;
		text = text
			.replaceAll("@v1/", `@${slugValue}/`)
			.replaceAll('"name": "v1"', `"name": "${slugValue}"`)
			.replaceAll("<b>Create v1</b>", `<b>${escapeHtml(displayName)}</b>`)
			.replaceAll("Create v1", displayName)
			.replaceAll("new v1 project", `new ${displayName} project`)
			.replaceAll("v1 project", `${displayName} project`)
			.replaceAll("cd v1", `cd ${slugValue}`)
			.replaceAll("get-convex/v1 v1", `get-convex/v1 ${slugValue}`);

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

function escapeHtml(value) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
