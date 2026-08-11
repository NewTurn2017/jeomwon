import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { ScaffoldError } from "./scaffold-state.mjs";

export async function readSkillManifest(skillRoot) {
	try {
		const value = JSON.parse(
			await readFile(join(skillRoot, "jeomwon-skill.json"), "utf8"),
		);
		if (
			value?.schemaVersion !== 1 ||
			typeof value.skillVersion !== "string" ||
			value.templateSource?.kind !== "bundled-archive" ||
			!isSha(value.templateSource.archiveSha256) ||
			!isSha(value.templateSource.contentSha256)
		)
			throw new Error("invalid schema");
		return value;
	} catch (error) {
		throw new ScaffoldError(
			"skill_manifest_invalid",
			error instanceof Error ? error.message : String(error),
		);
	}
}

export async function resolveTemplateSource(
	workspace,
	skillRoot,
	repoRoot,
	manifest,
	checkInterrupt,
) {
	const configuredArchive = process.env.JEOMWON_TEMPLATE_ARCHIVE;
	if (configuredArchive) {
		const archiveSha256 = requiredArchiveHash();
		const archive = resolve(configuredArchive);
		await verifyArchive(archive, archiveSha256);
		return {
			root: await extractArchive(
				archive,
				join(workspace, "archive-source"),
				checkInterrupt,
			),
			source: { kind: "archive", archiveSha256 },
		};
	}
	const ref = process.env.JEOMWON_TEMPLATE_REF;
	if (ref) return resolveGitRef(ref, workspace, checkInterrupt);
	const local = join(repoRoot, "template");
	if (existsSync(local)) {
		const sourceCommit = cleanLocalCommit(repoRoot);
		return {
			root: local,
			source: { kind: "local", ...(sourceCommit ? { sourceCommit } : {}) },
		};
	}
	const archive = resolve(skillRoot, manifest.templateSource.archivePath);
	await verifyArchive(archive, manifest.templateSource.archiveSha256);
	return {
		root: await extractArchive(
			archive,
			join(workspace, "bundled-source"),
			checkInterrupt,
		),
		expectedContentHash: manifest.templateSource.contentSha256,
		source: {
			kind: "bundled-archive",
			archiveSha256: manifest.templateSource.archiveSha256,
		},
	};
}

async function resolveGitRef(ref, workspace, checkInterrupt) {
	if (["main", "master", "HEAD"].includes(ref))
		throw new ScaffoldError("template_ref_mutable", ref);
	if (!/^[a-f0-9]{40}$/i.test(ref))
		throw new ScaffoldError("template_ref_not_immutable", ref);
	const sourceCommit = ref.toLowerCase();
	const archiveSha256 = requiredArchiveHash();
	const repository = process.env.JEOMWON_TEMPLATE_GIT_REPOSITORY;
	const archive = join(workspace, "git-ref.tar.gz");
	if (repository) {
		const resolved = Bun.spawnSync({
			cmd: [
				"git",
				"-C",
				resolve(repository),
				"rev-parse",
				`${sourceCommit}^{commit}`,
			],
			stdout: "pipe",
			stderr: "ignore",
		});
		if (
			resolved.exitCode !== 0 ||
			resolved.stdout.toString().trim().toLowerCase() !== sourceCommit
		)
			throw new ScaffoldError("template_ref_unresolved", sourceCommit);
		const result = Bun.spawnSync({
			cmd: [
				"git",
				"-C",
				resolve(repository),
				"archive",
				"--format=tar.gz",
				`--prefix=jeomwon-${sourceCommit}/`,
				sourceCommit,
			],
			stdout: "pipe",
			stderr: "ignore",
		});
		if (result.exitCode !== 0)
			throw new ScaffoldError("template_ref_archive_failed", sourceCommit);
		await writeFile(archive, result.stdout);
	} else {
		let response;
		try {
			response = await fetch(
				`https://codeload.github.com/NewTurn2017/jeomwon/tar.gz/${sourceCommit}`,
			);
		} catch (error) {
			throw new ScaffoldError("archive_download", String(error));
		}
		if (!response.ok)
			throw new ScaffoldError("archive_download", `HTTP ${response.status}`);
		await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
	}
	await verifyArchive(archive, archiveSha256);
	return {
		root: await extractArchive(
			archive,
			join(workspace, "git-source"),
			checkInterrupt,
		),
		source: { kind: "git-ref", sourceCommit, archiveSha256 },
	};
}

async function extractArchive(path, workspace, checkInterrupt) {
	if (!existsSync(path)) throw new ScaffoldError("archive_missing", path);
	let files;
	try {
		files = await new Bun.Archive(await Bun.file(path).bytes()).files();
	} catch (error) {
		throw new ScaffoldError("archive_invalid", String(error));
	}
	const names = [...files.keys()];
	for (const name of names)
		if (unsafe(name)) throw new ScaffoldError("archive_traversal", name);
	const prefix = templatePrefix(names);
	const output = join(workspace, "template");
	console.log(`Template fallback: immutable archive ${path}`);
	for (const [name, file] of files) {
		checkInterrupt();
		if (!name.startsWith(prefix) || name === prefix) continue;
		const relativePath = name.slice(prefix.length);
		const destination = resolve(output, ...relativePath.split("/"));
		if (!destination.startsWith(`${output}${sep}`))
			throw new ScaffoldError("archive_traversal", name);
		await mkdir(dirname(destination), { recursive: true });
		await writeFile(destination, new Uint8Array(await file.arrayBuffer()));
	}
	return output;
}

async function verifyArchive(path, expected) {
	if (!existsSync(path)) throw new ScaffoldError("archive_missing", path);
	const actual = createHash("sha256")
		.update(await Bun.file(path).bytes())
		.digest("hex");
	if (actual !== expected)
		throw new ScaffoldError(
			"archive_checksum_mismatch",
			`${actual} (expected ${expected})`,
		);
}
function requiredArchiveHash() {
	const value = process.env.JEOMWON_TEMPLATE_ARCHIVE_SHA256?.toLowerCase();
	if (!value)
		throw new ScaffoldError(
			"archive_checksum_missing",
			"JEOMWON_TEMPLATE_ARCHIVE_SHA256",
		);
	if (!isSha(value)) throw new ScaffoldError("archive_checksum_invalid", value);
	return value;
}
function cleanLocalCommit(repoRoot) {
	const status = Bun.spawnSync({
		cmd: [
			"git",
			"-C",
			repoRoot,
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
		cmd: ["git", "-C", repoRoot, "rev-parse", "HEAD"],
		stdout: "pipe",
		stderr: "ignore",
	});
	const commit = result.stdout.toString().trim().toLowerCase();
	return result.exitCode === 0 && /^[a-f0-9]{40}$/.test(commit)
		? commit
		: undefined;
}
function templatePrefix(names) {
	const values = names
		.map((name) => name.replaceAll("\\", "/"))
		.map((name) => {
			const parts = name.split("/");
			const index = parts.indexOf("template");
			return index < 0 ? "" : `${parts.slice(0, index + 1).join("/")}/`;
		})
		.filter(Boolean)
		.sort((a, b) => a.length - b.length || a.localeCompare(b));
	if (!values[0])
		throw new ScaffoldError(
			"archive_template_missing",
			`${names.length} entries`,
		);
	return values[0];
}
function unsafe(name) {
	const value = name.replaceAll("\\", "/");
	return (
		value.startsWith("/") ||
		value.startsWith("//") ||
		/^[A-Za-z]:\//.test(value) ||
		value.split("/").includes("..")
	);
}
function isSha(value) {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
