#!/usr/bin/env bun

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MAX_MANIFEST_BYTES = 1024 * 1024;
const ID_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const SYMBOL_PATTERN = /^[A-Za-z_$][\w$]*$/;
const OWNERSHIP = new Set(["core", "kit-core", "integration", "planned"]);
const ENABLEMENT_MODES = new Set(["always", "feature", "unavailable"]);
const EVIDENCE_LEVELS = new Set(["none", "source", "test", "qa", "live"]);
const MATURITY = new Set([
	"planned",
	"implemented",
	"qa-proven",
	"live-proven",
]);

export class CapabilityValidationError extends Error {
	constructor(code, detail) {
		super(code);
		this.name = "CapabilityValidationError";
		this.code = code;
		this.detail = detail;
	}
}

export function validateCapabilities(manifestPath) {
	const absoluteManifestPath = resolve(String(manifestPath));
	if (!existsSync(absoluteManifestPath)) {
		fail("capability_manifest_missing", "manifest does not exist");
	}
	const manifestStat = lstatSync(absoluteManifestPath);
	if (!manifestStat.isFile() || manifestStat.size > MAX_MANIFEST_BYTES) {
		fail(
			"capability_manifest_invalid",
			"manifest must be a regular JSON file under 1 MiB",
		);
	}

	let manifest;
	try {
		manifest = JSON.parse(readFileSync(absoluteManifestPath, "utf8"));
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
		fail("capability_manifest_invalid", "manifest is not valid JSON");
	}

	requireRecord(manifest, "manifest");
	requireExactKeys(
		manifest,
		["schemaVersion", "kind", "capabilities"],
		"manifest",
	);
	if (manifest.schemaVersion !== 1) {
		fail("capability_schema_unsupported", "schemaVersion must be 1");
	}
	if (manifest.kind !== "jeomwon-release-capabilities") {
		fail("capability_manifest_invalid", "kind is invalid");
	}
	if (
		!Array.isArray(manifest.capabilities) ||
		manifest.capabilities.length === 0
	) {
		fail(
			"capability_manifest_invalid",
			"capabilities must be a non-empty array",
		);
	}

	const ids = new Set();
	for (const [index, capability] of manifest.capabilities.entries()) {
		validateCapability(capability, index, ids);
	}
	validateSeparation(ids);

	return { schemaVersion: 1, capabilities: manifest.capabilities.length };
}

function validateCapability(value, index, ids) {
	const label = `capabilities[${index}]`;
	requireRecord(value, label);
	requireExactKeys(
		value,
		[
			"id",
			"ownership",
			"enablement",
			"surfaces",
			"symbols",
			"evidence",
			"sideEffects",
			"maturity",
		],
		label,
	);
	if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) {
		fail("capability_manifest_invalid", `${label}.id is invalid`);
	}
	if (ids.has(value.id)) {
		fail("capability_id_duplicate", `duplicate capability id: ${value.id}`);
	}
	ids.add(value.id);
	if (!OWNERSHIP.has(value.ownership)) {
		fail("capability_manifest_invalid", `${value.id}.ownership is invalid`);
	}
	if (!MATURITY.has(value.maturity)) {
		fail("capability_manifest_invalid", `${value.id}.maturity is invalid`);
	}

	validateEnablement(value.id, value.enablement);
	validatePathArray(value.id, "surfaces", value.surfaces);
	validateSymbols(value.id, value.symbols);
	validateEvidence(value.id, value.evidence, value.maturity);
	validateStringArray(value.id, "sideEffects", value.sideEffects);
	validateMaturityShape(value);
}

function validateEnablement(id, value) {
	requireRecord(value, `${id}.enablement`);
	requireExactKeys(value, ["mode", "default"], `${id}.enablement`);
	if (!ENABLEMENT_MODES.has(value.mode) || typeof value.default !== "boolean") {
		fail("capability_manifest_invalid", `${id}.enablement is invalid`);
	}
	if (value.mode === "always" && value.default !== true) {
		fail(
			"capability_default_invalid",
			`${id} always-on capability must default on`,
		);
	}
	if (value.mode === "unavailable" && value.default !== false) {
		fail(
			"capability_default_invalid",
			`${id} unavailable capability must default off`,
		);
	}
}

