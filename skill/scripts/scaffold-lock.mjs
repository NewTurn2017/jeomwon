import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { ScaffoldError } from "./scaffold-state.mjs";

export async function acquireBootstrapLock(target) {
	const path = join(
		dirname(target),
		`.${basename(target)}.jeomwon-bootstrap.lock`,
	);
	for (let attempt = 0; attempt < 2; attempt++) {
		let created = false;
		try {
			await mkdir(path, { mode: 0o700 });
			created = true;
			await writeFile(
				join(path, "owner.json"),
				`${JSON.stringify({ pid: process.pid })}\n`,
				{ mode: 0o600, flag: "wx" },
			);
			return { path, work: join(path, "work") };
		} catch (error) {
			if (created) {
				await rm(path, { recursive: true, force: true });
				throw error;
			}
			if (error?.code !== "EEXIST") throw error;
			const owner = await readOwner(path);
			if (processIsLive(owner.pid))
				throw new ScaffoldError("bootstrap_target_locked", `pid ${owner.pid}`);
			try {
				await rm(path, { recursive: true });
			} catch (cleanupError) {
				throw new ScaffoldError(
					"bootstrap_lock_cleanup_failed",
					String(cleanupError),
				);
			}
		}
	}
	throw new ScaffoldError("bootstrap_target_locked", target);
}

async function readOwner(path) {
	try {
		const lock = await lstat(path);
		const metadata = await lstat(join(path, "owner.json"));
		const owner = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
		if (
			!lock.isDirectory() ||
			lock.isSymbolicLink() ||
			!metadata.isFile() ||
			metadata.isSymbolicLink() ||
			Object.keys(owner).join("\0") !== "pid" ||
			!Number.isInteger(owner.pid) ||
			owner.pid <= 0
		)
			throw new Error();
		return owner;
	} catch {
		throw new ScaffoldError("bootstrap_lock_invalid", path);
	}
}
function processIsLive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error?.code !== "ESRCH";
	}
}
