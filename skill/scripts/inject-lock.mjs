import {
	lstat,
	mkdir,
	readFile,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { errorDetail, faultEnabled, InjectError } from "./inject-errors.mjs";

const LOCK_NAME = ".jeomwon-inject.lock";
let interruptedSignal;

export async function acquireTargetLock(targetDir) {
	const canonicalTarget = await realpath(targetDir);
	const lockPath = join(canonicalTarget, LOCK_NAME);
	for (let attempt = 0; attempt < 2; attempt++) {
		let created = false;
		try {
			await mkdir(lockPath, { mode: 0o700 });
			created = true;
			const metadataPath = join(lockPath, "owner.json");
			await writeFile(
				metadataPath,
				`${JSON.stringify({ pid: process.pid })}\n`,
				{
					encoding: "utf8",
					mode: 0o600,
					flag: "wx",
				},
			);
			return { path: lockPath, target: canonicalTarget };
		} catch (error) {
			if (created) {
				await rm(lockPath, { recursive: true, force: true });
				throw error;
			}
			if (error?.code !== "EEXIST") throw error;
			const owner = await readLockOwner(lockPath);
			if (processIsLive(owner.pid)) {
				throw new InjectError(
					"inject_target_locked",
					`target is locked by pid ${owner.pid}`,
				);
			}
			const stalePath = `${lockPath}.dead-${owner.pid}`;
			try {
				await rename(lockPath, stalePath);
				await rm(stalePath, { recursive: true, force: true });
			} catch (reclaimError) {
				if (reclaimError?.code === "ENOENT") continue;
				throw new InjectError(
					"inject_lock_cleanup_failed",
					errorDetail(reclaimError),
				);
			}
		}
	}
	throw new InjectError(
		"inject_target_locked",
		"target lock changed concurrently",
	);
}

async function readLockOwner(lockPath) {
	try {
		const lockMetadata = await lstat(lockPath);
		if (!lockMetadata.isDirectory() || lockMetadata.isSymbolicLink()) {
			throw new Error("lock path is not a regular directory");
		}
		const metadataPath = join(lockPath, "owner.json");
		const metadata = await lstat(metadataPath);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new Error("lock owner metadata is not a regular file");
		}
		const owner = JSON.parse(await readFile(metadataPath, "utf8"));
		if (
			owner === null ||
			typeof owner !== "object" ||
			Object.keys(owner).join("\0") !== "pid" ||
			!Number.isInteger(owner.pid) ||
			owner.pid <= 0
		) {
			throw new Error("lock owner metadata is invalid");
		}
		return owner;
	} catch (error) {
		throw new InjectError("inject_lock_invalid", errorDetail(error));
	}
}

function processIsLive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (error?.code === "ESRCH") return false;
		return true;
	}
}

export async function releaseTargetLock(lock) {
	if (faultEnabled("release")) throw new Error("injected lock-release EACCES");
	await rm(lock.path, { recursive: true });
}

function onInterrupt(signal) {
	interruptedSignal = signal;
}

export function installInterruptHandlers() {
	process.on("SIGINT", onInterrupt);
	process.on("SIGTERM", onInterrupt);
}

export function removeInterruptHandlers() {
	process.off("SIGINT", onInterrupt);
	process.off("SIGTERM", onInterrupt);
}

export function checkInterrupt() {
	if (!interruptedSignal) return;
	const signal = interruptedSignal;
	interruptedSignal = undefined;
	throw new InjectError(
		"inject_interrupted",
		`interrupted by ${signal}`,
		signal === "SIGINT" ? 130 : 143,
	);
}

export async function waitAtLockBarrier() {
	const barrierPath = process.env.JEOMWON_INJECT_BARRIER_AFTER_LOCK;
	if (!barrierPath) return;
	console.log("[BARRIER inject_locked]");
	await readFile(barrierPath);
	checkInterrupt();
}
