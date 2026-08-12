import { DOMAIN_PACK_SCHEMA_VERSION } from "./domain-pack-constants.mjs";
import { normalizeDomainPack } from "./domain-pack-schema.mjs";
import {
	MANAGED_DOMAIN_CONFIG,
	MANAGED_DOMAIN_PACK,
	MANAGED_EMAIL_SAMPLE,
} from "./inject-managed.mjs";
import {
	hasExactKeys,
	isSha256,
	sha256,
	validContractHashes,
} from "./release-contract.mjs";

export const RECEIPT_SCHEMA_VERSION = 3;

const RECEIPT_KEYS = [
	"schemaVersion",
	"lifecycle",
	"projectName",
	"projectSlug",
	"projectIdentity",
	"skillVersion",
	"templateVersion",
	"templateApi",
	"contracts",
	"templateSource",
	"contractFiles",
	"domainPack",
	"managedOutputs",
];
const CONTRACT_KEYS = [
	"domainPackWriter",
	"capabilitySchema",
	"setupSchema",
	"qaContract",
];
const MANAGED_ALLOWLIST = [
	MANAGED_DOMAIN_PACK,
	MANAGED_DOMAIN_CONFIG,
	MANAGED_EMAIL_SAMPLE,
];

export function createEstablishedReceipt(
	identity,
	compatibility,
	pack,
	outputs,
) {
	const managedOutputs = Object.fromEntries(
		outputs.map((output) => [
			output.path,
			{
				sha256: sha256(output.bytes),
				mode: output.mode,
				type: "file",
			},
		]),
	);
	const canonical = structuredClone(pack);
	return {
		schemaVersion: RECEIPT_SCHEMA_VERSION,
		lifecycle: "established",
		projectName: identity.projectName,
		projectSlug: identity.projectSlug,
		projectIdentity: projectIdentity(
			identity.projectName,
			identity.projectSlug,
		),
		skillVersion: identity.skillVersion,
		templateVersion: identity.templateVersion,
		templateApi: compatibility.templateApi,
		contracts: compatibility.contracts,
		templateSource: identity.templateSource,
		contractFiles: identity.contractFiles,
		domainPack: {
			schemaVersion: DOMAIN_PACK_SCHEMA_VERSION,
			writerVersion: compatibility.contracts.domainPackWriter,
			canonical,
			sha256: canonicalPackSha256(canonical),
		},
		managedOutputs,
	};
}

export function updateEstablishedReceipt(prior, pack, outputs) {
	return createEstablishedReceipt(prior, prior, pack, outputs);
}

export function projectIdentity(name, slug) {
	return sha256(Buffer.from(`${name}\0${slug}`));
}

export function validReceipt(value) {
	if (
		!hasExactKeys(value, RECEIPT_KEYS) ||
		value.schemaVersion !== RECEIPT_SCHEMA_VERSION ||
		value.lifecycle !== "established" ||
		![
			value.projectName,
			value.projectSlug,
			value.skillVersion,
			value.templateVersion,
		].every((entry) => typeof entry === "string" && entry.length > 0) ||
		!isSha256(value.projectIdentity) ||
		!Number.isInteger(value.templateApi) ||
		!validContracts(value.contracts) ||
		!validTemplateSource(value.templateSource) ||
		!validContractHashes(value.contractFiles) ||
		!validDomainPack(value.domainPack) ||
		value.projectIdentity !==
			projectIdentity(value.projectName, value.projectSlug)
	)
		return false;
	const paths = Object.keys(value.managedOutputs ?? {});
	return (
		hasExactKeys(value.managedOutputs, paths) &&
		paths.length >= 2 &&
		paths.every((path) => MANAGED_ALLOWLIST.includes(path)) &&
		[MANAGED_DOMAIN_PACK, MANAGED_DOMAIN_CONFIG].every((path) =>
			paths.includes(path),
		) &&
		paths.every((path) => validManagedEntry(value.managedOutputs[path]))
	);
}

function validContracts(value) {
	return (
		hasExactKeys(value, CONTRACT_KEYS) &&
		Object.values(value).every((entry) => Number.isInteger(entry) && entry >= 0)
	);
}
function validManagedEntry(value) {
	return (
		hasExactKeys(value, ["sha256", "mode", "type"]) &&
		isSha256(value.sha256) &&
		Number.isInteger(value.mode) &&
		value.mode >= 0 &&
		value.mode <= 0o777 &&
		value.type === "file"
	);
}
function validDomainPack(value) {
	if (
		!hasExactKeys(value, [
			"schemaVersion",
			"writerVersion",
			"canonical",
			"sha256",
		]) ||
		value.schemaVersion !== DOMAIN_PACK_SCHEMA_VERSION ||
		!Number.isInteger(value.writerVersion) ||
		!isSha256(value.sha256)
	)
		return false;
	try {
		const normalized = normalizeDomainPack(value.canonical);
		return (
			JSON.stringify(normalized) === JSON.stringify(value.canonical) &&
			value.sha256 === canonicalPackSha256(normalized)
		);
	} catch {
		return false;
	}
}

export function canonicalPackSha256(pack) {
	return sha256(Buffer.from(JSON.stringify(pack)));
}
function validTemplateSource(value) {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		!isSha256(value.contentSha256)
	)
		return false;
	if (value.kind === "local")
		return (
			hasExactKeys(
				value,
				value.sourceCommit
					? ["kind", "sourceCommit", "contentSha256"]
					: ["kind", "contentSha256"],
			) &&
			(value.sourceCommit === undefined ||
				/^[a-f0-9]{40}$/.test(value.sourceCommit))
		);
	if (value.kind === "archive" || value.kind === "bundled-archive")
		return (
			hasExactKeys(value, ["kind", "archiveSha256", "contentSha256"]) &&
			isSha256(value.archiveSha256)
		);
	if (value.kind === "git-ref")
		return (
			hasExactKeys(value, [
				"kind",
				"sourceCommit",
				"archiveSha256",
				"contentSha256",
			]) &&
			/^[a-f0-9]{40}$/.test(value.sourceCommit) &&
			isSha256(value.archiveSha256)
		);
	return false;
}
