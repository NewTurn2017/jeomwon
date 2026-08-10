import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { InjectError } from "./inject-errors.mjs";

export async function snapshotManagedPath(path) {
	try {
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new InjectError(
				"inject_managed_path_invalid",
				`${path} must be absent or a regular file`,
			);
		}
		return { mode: metadata.mode & 0o777 };
	} catch (error) {
		if (error?.code === "ENOENT") return undefined;
		throw error;
	}
}

export async function managedPathExists(targetDir, path) {
	const fullPath = await assertManagedPath(targetDir, path, true);
	try {
		const metadata = await lstat(fullPath);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new InjectError(
				"inject_managed_path_invalid",
				`${fullPath} must be absent or a regular file`,
			);
		}
		return true;
	} catch (error) {
		if (error?.code === "ENOENT") return false;
		throw error;
	}
}

export async function assertManagedPath(targetDir, managedPath, allowAbsent) {
	const fullPath = join(targetDir, managedPath);
	const rel = relative(targetDir, fullPath);
	if (rel.startsWith(`..${sep}`) || rel === "..") {
		throw new InjectError("inject_managed_path_invalid", managedPath);
	}
	let cursor = targetDir;
	for (const part of managedPath.split("/").slice(0, -1)) {
		cursor = join(cursor, part);
		try {
			const metadata = await lstat(cursor);
			if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
				throw new InjectError(
					"inject_managed_path_invalid",
					`${cursor} must be a regular directory`,
				);
			}
		} catch (error) {
			if (allowAbsent && error?.code === "ENOENT") break;
			throw error;
		}
	}
	return fullPath;
}

export async function writeStaged(stageRoot, path, bytes) {
	const destination = join(stageRoot, path);
	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, bytes, { mode: 0o644, flag: "wx" });
	await chmod(destination, 0o644);
}

export async function resetOwnedWorkPath(path) {
	try {
		const metadata = await lstat(path);
		if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
			throw new InjectError(
				"inject_stale_state_invalid",
				`${path} is not an owned regular directory`,
			);
		}
		await rm(path, { recursive: true });
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	await mkdir(path, { mode: 0o700 });
}

export async function ensureOwnedWorkPathAvailable(path, code) {
	try {
		await lstat(path);
		throw new InjectError(code, `retained recovery requires review: ${path}`);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
}

export function formatGeneratedFiles(targetDir, paths) {
	if (paths.length === 0) return;
	const localBiome = join(targetDir, "node_modules/.bin/biome");
	const attempts = existsSync(localBiome)
		? [[localBiome, ["format", "--write", ...paths]]]
		: [
				[
					"bunx",
					["--offline", "@biomejs/biome", "format", "--write", ...paths],
				],
				["bunx", ["@biomejs/biome", "format", "--write", ...paths]],
			];
	for (const [command, args] of attempts) {
		const result = spawnSync(command, args, {
			cwd: targetDir,
			stdio: "ignore",
		});
		if (result.status === 0) return;
	}
	throw new Error("generated output formatter failed");
}
