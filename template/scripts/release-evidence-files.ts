import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import {
  writeDeploymentReport,
  writeTrustedText,
} from "./deployment-readiness-output";
import {
  inspectPathComponents,
  safeDirectory,
  safeRelativeParts,
} from "./release-evidence-paths";

export const SAFE_REASONS = [
  "evidence_absent",
  "executor_evidence_absent",
  "generated_proof_absent",
  "setup_preview_absent",
  "deployment_proof_absent",
  "workshop_proof_absent",
  "local_proof_absent",
  "stale_archive_proof",
  "publication_pending_orchestrator",
  "provider_authorization_absent",
  "not_applicable_no_ui_change",
  "not_applicable_contract_only",
  "final_audit_pending",
] as const;
export type SafeReason = (typeof SAFE_REASONS)[number];
export type EvidenceStatus = "verified" | "blocked" | "missing";
export type EvidenceRef = {
  status: EvidenceStatus;
  path?: string;
  sha256?: string;
  reason?: SafeReason;
};

export function sha256Bytes(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (record(value))
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function exactKeys(
  value: unknown,
  allowed: readonly string[],
  code: string,
): asserts value is Record<string, unknown> {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error(code);
}
export function safeRoot(
  candidate: string,
  code = "evidence_root_unsafe",
  trustedAnchor = candidate,
) {
  return safeDirectory(trustedAnchor, candidate, code);
}
export function safeFile(
  rootCandidate: string,
  relativePath: string,
  trustedAnchor = rootCandidate,
) {
  const root = safeRoot(rootCandidate, "evidence_root_unsafe", trustedAnchor);
  const parts = safeRelativeParts(relativePath, "evidence_path_unsafe");
  const current = inspectPathComponents(root, parts, {
    missing: "evidence_path_missing",
    symlink: "evidence_path_symlink",
    nonDirectory: "evidence_path_not_file",
  });
  const canonical = realpathSync(current);
  const offset = relative(root, canonical);
  if (offset === ".." || offset.startsWith(`..${sep}`))
    throw new Error("evidence_path_unsafe");
  if (!lstatSync(canonical).isFile()) throw new Error("evidence_path_not_file");
  return canonical;
}
export function safeRead(root: string, path: string) {
  return readFileSync(safeFile(root, path), "utf8");
}
export function sha256File(root: string, path: string) {
  return sha256Bytes(readFileSync(safeFile(root, path)));
}
export function safeReason(value: unknown): SafeReason {
  if (
    typeof value !== "string" ||
    !(SAFE_REASONS as readonly string[]).includes(value)
  )
    throw new Error("reason_invalid");
  return value as SafeReason;
}
export function validateEvidenceRef(root: string, value: unknown): EvidenceRef {
  exactKeys(
    value,
    ["status", "path", "sha256", "reason"],
    "evidence_ref_invalid",
  );
  if (!(["verified", "blocked", "missing"] as unknown[]).includes(value.status))
    throw new Error("evidence_status_invalid");
  const status = value.status as EvidenceStatus;
  if (status === "missing") {
    if (
      value.path !== undefined ||
      value.sha256 !== undefined ||
      value.reason === undefined
    )
      throw new Error("missing_evidence_invalid");
    return { status, reason: safeReason(value.reason) };
  }
  if (typeof value.path !== "string" || typeof value.sha256 !== "string")
    throw new Error("evidence_path_missing");
  if (!/^[a-f0-9]{64}$/.test(value.sha256))
    throw new Error("evidence_hash_invalid");
  if (sha256File(root, value.path) !== value.sha256)
    throw new Error("evidence_hash_mismatch");
  if (status === "blocked" && value.reason === undefined)
    throw new Error("blocked_reason_missing");
  if (status === "verified" && value.reason !== undefined)
    throw new Error("verified_reason_invalid");
  return {
    status,
    path: value.path,
    sha256: value.sha256,
    ...(value.reason === undefined ? {} : { reason: safeReason(value.reason) }),
  };
}
export function writeEvidenceReport(
  root: string,
  path: string,
  value: unknown,
  trustedAnchor = root,
) {
  writeDeploymentReport(root, path, value, trustedAnchor);
}
export function writeEvidenceMarkdown(
  root: string,
  path: string,
  value: string,
  trustedAnchor = root,
) {
  writeTrustedText(root, path, value, trustedAnchor);
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