function validatePathArray(id, field, value) {
	validateStringArray(id, field, value);
	for (const path of value) validateRepositoryFile(path, `${id}.${field}`);
}

function validateStringArray(id, field, value) {
	if (
		!Array.isArray(value) ||
		value.some((entry) => typeof entry !== "string" || entry.length === 0)
	) {
		fail(
			"capability_manifest_invalid",
			`${id}.${field} must contain non-empty strings`,
		);
	}
	if (new Set(value).size !== value.length) {
		fail("capability_manifest_invalid", `${id}.${field} contains duplicates`);
	}
}

function validateSymbols(id, value) {
	if (!Array.isArray(value)) {
		fail("capability_manifest_invalid", `${id}.symbols must be an array`);
	}
	const identities = new Set();
	for (const [index, symbol] of value.entries()) {
		requireRecord(symbol, `${id}.symbols[${index}]`);
		requireExactKeys(symbol, ["path", "name"], `${id}.symbols[${index}]`);
		if (
			typeof symbol.path !== "string" ||
			typeof symbol.name !== "string" ||
			!SYMBOL_PATTERN.test(symbol.name)
		) {
			fail("capability_manifest_invalid", `${id}.symbols[${index}] is invalid`);
		}
		const absolutePath = validateRepositoryFile(symbol.path, `${id}.symbols`);
		const identity = `${symbol.path}#${symbol.name}`;
		if (identities.has(identity)) {
			fail("capability_manifest_invalid", `${id}.symbols contains duplicates`);
		}
		identities.add(identity);
		if (!sourceDeclares(readFileSync(absolutePath, "utf8"), symbol.name)) {
			fail("capability_symbol_missing", `${identity} is not declared`);
		}
	}
}

function validateEvidence(id, value, maturity) {
	requireRecord(value, `${id}.evidence`);
	requireExactKeys(
		value,
		["level", "paths", "qaGate", "liveGate"],
		`${id}.evidence`,
	);
	if (!EVIDENCE_LEVELS.has(value.level)) {
		fail("capability_manifest_invalid", `${id}.evidence.level is invalid`);
	}
	validatePathArray(id, "evidence.paths", value.paths);
	if (
		value.qaGate !== null &&
		(!Number.isInteger(value.qaGate) || value.qaGate < 1)
	) {
		fail("capability_manifest_invalid", `${id}.evidence.qaGate is invalid`);
	}
	if (value.liveGate !== null) {
		if (typeof value.liveGate !== "string" || value.liveGate.length === 0) {
			fail("capability_manifest_invalid", `${id}.evidence.liveGate is invalid`);
		}
		validateRepositoryFile(value.liveGate, `${id}.evidence.liveGate`);
		if (!value.paths.includes(value.liveGate)) {
			fail(
				"capability_evidence_missing",
				`${id} live gate must be an evidence path`,
			);
		}
	}

	const rank = { none: 0, source: 1, test: 2, qa: 3, live: 4 }[value.level];
	const minimum = {
		planned: 0,
		implemented: 2,
		"qa-proven": 3,
		"live-proven": 4,
	}[maturity];
	if (rank < minimum || (minimum > 0 && value.paths.length === 0)) {
		fail("capability_evidence_missing", `${id} lacks evidence for ${maturity}`);
	}
	if (maturity === "qa-proven") {
		if (value.qaGate === null || !qaGateExists(value.qaGate, value.paths)) {
			fail("capability_evidence_missing", `${id} lacks a declared QA gate`);
		}
	}
	if (maturity === "live-proven" && value.liveGate === null) {
		fail("capability_evidence_missing", `${id} lacks a live gate`);
	}
	if (
		value.level === "none" &&
		(value.paths.length > 0 || value.qaGate !== null || value.liveGate !== null)
	) {
		fail("capability_manifest_invalid", `${id} none evidence must be empty`);
	}
}

