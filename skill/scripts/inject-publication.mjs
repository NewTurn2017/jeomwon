import { chmod, mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	renderDomainConfig,
	renderReservationSample,
} from "./domain-pack-render.mjs";
import { withoutSchemaVersion } from "./domain-pack-schema.mjs";
import { errorDetail, faultEnabled, InjectError } from "./inject-errors.mjs";
import { checkInterrupt } from "./inject-lock.mjs";
import {
	BACKUP_NAME,
	MANAGED_DOMAIN_CONFIG,
	MANAGED_DOMAIN_PACK,
	MANAGED_EMAIL_SAMPLE,
	MANAGED_RECEIPT,
	RECOVERY_NAME,
	STAGE_NAME,
} from "./inject-managed.mjs";
import {
	assertManagedPath,
	ensureOwnedWorkPathAvailable,
	formatGeneratedFiles,
	resetOwnedWorkPath,
	snapshotManagedPath,
	writeStaged,
} from "./inject-paths.mjs";
import {
	readEstablishedReceipt,
	updateEstablishedReceipt,
} from "./inject-receipt.mjs";

export async function publishManagedOutputs(targetDir, pack) {
	const priorReceipt = await readEstablishedReceipt(targetDir);
	const stageRoot = join(targetDir, STAGE_NAME);
	const backupRoot = join(targetDir, BACKUP_NAME);
	const recoveryRoot = join(targetDir, RECOVERY_NAME);
	await ensureOwnedWorkPathAvailable(recoveryRoot, "inject_recovery_required");
	await resetOwnedWorkPath(stageRoot);
	await resetOwnedWorkPath(backupRoot);

	let rollbackIncomplete = false;
	let operationError;
	let result;
	try {
		const includeEmail = Object.hasOwn(
			priorReceipt.managedOutputs,
			MANAGED_EMAIL_SAMPLE,
		);
		const renderablePack = withoutSchemaVersion(pack);
		const outputs = [
			{
				path: MANAGED_DOMAIN_PACK,
				bytes: Buffer.from(`${JSON.stringify(pack, null, 2)}\n`),
			},
			{
				path: MANAGED_DOMAIN_CONFIG,
				bytes: Buffer.from(`${renderDomainConfig(renderablePack).trim()}\n`),
			},
			...(includeEmail
				? [
						{
							path: MANAGED_EMAIL_SAMPLE,
							bytes: Buffer.from(
								`${renderReservationSample(renderablePack).trim()}\n`,
							),
						},
					]
				: []),
		];
		for (const output of outputs) {
			await assertManagedPath(targetDir, output.path, true);
			const previous = await snapshotManagedPath(join(targetDir, output.path));
			output.mode = previous?.mode ?? 0o644;
			await writeStaged(stageRoot, output.path, output.bytes);
			if (faultEnabled(`stage:${outputs.indexOf(output) + 1}`)) {
				throw new Error(`injected staging failure at ${output.path}`);
			}
		}
		formatGeneratedFiles(
			targetDir,
			outputs
				.filter((output) => output.path.endsWith(".ts"))
				.map((output) => join(stageRoot, output.path)),
		);
		checkInterrupt();
		for (const output of outputs) {
			output.bytes = await readFile(join(stageRoot, output.path));
		}
		const receipt = updateEstablishedReceipt(priorReceipt, pack, outputs);
		const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
		await assertManagedPath(targetDir, MANAGED_RECEIPT, true);
		await writeStaged(stageRoot, MANAGED_RECEIPT, receiptBytes);
		outputs.push({ path: MANAGED_RECEIPT, bytes: receiptBytes });

		const touched = [];
		try {
			for (const output of outputs) {
				checkInterrupt();
				const destination = join(targetDir, output.path);
				const backup = join(backupRoot, output.path);
				const previous = await snapshotManagedPath(destination);
				if (previous) {
					await mkdir(dirname(backup), { recursive: true });
					await rename(destination, backup);
				}
				touched.push({ ...output, destination, backup, previous });
				await mkdir(dirname(destination), { recursive: true });
				await rename(join(stageRoot, output.path), destination);
				if (previous) await chmod(destination, previous.mode);
				if (faultEnabled(`publish:${touched.length}`)) {
					throw new Error(`injected publication failure at ${output.path}`);
				}
			}
		} catch (publicationError) {
			const rollbackErrors = await rollbackTouched(touched);
			if (rollbackErrors.length > 0) {
				rollbackIncomplete = true;
				const retention = await retainRecoveryBackups(backupRoot, recoveryRoot);
				throw new InjectError(
					"inject_recovery_required",
					`publication failed: ${errorDetail(publicationError)}; rollback failed: ${rollbackErrors.join("; ")}; retained backup: ${retention.path}${retention.error ? `; recovery retention error: ${retention.error}` : ""}`,
				);
			}
			throw new InjectError(
				"inject_publication_failed",
				`publication failed and prior bytes/modes were restored: ${errorDetail(publicationError)}`,
				publicationError instanceof InjectError ? publicationError.exitCode : 1,
			);
		}
		result = { paths: outputs.map((output) => output.path) };
	} catch (error) {
		operationError =
			error instanceof InjectError
				? error
				: new InjectError("inject_publication_failed", errorDetail(error));
	} finally {
		if (!rollbackIncomplete) {
			let cleanupError = faultEnabled("cleanup")
				? new Error("injected stage-cleanup EACCES")
				: undefined;
			if (!cleanupError) {
				try {
					await rm(stageRoot, { recursive: true, force: true });
					await rm(backupRoot, { recursive: true, force: true });
				} catch (error) {
					cleanupError = error;
				}
			}
			if (cleanupError && operationError) {
				operationError.message += `; secondary stage cleanup error: ${errorDetail(cleanupError)}`;
			} else if (cleanupError) {
				operationError = new InjectError(
					"inject_cleanup_failed",
					errorDetail(cleanupError),
				);
			}
		}
	}
	if (operationError) throw operationError;
	return result;
}

async function rollbackTouched(touched) {
	const errors = [];
	for (const [index, item] of [...touched].reverse().entries()) {
		try {
			if (faultEnabled(`rollback:${index + 1}`)) {
				throw new Error(`injected rollback EACCES at ${item.path}`);
			}
			await rm(item.destination, { force: true });
			if (item.previous) {
				await rename(item.backup, item.destination);
				await chmod(item.destination, item.previous.mode);
			}
		} catch (error) {
			errors.push(`${item.path}: ${errorDetail(error)}`);
		}
	}
	return errors;
}

async function retainRecoveryBackups(backupRoot, recoveryRoot) {
	try {
		await rm(recoveryRoot, { recursive: true, force: true });
		await rename(backupRoot, recoveryRoot);
		return { path: recoveryRoot };
	} catch (error) {
		return { path: backupRoot, error: errorDetail(error) };
	}
}
