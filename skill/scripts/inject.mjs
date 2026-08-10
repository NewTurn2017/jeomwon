#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fail as cliFail, createCli, parseCommonArgs } from "./cli.mjs";
import { readDomainPackJson } from "./domain-pack-json.mjs";
import { normalizeDomainPack } from "./domain-pack-schema.mjs";
import {
	errorDetail,
	InjectError,
	signalExitCodeFor,
} from "./inject-errors.mjs";
import {
	acquireTargetLock,
	installInterruptHandlers,
	releaseTargetLock,
	removeInterruptHandlers,
	waitAtLockBarrier,
} from "./inject-lock.mjs";
import { publishManagedOutputs } from "./inject-publication.mjs";

export { normalizeDomainPack } from "./domain-pack-schema.mjs";

async function main() {
	const parsed = parseCommonArgs(process.argv.slice(2));
	if (parsed.error) cliFail(parsed.error, parsed.detail);
	const cli = createCli("inject", parsed.language);
	const usage =
		"bun inject.mjs <target-dir> <domain-pack.json> [--lang ko|en|auto]";
	if (parsed.help) {
		cli.help(usage);
		return;
	}
	const [targetArg, packArg, ...extra] = parsed.positional;
	if (!targetArg || !packArg || extra.length > 0) cliFail("usage", usage);

	const targetDir = resolve(process.cwd(), targetArg);
	const packPath = resolve(process.cwd(), packArg);
	if (!existsSync(targetDir)) cliFail("target_missing", targetDir);
	const targetMetadata = await lstat(targetDir);
	if (!targetMetadata.isDirectory() || targetMetadata.isSymbolicLink()) {
		cliFail("target_invalid", "target must be a regular directory");
	}

	const lock = await acquireTargetLock(targetDir);
	let primaryError;
	let releaseError;
	let publication;
	let pack;
	try {
		installInterruptHandlers();
		await waitAtLockBarrier();
		if (!existsSync(packPath)) throw new InjectError("pack_missing", packPath);
		pack = normalizeDomainPack(await readDomainPackJson(packPath));
		publication = await publishManagedOutputs(targetDir, pack);
	} catch (error) {
		primaryError = error;
	} finally {
		removeInterruptHandlers();
		try {
			await releaseTargetLock(lock);
		} catch (error) {
			releaseError = error;
		}
	}

	if (primaryError || releaseError) {
		const primary = primaryError ?? releaseError;
		const secondary =
			primaryError && releaseError ? errorDetail(releaseError) : "";
		cli.error(
			primary?.code ?? "inject_publication_failed",
			`${errorDetail(primary)}${secondary ? `; secondary lock cleanup error: ${secondary}` : ""}`,
		);
		process.exitCode = signalExitCodeFor(primary);
		return;
	}

	console.log(`Injected domain pack: ${pack.domainKey}`);
	for (const path of publication.paths)
		console.log(`Wrote ${join(targetDir, path)}`);
}

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		const cli = createCli("inject");
		cli.error(error?.code ?? "inject_publication_failed", errorDetail(error));
		process.exitCode = signalExitCodeFor(error);
	}
}
