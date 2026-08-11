import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ScaffoldError } from "./scaffold-state.mjs";
import { validateCapabilities } from "./validate-capabilities.mjs";

export async function validateTemplateCompatibility(root, skill) {
	const manifest = await json(
		root,
		"jeomwon-template.json",
		"template_manifest_invalid",
	);
	const expected = skill.compatibility;
	if (
		manifest?.schemaVersion !== 1 ||
		typeof manifest.templateVersion !== "string" ||
		!Number.isInteger(manifest.templateApi) ||
		!validContracts(manifest.contracts)
	)
		throw new ScaffoldError(
			"template_manifest_invalid",
			"invalid template manifest schema",
		);
	for (const [actual, wanted, code] of [
		[
			manifest.templateVersion,
			expected.templateVersion,
			"template_version_mismatch",
		],
		[manifest.templateApi, expected.templateApi, "template_api_unsupported"],
		[
			manifest.contracts.domainPackWriter,
			expected.domainPackWriter,
			"domain_pack_writer_mismatch",
		],
		[
			manifest.contracts.capabilitySchema,
			expected.capabilitySchema,
			"capability_schema_mismatch",
		],
		[
			manifest.contracts.setupSchema,
			expected.setupSchema,
			"setup_schema_mismatch",
		],
		[
			manifest.contracts.qaContract,
			expected.qaContract,
			"qa_contract_mismatch",
		],
	])
		if (actual !== wanted)
			throw new ScaffoldError(code, `${actual} (expected ${wanted})`);
	await validateReleaseFiles(root, manifest);
	return manifest;
}

async function validateReleaseFiles(root, manifest) {
	if (!existsSync(join(root, "packages/backend/domain.config.ts")))
		throw new ScaffoldError(
			"domain_pack_writer_mismatch",
			"domain.config.ts missing",
		);
	const setup = await json(root, "setup-config.json", "setup_schema_mismatch");
	if (
		setup.schemaVersion !== manifest.contracts.setupSchema ||
		!Array.isArray(setup.projects) ||
		setup.projects.length !== 4 ||
		!Array.isArray(setup.steps)
	)
		throw new ScaffoldError("setup_schema_mismatch", "invalid setup contract");
	const qa = await text(root, "scripts/qa-contract.ts", "qa_contract_mismatch");
	if (
		!qa.includes(
			`QA_CONTRACT_VERSION = ${manifest.contracts.qaContract} as const`,
		) ||
		!qa.includes("id: 12") ||
		!qa.includes('artifact: "12-no-show.json"')
	)
		throw new ScaffoldError(
			"qa_contract_mismatch",
			"QA v2 gate 12 identity mismatch",
		);
	try {
		validateCapabilities(
			join(root, "jeomwon-capabilities.json"),
			dirname(root),
		);
	} catch (error) {
		throw new ScaffoldError("capability_schema_mismatch", String(error));
	}
	const capabilities = await json(
		root,
		"jeomwon-capabilities.json",
		"capability_schema_mismatch",
	);
	if (capabilities.schemaVersion !== manifest.contracts.capabilitySchema)
		throw new ScaffoldError(
			"capability_schema_mismatch",
			String(capabilities.schemaVersion),
		);
	const extension = await text(
		root,
		"packages/backend/extension.config.ts",
		"extension_contract_mismatch",
	);
	if (
		!extension.includes("extensionConfigSchemaVersion = 1") ||
		!extension.includes("features: {}")
	)
		throw new ScaffoldError(
			"extension_contract_mismatch",
			"extension ownership seam mismatch",
		);
	const packageManifest = await json(
		root,
		"package.json",
		"toolchain_pin_invalid",
	);
	if (packageManifest.packageManager !== "bun@1.3.14")
		throw new ScaffoldError(
			"toolchain_pin_invalid",
			"packageManager must be bun@1.3.14",
		);
	const ci = await text(
		root,
		".github/workflows/check.yml",
		"ci_contract_mismatch",
	);
	for (const command of [
		"bun install --frozen-lockfile",
		"bun run typecheck",
		"bun run lint",
		"bun test",
		"bun run build:email",
		"bun run build:app",
		"bun run build:web",
	])
		if (!ci.includes(`run: ${command}`))
			throw new ScaffoldError("ci_contract_mismatch", command);
}

async function json(root, path, code) {
	if (!existsSync(join(root, path))) {
		const missingCode =
			path === "jeomwon-template.json" ? "template_manifest_missing" : code;
		throw new ScaffoldError(missingCode, join(root, path));
	}
	try {
		return JSON.parse(await text(root, path, code));
	} catch (error) {
		if (error instanceof ScaffoldError) throw error;
		throw new ScaffoldError(code, String(error));
	}
}
async function text(root, path, code) {
	try {
		return await readFile(join(root, path), "utf8");
	} catch (error) {
		throw new ScaffoldError(code, String(error));
	}
}
function validContracts(value) {
	return (
		value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.keys(value).sort().join("\0") ===
			[
				"capabilitySchema",
				"domainPackWriter",
				"qaContract",
				"setupSchema",
			].join("\0") &&
		Object.values(value).every((entry) => Number.isInteger(entry) && entry >= 0)
	);
}
