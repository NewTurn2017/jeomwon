import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateQaRuntimeArtifacts } from "./qa-artifact-contract";
import {
  type EvidenceRef,
  record,
  safeFile,
  safeReason,
  validateEvidenceRef,
} from "./release-evidence-files";
import type { ReleaseInput, VersionedRef } from "./release-evidence-input";

export function validateGenerated(
  root: string,
  value: EvidenceRef,
  archive: EvidenceRef & { contentSha256: string },
  contracts?: ReturnType<typeof validateContracts>,
) {
  const ref = validateEvidenceRef(root, value);
  if (ref.status !== "verified") return ref;
  const receipt = readJson(root, ref.path);
  const source = requiredRecord(
    receipt.templateSource,
    "generated_identity_missing",
  );
  const versions = requiredRecord(
    receipt.contracts,
    "generated_identity_missing",
  );
  const files = requiredRecord(
    receipt.contractFiles,
    "generated_identity_missing",
  );
  if (
    receipt.schemaVersion !== 3 ||
    typeof receipt.projectIdentity !== "string" ||
    !/^[a-f0-9]{64}$/.test(receipt.projectIdentity) ||
    source.archiveSha256 !== archive.sha256 ||
    source.contentSha256 !== archive.contentSha256 ||
    typeof receipt.templateApi !== "number" ||
    versions.capabilitySchema !== contracts?.capability.schemaVersion ||
    versions.setupSchema !== contracts?.setup.schemaVersion ||
    versions.qaContract !== contracts?.qa.schemaVersion ||
    files.capabilityManifestSha256 !== contracts?.capability.sha256 ||
    files.setupConfigSha256 !== contracts?.setup.sha256 ||
    files.qaContractSha256 !== contracts?.qa.sha256
  )
    throw new Error("generated_identity_mismatch");
  return ref;
}
export function validateContracts(
  root: string,
  input: ReleaseInput["contracts"],
) {
  const output = {
    compatibility: validateVersioned(root, input.compatibility),
    project: validateVersioned(root, input.project),
    capability: validateVersioned(root, input.capability),
    setup: validateVersioned(root, input.setup),
    qa: validateVersioned(root, input.qa),
  };
  const project = readJson(root, output.project.path);
  const capability = readJson(root, output.capability.path);
  const setup = readJson(root, output.setup.path);
  if (
    project.schemaVersion !== output.project.schemaVersion ||
    capability.schemaVersion !== output.capability.schemaVersion ||
    setup.schemaVersion !== output.setup.schemaVersion
  )
    throw new Error("contract_schema_mismatch");
  const contracts = record(project.contracts) ? project.contracts : {};
  if (
    contracts.capabilitySchema !== output.capability.schemaVersion ||
    contracts.setupSchema !== output.setup.schemaVersion ||
    contracts.qaContract !== output.qa.schemaVersion
  )
    throw new Error("contract_schema_mismatch");
  return output;
}
export function validateVersioned(root: string, value: VersionedRef) {
  const { schemaVersion, ...evidence } = value;
  const ref = validateEvidenceRef(root, evidence);
  if (
    ref.status !== "verified" ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 1
  )
    throw new Error("contract_schema_invalid");
  return { ...ref, schemaVersion } as VersionedRef;
}
export function validateArchiveIdentity(
  root: string,
  compatibility: VersionedRef,
  archive: EvidenceRef & { contentSha256: string },
) {
  const manifest = readJson(root, compatibility.path);
  const source = record(manifest.templateSource) ? manifest.templateSource : {};
  if (
    source.archiveSha256 !== archive.sha256 ||
    source.contentSha256 !== archive.contentSha256
  )
    throw new Error("archive_manifest_mismatch");
}
export function validateQaManifest(
  root: string,
  ref: VersionedRef,
  qaVersion: number,
) {
  const manifest = readJson(root, ref.path);
  if (
    ref.status !== "verified" ||
    ref.schemaVersion !== qaVersion ||
    manifest.qaContractVersion !== qaVersion
  )
    throw new Error("qa_manifest_schema_mismatch");
  const result = validateQaRuntimeArtifacts(
    dirname(safeFile(root, ref.path ?? "")),
  );
  if (!result.ok) throw new Error("qa_artifact_validation_failed");
}
export function validateBrowser(
  root: string,
  browser: ReleaseInput["browser"],
) {
  if (browser.status === "missing") return { status: "missing" as const };
  if (browser.status === "blocked")
    return { status: "blocked" as const, reason: safeReason(browser.reason) };
  if (!browser.actions || !browser.screenshots?.length)
    throw new Error("browser_evidence_missing");
  return {
    status: "verified" as const,
    actions: validateEvidenceRef(root, browser.actions),
    screenshots: browser.screenshots
      .map((item) => validateEvidenceRef(root, item))
      .sort((left, right) => (left.path ?? "").localeCompare(right.path ?? "")),
  };
}
export function validateOperations(
  root: string,
  values: ReleaseInput["operations"],
) {
  if (
    values.filter((item) => item.name === "tag").length !== 1 ||
    values.filter((item) => item.name === "release").length !== 1 ||
    values.filter((item) => item.name === "provider").length > 1
  )
    throw new Error("operations_invalid");
  return values.map((item) => {
    if (
      !["tag", "release", "provider"].includes(item.name) ||
      item.status !== "blocked" ||
      !/^[a-z0-9][a-z0-9_-]{2,80}$/.test(item.reason)
    )
      throw new Error("operation_invalid");
    return {
      name: item.name,
      status: item.status,
      reason: item.reason,
      ...(item.receipt
        ? { receipt: validateEvidenceRef(root, item.receipt) }
        : {}),
    };
  });
}
function requiredRecord(value: unknown, code: string) {
  if (!record(value)) throw new Error(code);
  return value;
}
function readJson(root: string, path?: string): Record<string, unknown> {
  if (!path) throw new Error("evidence_path_missing");
  try {
    const value: unknown = JSON.parse(
      readFileSync(safeFile(root, path), "utf8"),
    );
    return record(value) ? value : {};
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("evidence_json_invalid");
    throw error;
  }
}
