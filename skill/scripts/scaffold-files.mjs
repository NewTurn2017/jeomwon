import { createHash } from "node:crypto";
import {
	copyFile,
	lstat,
	mkdir,
	readdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";

const EXCLUDED = new Set([
	".next",
	".react-email",
	".turbo",
	"node_modules",
	"qa-artifacts",
]);
const TEXT = new Set([
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

export async function copyTemplate(source, destination, checkInterrupt) {
	for (const entry of await readdir(source, { withFileTypes: true })) {
		checkInterrupt();
		if (excluded(entry.name)) continue;
		const from = join(source, entry.name);
		const to = join(destination, entry.name);
		if (entry.isDirectory()) {
			await mkdir(to, { recursive: true });
			await copyTemplate(from, to, checkInterrupt);
		} else if (entry.isFile()) {
			await mkdir(dirname(to), { recursive: true });
			await copyFile(from, to);
		}
	}
}

export async function rewriteProject(root, slug, checkInterrupt) {
	for (const file of await listFiles(root)) {
		checkInterrupt();
		if (!isText(file)) continue;
		const original = await readFile(file, "utf8");
		const text = original
			.replaceAll("@jeomwon/", `@${slug}/`)
			.replaceAll('"name": "jeomwon-app"', `"name": "${slug}"`)
			.replaceAll('"name":"jeomwon-app"', `"name":"${slug}"`);
		if (text !== original) await writeFile(file, text, "utf8");
	}
}

export async function snapshotFile(path) {
	try {
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink())
			return { type: "other" };
		return {
			type: "file",
			mode: metadata.mode & 0o777,
			sha256: createHash("sha256")
				.update(await readFile(path))
				.digest("hex"),
		};
	} catch (error) {
		if (error?.code === "ENOENT") return undefined;
		throw error;
	}
}

export function sameSnapshot(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

export async function stampTemplateSource(root, templateSource) {
	const path = join(root, "jeomwon-template.json");
	const manifest = JSON.parse(await readFile(path, "utf8"));
	await writeFile(
		path,
		`${JSON.stringify({ ...manifest, templateSource }, null, 2)}\n`,
		"utf8",
	);
}

export async function hashTemplateContent(root) {
	const hash = createHash("sha256");
	for (const file of (await listFiles(root)).sort()) {
		hash.update(relative(root, file).split("\\").join("/")).update("\0");
		hash.update(await readFile(file)).update("\0");
	}
	return hash.digest("hex");
}

async function listFiles(root) {
	const output = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory() && !excluded(entry.name))
			output.push(...(await listFiles(path)));
		else if (entry.isFile()) output.push(path);
	}
	return output;
}

function excluded(name) {
	return EXCLUDED.has(name) || name === ".env.local";
}
function isText(path) {
	return (
		TEXT.has(extname(path)) ||
		["LICENSE", "bun.lock", "bunfig.toml"].includes(basename(path))
	);
}

export function slugify(value) {
	return value
		.trim()
		.toLowerCase()
		.replace(/["']/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}
