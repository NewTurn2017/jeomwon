import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { InjectError } from "./inject-errors.mjs";

export const CONTRACT_PATHS = Object.freeze({
	capabilityManifestSha256: "jeomwon-capabilities.json",
	setupConfigSha256: "setup-config.json",
	qaContractSha256: "scripts/qa-contract.ts",
	ciWorkflowSha256: ".github/workflows/check.yml",
	packageManifestSha256: "package.json",
});

export function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

export async function hashReleaseContracts(root) {
	const entries = await Promise.all(
		Object.entries(CONTRACT_PATHS).map(async ([key, relativePath]) => {
			const path = join(root, relativePath);
			try {
				const metadata = await lstat(path);
				if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error();
				return [key, sha256(await readFile(path))];
			} catch {
				throw new InjectError(
					"inject_compatibility_invalid",
					`release contract must be a regular file: ${relativePath}`,
				);
			}
		}),
	);
	return Object.fromEntries(entries);
}

export function validContractHashes(value) {
	return (
		hasExactKeys(value, Object.keys(CONTRACT_PATHS)) &&
		Object.values(value).every(isSha256)
	);
}

export function isSha256(value) {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function hasExactKeys(value, keys) {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
	);
}