function validateMaturityShape(capability) {
	const planned = capability.maturity === "planned";
	if (planned) {
		if (
			capability.ownership !== "planned" ||
			capability.enablement.mode !== "unavailable" ||
			capability.surfaces.length !== 0 ||
			capability.symbols.length !== 0 ||
			capability.sideEffects.length !== 0 ||
			capability.evidence.level !== "none"
		) {
			fail(
				"capability_maturity_overclaimed",
				`${capability.id} planned shape is invalid`,
			);
		}
		return;
	}
	if (
		capability.ownership === "planned" ||
		capability.enablement.mode === "unavailable" ||
		capability.symbols.length === 0
	) {
		fail(
			"capability_maturity_overclaimed",
			`${capability.id} implementation claim is incomplete`,
		);
	}
	if (
		capability.enablement.mode === "feature" &&
		capability.enablement.default !== false &&
		capability.id !== "delivery.reservationEmail"
	) {
		fail(
			"capability_default_invalid",
			`${capability.id} optional capability must default off`,
		);
	}
}

function validateSeparation(ids) {
	if (
		!ids.has("billing.accountSubscription.polar") ||
		!ids.has("payment.reservationDeposit")
	) {
		fail(
			"capability_boundary_missing",
			"account subscription and reservation payment must be separate capabilities",
		);
	}
}

function validateRepositoryFile(path, label) {
	if (
		typeof path !== "string" ||
		path.length === 0 ||
		isAbsolute(path) ||
		path.split(/[\\/]/).includes("..")
	) {
		fail("capability_path_invalid", `${label} contains an unsafe path`);
	}
	const absolutePath = resolve(repoRoot, path);
	if (!isInside(repoRoot, absolutePath) || !existsSync(absolutePath)) {
		fail("capability_path_missing", `${label} path does not exist: ${path}`);
	}
	const stat = lstatSync(absolutePath);
	if (
		!stat.isFile() ||
		stat.isSymbolicLink() ||
		!isInside(repoRoot, realpathSync(absolutePath))
	) {
		fail(
			"capability_path_invalid",
			`${label} path must be a repository file: ${path}`,
		);
	}
	return absolutePath;
}

function qaGateExists(gate, evidencePaths) {
	for (const path of evidencePaths) {
		if (!path.endsWith("qa-contract.ts")) continue;
		const source = readFileSync(resolve(repoRoot, path), "utf8");
		if (new RegExp(`\\bid:\\s*${gate}\\b`).test(source)) return true;
	}
	return false;
}

function sourceDeclares(source, name) {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const withoutComments = source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
	return new RegExp(
		`\\b(?:const|let|var|function|class|type|interface|enum)\\s+${escaped}\\b`,
	).test(withoutComments);
}

function requireRecord(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		fail("capability_manifest_invalid", `${label} must be an object`);
	}
}

function requireExactKeys(value, expected, label) {
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	if (
		actual.length !== wanted.length ||
		actual.some((key, index) => key !== wanted[index])
	) {
		fail(
			"capability_manifest_invalid",
			`${label} has unknown or missing fields`,
		);
	}
}

function isInside(root, candidate) {
	const path = relative(root, candidate);
	return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function fail(code, detail) {
	throw new CapabilityValidationError(code, detail);
}

function printFailure(error) {
	const failure =
		error instanceof CapabilityValidationError
			? { code: error.code, detail: error.detail }
			: {
					code: "capability_validator_failed",
					detail: "unexpected validator failure",
				};
	console.error(`CAPABILITIES FAIL ${JSON.stringify(failure)}`);
}

const invokedPath = process.argv[1]
	? pathToFileURL(resolve(process.argv[1])).href
	: null;
if (invokedPath === import.meta.url) {
	try {
		const manifestPath = process.argv[2];
		if (!manifestPath || process.argv.length !== 3) {
			fail(
				"capability_usage_invalid",
				"usage: validate-capabilities.mjs <manifest.json>",
			);
		}
		const result = validateCapabilities(manifestPath);
		console.log(`CAPABILITIES PASS ${JSON.stringify(result)}`);
	} catch (error) {
		printFailure(error);
		process.exitCode = 1;
	}
}
