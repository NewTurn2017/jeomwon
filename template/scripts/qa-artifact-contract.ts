import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { validateBrowserArtifactBundle } from "./qa-browser-artifact-contract";
import { QA_GATE_CONTRACT } from "./qa-contract";

type QaArtifactValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly string[] };

const ALLOWED_SKIP_GATE_IDS = new Set([2, 9]);
export function validateQaRuntimeArtifacts(
  artifactDir: string,
): QaArtifactValidation {
  const issues: string[] = [];
  const manifest = readJson(join(artifactDir, "manifest.json"));
  if (!isRecord(manifest)) {
    issues.push("manifest:missing-or-invalid");
  } else {
    validateManifest(artifactDir, manifest, issues);
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function validateManifest(
  artifactDir: string,
  manifest: Readonly<Record<string, unknown>>,
  issues: string[],
): void {
  if (
    !isRecord(manifest.runner) ||
    manifest.runner.status !== "PASS" ||
    Object.keys(manifest.runner).length !== 1
  ) {
    issues.push("manifest:runner");
  }
  if (!isValidQaReset(manifest.qaReset)) issues.push("manifest:qa-reset");
  validateExactGates(manifest.gateContract, "gate-contract", issues);
  validateExactGates(manifest.results, "results", issues);
  validateGateArtifacts(artifactDir, manifest.results, issues);

  validateBrowserArtifactBundle(artifactDir, manifest.browserArtifacts, issues);
}

function validateExactGates(
  value: unknown,
  label: "gate-contract" | "results",
  issues: string[],
): void {
  if (!Array.isArray(value) || value.length !== QA_GATE_CONTRACT.length) {
    issues.push(`${label}:count`);
    return;
  }
  for (const [index, expected] of QA_GATE_CONTRACT.entries()) {
    const actual: unknown = value[index];
    if (
      !isRecord(actual) ||
      actual.id !== expected.id ||
      actual.name !== expected.name ||
      (label === "gate-contract" && actual.artifact !== expected.artifact)
    ) {
      issues.push(`${label}:identity:${expected.id}`);
      continue;
    }
    if (label === "results") validateResultStatus(expected.id, actual, issues);
  }
}

function validateResultStatus(
  id: number,
  result: Readonly<Record<string, unknown>>,
  issues: string[],
): void {
  if (result.status === "PASS") return;
  if (result.status === "SKIP" && ALLOWED_SKIP_GATE_IDS.has(id)) return;
  issues.push(
    result.status === "SKIP" ? `results:skip:${id}` : `results:status:${id}`,
  );
}

function validateGateArtifacts(
  artifactDir: string,
  results: unknown,
  issues: string[],
): void {
  const resultArray = Array.isArray(results) ? results : [];
  for (const [index, gate] of QA_GATE_CONTRACT.entries()) {
    const artifact = readJson(join(artifactDir, gate.artifact));
    if (!isRecord(artifact)) {
      issues.push(`artifact:invalid:${gate.id}`);
      continue;
    }
    const result = resultArray[index];
    if (
      !isRecord(result) ||
      artifact.id !== gate.id ||
      artifact.name !== gate.name ||
      artifact.status !== result.status ||
      !("evidence" in artifact)
    ) {
      issues.push(`artifact:contract:${gate.id}`);
      continue;
    }
    if (!isMeaningfulEvidence(artifact.evidence)) {
      issues.push(`artifact:evidence:${gate.id}`);
      continue;
    }
    if (gate.id === 10) {
      validateOperatorCrudBoundary(artifact.evidence, issues);
    }
    if (
      result.status === "SKIP" &&
      (!isRecord(artifact.evidence) ||
        artifact.evidence.status !== "SKIP" ||
        !isMeaningfulString(artifact.evidence.reason))
    ) {
      issues.push(`artifact:skip-evidence:${gate.id}`);
    }
  }
}

function validateOperatorCrudBoundary(
  evidence: unknown,
  issues: string[],
): void {
  if (!isRecord(evidence)) {
    issues.push("artifact:operator-boundary:10");
    return;
  }
  const unauthenticatedRoute = evidence.unauthenticatedAdminRoute;
  const customerRoute = evidence.authenticatedCustomerAdminRoute;
  const subcase = evidence.operatorCrudBoundarySubcase;
  const routesAreExact =
    isRecord(unauthenticatedRoute) &&
    unauthenticatedRoute.kind === "redirect" &&
    Object.keys(unauthenticatedRoute).length === 1 &&
    isRecord(customerRoute) &&
    customerRoute.kind === "response" &&
    customerRoute.status === 404 &&
    Object.keys(customerRoute).length === 2;
  const subcaseIsExact =
    isRecord(subcase) &&
    ((subcase.status === "SKIP" &&
      subcase.reason === "features.operatorCalendarCrud=false" &&
      Object.keys(subcase).length === 2) ||
      (subcase.status === "PASS" &&
        hasExactCrudDenials(subcase.unauthenticated) &&
        hasExactCrudDenials(subcase.authenticatedNonoperator) &&
        Object.keys(subcase).length === 3));
  if (
    !routesAreExact ||
    !subcaseIsExact ||
    evidence.operatorSuccessSmoke !== "BLOCKED_MAINTAINER_GOOGLE_IDENTITY"
  ) {
    issues.push("artifact:operator-boundary:10");
  }
}

function hasExactCrudDenials(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.createRejected === true &&
    value.updateRejected === true &&
    value.deleteRejected === true &&
    Object.keys(value).length === 3
  );
}

function isValidQaReset(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.reset) || !isRecord(value.seed)) {
    return false;
  }
  return (
    isMeaningfulString(value.reset.domainKey) &&
    isNonnegativeInteger(value.reset.reservations) &&
    isNonnegativeInteger(value.reset.chatThreads) &&
    isNonnegativeInteger(value.reset.chatEvents) &&
    isPositiveInteger(value.seed.resources)
  );
}

function isMeaningfulEvidence(value: unknown): boolean {
  if (isMeaningfulString(value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) {
    return value.length > 0 && value.some(isMeaningfulEvidence);
  }
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    !entries.some(([key]) => /^(?:placeholder|todo|tbd)$/i.test(key)) &&
    entries.some(([, entryValue]) => isMeaningfulEvidence(entryValue))
  );
}

function isMeaningfulString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/^(?:placeholder|todo|tbd)$/i.test(value.trim())
  );
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function readJson(filePath: string): unknown {
  if (!existsSync(filePath) || statSync(filePath).size === 0) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
