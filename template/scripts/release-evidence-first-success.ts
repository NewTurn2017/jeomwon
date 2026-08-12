import { readFileSync } from "node:fs";
import {
  evaluateFirstSuccessRuns,
  type FirstSuccessRun,
} from "./first-success-report";
import {
  exactKeys,
  record,
  safeFile,
  sha256Bytes,
  stableJson,
  validateEvidenceRef,
} from "./release-evidence-files";
import type { ReleaseInput } from "./release-evidence-input";

const RUN_KEYS = [
  "participantId",
  "platform",
  "elapsedMinutes",
  "outcome",
  "setupAutomation",
  "oauthPauseResume",
  "securityBoundary",
  "sessionSeparation",
  "approveCancelRoundtrip",
  "restartPersistence",
  "runHash",
] as const;
const BOOLEAN_KEYS = [
  "setupAutomation",
  "oauthPauseResume",
  "securityBoundary",
  "sessionSeparation",
  "approveCancelRoundtrip",
  "restartPersistence",
] as const;
const PLATFORMS = [
  "macos-latest",
  "macos-previous",
  "ubuntu-lts",
  "windows-11-powershell-7",
];
const OUTCOMES = [
  "complete",
  "failure",
  "incomplete",
  "prerequisite_error",
  "external_environment_failure",
];

export function validateFirstSuccess(
  root: string,
  value: ReleaseInput["firstSuccess"],
) {
  if (value.status === "defined-not-measured")
    return { status: "defined-not-measured" as const };
  const dataset = validateEvidenceRef(root, value.dataset);
  if (dataset.status !== "verified")
    throw new Error("first_success_dataset_unverified");
  const document = readJson(root, dataset.path);
  exactKeys(
    document,
    ["schemaVersion", "runs", "evaluator"],
    "first_success_schema_invalid",
  );
  if (document.schemaVersion !== 1 || !Array.isArray(document.runs))
    throw new Error("first_success_schema_invalid");
  exactKeys(
    document.evaluator,
    ["schemaVersion", "result", "reportHash"],
    "first_success_schema_invalid",
  );
  if (
    document.evaluator.schemaVersion !== 1 ||
    document.evaluator.result !== "PASS" ||
    typeof document.evaluator.reportHash !== "string"
  )
    throw new Error("first_success_schema_invalid");
  const hashes = new Set<string>();
  const runs = document.runs.map((item) => validateRun(item, hashes));
  const report = evaluateFirstSuccessRuns(runs);
  if (report.status !== "PASS") throw new Error("first_success_not_verified");
  const reportHash = sha256Bytes(stableJson(report));
  if (document.evaluator.reportHash !== reportHash)
    throw new Error("first_success_evaluator_mismatch");
  return {
    status: "verified" as const,
    dataset,
    participants: report.participants,
    medianMinutes: report.medianMinutes,
    within25Minutes: report.within25Minutes,
    runHashes: [...hashes].sort(),
    evaluatorReportHash: reportHash,
  };
}

function validateRun(value: unknown, hashes: Set<string>): FirstSuccessRun {
  exactKeys(value, RUN_KEYS, "first_success_schema_invalid");
  if (typeof value.runHash !== "string")
    throw new Error("first_success_run_hash_missing");
  if (
    typeof value.participantId !== "string" ||
    typeof value.elapsedMinutes !== "number" ||
    !PLATFORMS.includes(String(value.platform)) ||
    !OUTCOMES.includes(String(value.outcome)) ||
    BOOLEAN_KEYS.some((key) => typeof value[key] !== "boolean")
  )
    throw new Error("first_success_schema_invalid");
  const { runHash, ...run } = value;
  if (
    !/^[a-f0-9]{64}$/.test(runHash) ||
    runHash !== sha256Bytes(stableJson(run))
  )
    throw new Error("first_success_run_hash_invalid");
  if (hashes.has(runHash)) throw new Error("first_success_run_hash_duplicate");
  hashes.add(runHash);
  return run as FirstSuccessRun;
}

function readJson(root: string, path?: string): Record<string, unknown> {
  if (!path) throw new Error("evidence_path_missing");
  try {
    const value: unknown = JSON.parse(
      readFileSync(safeFile(root, path), "utf8"),
    );
    if (!record(value)) throw new Error("first_success_schema_invalid");
    return value;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("evidence_json_invalid");
    throw error;
  }
}
