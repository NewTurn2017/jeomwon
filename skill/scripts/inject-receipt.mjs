import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDomainPack } from "./domain-pack-schema.mjs";
import { errorDetail, InjectError } from "./inject-errors.mjs";
import { MANAGED_RECEIPT } from "./inject-managed.mjs";
import {
	createEstablishedReceipt,
	projectIdentity,
	updateEstablishedReceipt,
	validReceipt,
} from "./inject-receipt-schema.mjs";
import { hashReleaseContracts, sha256 } from "./release-contract.mjs";

export { createEstablishedReceipt, updateEstablishedReceipt };

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export async function readEstablishedReceipt(targetDir) {
	const path = join(targetDir, MANAGED_RECEIPT);
	let metadata;
	try {
		metadata = await lstat(path);
	} catch (error) {
		if (error?.code === "ENOENT") {
			throw new InjectError(
				"inject_receipt_missing",
				"established project receipt is required",
			);
		}
		throw new InjectError("inject_receipt_invalid", errorDetail(error));
	}
	if (
		!metadata.isFile() ||
		metadata.isSymbolicLink() ||
		(metadata.mode & 0o777) !== 0o644
	) {
		throw new InjectError(
			"inject_receipt_invalid",
			"receipt must be a regular mode-0644 file",
		);
	}
	let receipt;
	try {
		receipt = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		throw new InjectError("inject_receipt_invalid", errorDetail(error));
	}
	if (!validReceipt(receipt)) {
		const code = [1, 2].includes(receipt?.schemaVersion)
			? "inject_receipt_unsupported"
			: "inject_receipt_invalid";
		throw new InjectError(code, "receipt schema is invalid");
	}
	await validateCurrentIdentity(targetDir, receipt);
	await validateManagedState(targetDir, receipt);
	await validateDomainIdentity(targetDir, receipt);
	return receipt;
}

export async function validateEstablishedReceipt(targetDir, receipt) {
	if (!validReceipt(receipt))
		throw new InjectError(
			"inject_receipt_invalid",
			"receipt schema is invalid",
		);
	await validateCurrentIdentity(targetDir, receipt);
	await validateManagedState(targetDir, receipt);
	await validateDomainIdentity(targetDir, receipt);
	return receipt;
}

async function validateCurrentIdentity(targetDir, receipt) {
	const template = await readJson(targetDir, "jeomwon-template.json");
	const packageManifest = await readJson(targetDir, "package.json");
	const expectedIdentity = projectIdentity(
		receipt.projectName,
		receipt.projectSlug,
	);
	if (
		receipt.projectIdentity !== expectedIdentity ||
		packageManifest.name !== receipt.projectSlug ||
		template.templateVersion !== receipt.templateVersion ||
		template.templateApi !== receipt.templateApi ||
		JSON.stringify(template.contracts) !== JSON.stringify(receipt.contracts) ||
		JSON.stringify(template.templateSource) !==
			JSON.stringify(receipt.templateSource)
	)
		throw new InjectError(
			"inject_receipt_mismatch",
			"project or template identity mismatch",
		);
	const currentHashes = await hashReleaseContracts(targetDir);
	if (JSON.stringify(currentHashes) !== JSON.stringify(receipt.contractFiles)) {
		throw new InjectError(
			"inject_receipt_mismatch",
			"release contract identity mismatch",
		);
	}
	try {
		const skill = JSON.parse(
			await readFile(join(SCRIPT_DIR, "../jeomwon-skill.json"), "utf8"),
		);
		if (
			skill.skillVersion !== receipt.skillVersion ||
			skill.compatibility.templateVersion !== receipt.templateVersion ||
			skill.compatibility.templateApi !== receipt.templateApi ||
			JSON.stringify({
				domainPackWriter: skill.compatibility.domainPackWriter,
				capabilitySchema: skill.compatibility.capabilitySchema,
				setupSchema: skill.compatibility.setupSchema,
				qaContract: skill.compatibility.qaContract,
			}) !== JSON.stringify(receipt.contracts)
		)
			throw new Error("skill compatibility mismatch");
	} catch (error) {
		throw new InjectError("inject_receipt_mismatch", errorDetail(error));
	}
}

async function validateDomainIdentity(targetDir, receipt) {
	let currentPack;
	try {
		currentPack = normalizeDomainPack(
			await readJson(targetDir, "domain-pack.json"),
		);
	} catch (error) {
		throw new InjectError("inject_receipt_mismatch", errorDetail(error));
	}
	if (
		JSON.stringify(currentPack) !== JSON.stringify(receipt.domainPack.canonical)
	)
		throw new InjectError(
			"inject_receipt_mismatch",
			"domain pack identity mismatch",
		);
}

async function validateManagedState(targetDir, receipt) {
	for (const [path, expected] of Object.entries(receipt.managedOutputs)) {
		try {
			const metadata = await lstat(join(targetDir, path));
			if (
				!metadata.isFile() ||
				metadata.isSymbolicLink() ||
				(metadata.mode & 0o777) !== expected.mode ||
				sha256(await readFile(join(targetDir, path))) !== expected.sha256
			)
				throw new Error();
		} catch {
			throw new InjectError(
				"inject_managed_state_mismatch",
				`managed output does not match receipt: ${path}`,
			);
		}
	}
}

async function readJson(root, relativePath) {
	try {
		const path = join(root, relativePath);
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error();
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		throw new InjectError(
			"inject_receipt_mismatch",
			`${relativePath}: ${errorDetail(error)}`,
		);
	}
}
