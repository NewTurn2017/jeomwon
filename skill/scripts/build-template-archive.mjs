#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const skillRoot = resolve(scriptDirectory, "..");
const templateRoot = join(repositoryRoot, "template");
const manifestPath = join(skillRoot, "jeomwon-skill.json");
const defaultOutput = join(
	skillRoot,
	"assets",
	"jeomwon-template-v0.1.0.tar.gz",
);
const excludedNames = new Set([
	".DS_Store",
	".env.local",
	".next",
	".react-email",
	".turbo",
	"node_modules",
	"qa-artifacts",
]);

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] === "--help")) {
	console.log("bun build-template-archive.mjs [--check|output.tar.gz]");
	process.exit(args[0] === "--help" ? 0 : 1);
}
const check = args[0] === "--check";
const output = resolve(
	process.cwd(),
	check ? defaultOutput : args[0] || defaultOutput,
);
const built = await buildArchive();

if (check) {
	await checkArchive(built);
} else {
	await writeArchive(output, built.compressed);
	console.log(
		`BUNDLED TEMPLATE ${output} ${built.compressed.byteLength} bytes archiveSha256=${built.archiveSha256} contentSha256=${built.contentSha256}`,
	);
}

async function buildArchive() {
	const chunks = [];
	const contentHash = createHash("sha256");
	for (const path of await listFiles(templateRoot)) {
		const member = relative(templateRoot, path).split("\\").join("/");
		const content = new Uint8Array(await Bun.file(path).arrayBuffer());
		contentHash.update(member);
		contentHash.update("\0");
		contentHash.update(content);
		contentHash.update("\0");
		chunks.push(
			tarHeader(`jeomwon-bundled/template/${member}`, content.length),
		);
		chunks.push(content);
		const padding = (512 - (content.length % 512)) % 512;
		if (padding) chunks.push(new Uint8Array(padding));
	}
	chunks.push(new Uint8Array(1024));
	const compressed = Bun.gzipSync(Buffer.concat(chunks), { level: 9 });
	return {
		compressed,
		archiveSha256: sha256(compressed),
		contentSha256: contentHash.digest("hex"),
	};
}

async function checkArchive(built) {
	const issues = [];
	let manifest;
	try {
		manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	} catch {
		issues.push("skill_manifest_invalid");
	}
	const source = manifest?.templateSource;
	const archivePath =
		typeof source?.archivePath === "string"
			? resolve(skillRoot, source.archivePath)
			: defaultOutput;
	if (!existsSync(archivePath)) issues.push("bundled_archive_missing");

	const checkRoot = await mkdtemp(join(tmpdir(), "jeomwon-template-check-"));
	const rebuiltPath = join(checkRoot, "rebuilt.tar.gz");
	try {
		await Bun.write(rebuiltPath, built.compressed);
		if (existsSync(archivePath)) {
			const checkedIn = new Uint8Array(
				await Bun.file(archivePath).arrayBuffer(),
			);
			if (
				!Buffer.from(checkedIn).equals(
					Buffer.from(await Bun.file(rebuiltPath).bytes()),
				)
			)
				issues.push("bundled_archive_stale");
			const actualArchiveSha = sha256(checkedIn);
			if (source?.archiveSha256 !== actualArchiveSha)
				issues.push("bundled_archive_sha_mismatch");
		}
		if (source?.archiveSha256 !== built.archiveSha256)
			issues.push("rebuilt_archive_sha_mismatch");
		if (source?.contentSha256 !== built.contentSha256)
			issues.push("bundled_content_sha_mismatch");
	} finally {
		await rm(checkRoot, { recursive: true, force: true });
	}
	if (issues.length > 0) {
		console.error(
			`BUNDLED TEMPLATE CHECK FAIL ${[...new Set(issues)].join(",")}`,
		);
		process.exit(1);
	}
	console.log(
		`BUNDLED TEMPLATE CHECK PASS archiveSha256=${built.archiveSha256} contentSha256=${built.contentSha256}`,
	);
}

async function writeArchive(path, bytes) {
	await mkdir(dirname(path), { recursive: true });
	const temporaryOutput = `${path}.tmp-${process.pid}`;
	try {
		await Bun.write(temporaryOutput, bytes);
		await rename(temporaryOutput, path);
	} finally {
		await rm(temporaryOutput, { force: true });
	}
}

async function listFiles(root) {
	const output = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (excludedNames.has(entry.name)) continue;
		const path = join(root, entry.name);
		if (entry.isDirectory()) output.push(...(await listFiles(path)));
		else if (entry.isFile()) output.push(path);
	}
	return output.sort();
}

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

function tarHeader(path, size) {
	const header = new Uint8Array(512);
	const split = splitUstarPath(path);
	writeText(header, 0, 100, split.name);
	writeOctal(header, 100, 8, 0o644);
	writeOctal(header, 108, 8, 0);
	writeOctal(header, 116, 8, 0);
	writeOctal(header, 124, 12, size);
	writeOctal(header, 136, 12, 0);
	header.fill(0x20, 148, 156);
	header[156] = "0".charCodeAt(0);
	writeText(header, 257, 6, "ustar\0");
	writeText(header, 263, 2, "00");
	writeText(header, 265, 32, "root");
	writeText(header, 297, 32, "root");
	writeText(header, 345, 155, split.prefix);
	const checksum = header.reduce((sum, byte) => sum + byte, 0);
	writeText(header, 148, 6, checksum.toString(8).padStart(6, "0"));
	header[154] = 0;
	header[155] = 0x20;
	return header;
}

function splitUstarPath(path) {
	if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
	for (
		let index = path.lastIndexOf("/");
		index > 0;
		index = path.lastIndexOf("/", index - 1)
	) {
		const prefix = path.slice(0, index);
		const name = path.slice(index + 1);
		if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100)
			return { name, prefix };
	}
	throw new Error(`template path exceeds ustar limits: ${path}`);
}

function writeOctal(buffer, offset, length, value) {
	writeText(
		buffer,
		offset,
		length,
		`${value.toString(8).padStart(length - 1, "0")}\0`,
	);
}

function writeText(buffer, offset, length, value) {
	const bytes = Buffer.from(value);
	if (bytes.length > length)
		throw new Error(`tar field exceeds ${length} bytes`);
	buffer.set(bytes, offset);
}
