import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOMAIN_PACK_SCHEMA_VERSION } from "./domain-pack-constants.mjs";
import { errorDetail, InjectError } from "./inject-errors.mjs";
import { MANAGED_DOMAIN_PACK, MANAGED_RECEIPT } from "./inject-managed.mjs";

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

export async function readPriorReceipt(targetDir) {
	const path = join(targetDir, MANAGED_RECEIPT);
	try {
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new InjectError(
				"inject_managed_path_invalid",
				`${path} must be a regular file`,
			);
		}
		const value = JSON.parse(await readFile(path, "utf8"));
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			throw new Error("receipt must be an object");
		}
		return value;
	} catch (error) {
		if (error?.code === "ENOENT") return undefined;
		if (error instanceof InjectError) throw error;
		throw new InjectError("inject_receipt_invalid", errorDetail(error));
	}
}

export async function resolveCompatibility(targetDir, priorReceipt) {
	const manifest = await readRequiredJson(
		join(targetDir, "jeomwon-template.json"),
		"template manifest",
	);
	if (
		!Number.isInteger(manifest.templateApi) ||
		!validContracts(manifest.contracts)
	) {
		throw new InjectError(
			"inject_compatibility_invalid",
			"template manifest omits the compatibility tuple",
		);
	}
	if (priorReceipt) {
		if (
			!validContracts(priorReceipt.contracts) ||
			!Number.isInteger(priorReceipt.templateApi)
		) {
			throw new InjectError(
				"inject_receipt_invalid",
				"prior receipt omits the compatibility tuple",
			);
		}
		if (
			priorReceipt.templateApi !== manifest.templateApi ||
			JSON.stringify(priorReceipt.contracts) !==
				JSON.stringify(manifest.contracts)
		) {
			throw new InjectError(
				"inject_compatibility_invalid",
				"prior receipt and target template compatibility mismatch",
			);
		}
	}
	const setup = await readRequiredJson(
		join(targetDir, "setup-config.json"),
		"setup contract",
	);
	if (setup.schemaVersion !== manifest.contracts.setupSchema) {
		throw new InjectError(
			"inject_compatibility_invalid",
			"setup schema mismatch",
		);
	}
	return {
		templateApi: manifest.templateApi,
		contracts: manifest.contracts,
		capabilityManifestSha256: await hashRequiredContractFile(
			targetDir,
			"jeomwon-capabilities.json",
			manifest.contracts.capabilitySchema,
		),
	};
}

function validContracts(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		["domainPackWriter", "capabilitySchema", "setupSchema", "qaContract"].every(
			(key) => Number.isInteger(value[key]) && value[key] >= 0,
		)
	);
}

async function readRequiredJson(path, label) {
	try {
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new Error(`${label} is not a regular file`);
		}
		const value = JSON.parse(await readFile(path, "utf8"));
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			throw new Error(`${label} must be an object`);
		}
		return value;
	} catch (error) {
		throw new InjectError("inject_compatibility_invalid", errorDetail(error));
	}
}

async function hashRequiredContractFile(targetDir, path, schemaVersion) {
	const fullPath = join(targetDir, path);
	const value = await readRequiredJson(fullPath, path);
	if (value.schemaVersion !== schemaVersion) {
		throw new InjectError(
			"inject_compatibility_invalid",
			`${path} schema mismatch`,
		);
	}
	return sha256(await readFile(fullPath));
}

export function createInjectionReceipt(prior, compatibility, outputs) {
	const managedOutputs = Object.fromEntries(
		outputs.map((output) => [output.path, { sha256: sha256(output.bytes) }]),
	);
	return {
		...(prior ?? { schemaVersion: 1 }),
		templateApi: compatibility.templateApi,
		contracts: compatibility.contracts,
		compatibility: {
			templateApi: compatibility.templateApi,
			domainPackWriter: compatibility.contracts.domainPackWriter,
			domainPackSchema: DOMAIN_PACK_SCHEMA_VERSION,
			capabilitySchema: compatibility.contracts.capabilitySchema,
			capabilityManifestSha256: compatibility.capabilityManifestSha256,
			setupSchema: compatibility.contracts.setupSchema,
			qaContract: compatibility.contracts.qaContract,
		},
		domainPack: {
			schemaVersion: DOMAIN_PACK_SCHEMA_VERSION,
			writerVersion: compatibility.contracts.domainPackWriter,
			sha256: managedOutputs[MANAGED_DOMAIN_PACK].sha256,
		},
		managedOutputs,
	};
}
