import { readFileSync } from "node:fs";
import type { AuditMode } from "./release-evidence-audit";
import {
  CRITERION_IDS,
  idSort,
  jsonPointer,
  PLAN_IDS,
  sectionBullets,
} from "./release-evidence-audit-common";
import {
  exactKeys,
  record,
  safeFile,
  safeRoot,
  sha256Bytes,
  sha256File,
} from "./release-evidence-files";

const IN_PROGRESS = ["15", "17", "F1", "F2", "F3", "F4"];

export function auditPlanText(text: string, mode: AuditMode) {
  const errors: string[] = [];
  const mustHave = sectionBullets(text, "### Must have", "### Must NOT have");
  const mustNot = sectionBullets(
    text,
    "### Must NOT have",
    "## Verification strategy",
  );
  if (!mustHave.length) errors.push("plan_must_have_missing");
  if (!mustNot.length) errors.push("plan_must_not_have_missing");
  const items: Array<{ id: string; checked: boolean }> = [];
  for (const line of text.split("\n")) {
    const valid = /^- \[([ x])\] (\d+|F\d+)\.\s+\S/u.exec(line);
    if (valid) items.push({ id: valid[2] ?? "", checked: valid[1] === "x" });
    else {
      const malformed = /^- \[[^\]]*\] (\d+|F\d+)\./u.exec(line);
      if (malformed) errors.push(`plan_checkbox_malformed:${malformed[1]}`);
    }
  }
  for (const id of PLAN_IDS) {
    const found = items.filter((item) => item.id === id);
    if (!found.length) errors.push(`plan_item_missing:${id}`);
    if (found.length > 1) errors.push(`plan_item_duplicate:${id}`);
  }
  for (const item of items)
    if (!PLAN_IDS.includes(item.id))
      errors.push(`plan_item_unexpected:${item.id}`);
  const unchecked = items
    .filter((item) => PLAN_IDS.includes(item.id) && !item.checked)
    .map((item) => item.id)
    .sort(idSort);
  if (mode === "strict")
    for (const id of unchecked)
      errors.push(`plan_required_item_unchecked:${id}`);
  else if (unchecked.join(",") !== IN_PROGRESS.join(","))
    errors.push(`plan_in_progress_unchecked_mismatch:${unchecked.join(",")}`);
  return planReport(mode, errors, {
    criteria: {
      mustHave: mustHave.length,
      mustNotHave: mustNot.length,
      todos: items.length,
    },
    unchecked,
    planSha256: sha256Bytes(text),
  });
}

export function auditPlanFile(
  anchor: string,
  planPath: string,
  mode: AuditMode,
  evidenceRoot: string,
) {
  const text = readFileSync(safeFile(anchor, planPath, anchor), "utf8");
  const plan = auditPlanText(text, mode);
  const coverage = auditEvidenceCoverage(anchor, evidenceRoot, CRITERION_IDS);
  const errors = [...plan.errors, ...coverage];
  return {
    ...plan,
    status: errors.length
      ? plan.errors.length
        ? ("fail" as const)
        : ("blocked" as const)
      : ("pass" as const),
    errors,
    ok: !errors.length,
  };
}

export function auditEvidenceCoverage(
  anchor: string,
  rootCandidate = anchor,
  expectedIds = CRITERION_IDS,
) {
  let root: string;
  try {
    root = safeRoot(rootCandidate, "plan_evidence_root_unsafe", anchor);
  } catch (error) {
    return [(error as Error).message];
  }
  let value: unknown;
  try {
    value = JSON.parse(
      readFileSync(safeFile(root, "audit-plan-evidence.json", anchor), "utf8"),
    );
  } catch {
    return ["plan_evidence_mapping_missing"];
  }
  try {
    exactKeys(
      value,
      ["schemaVersion", "criteria"],
      "plan_evidence_mapping_invalid",
    );
    if (value.schemaVersion !== 2 || !Array.isArray(value.criteria))
      throw new Error("plan_evidence_mapping_invalid");
    return validateRecords(anchor, root, value.criteria, expectedIds);
  } catch (error) {
    return [(error as Error).message];
  }
}

function validateRecords(
  anchor: string,
  root: string,
  values: unknown[],
  expectedIds: readonly string[],
) {
  const errors: string[] = [];
  const used = new Set<string>();
  for (const id of expectedIds) {
    const matches = values.filter(
      (value) => record(value) && value.criterionId === id,
    );
    if (!matches.length) errors.push(`plan_criterion_missing:${id}`);
    if (matches.length > 1) errors.push("plan_criterion_id_duplicate");
  }
  for (const value of values) {
    try {
      validateRecord(anchor, root, value, expectedIds, used);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return [...new Set(errors)];
}

function validateRecord(
  anchor: string,
  root: string,
  value: unknown,
  expectedIds: readonly string[],
  used: Set<string>,
) {
  exactKeys(
    value,
    [
      "criterionId",
      "artifact",
      "artifactSha256",
      "verifierVerdict",
      "proofKind",
      "proofSelector",
    ],
    "plan_criterion_record_invalid",
  );
  if (
    typeof value.criterionId !== "string" ||
    !expectedIds.includes(value.criterionId)
  )
    throw new Error("plan_criterion_id_unexpected");
  if (
    !["confirmed", "pass", "fully-done"].includes(String(value.verifierVerdict))
  )
    throw new Error("plan_criterion_verdict_invalid");
  if (
    value.proofKind !== "json-pointer" ||
    typeof value.proofSelector !== "string" ||
    !value.proofSelector.startsWith("/")
  )
    throw new Error("plan_criterion_record_invalid");
  if (
    typeof value.artifact !== "string" ||
    typeof value.artifactSha256 !== "string"
  )
    throw new Error("plan_criterion_record_invalid");
  const path = safeFile(root, value.artifact, anchor);
  if (sha256File(root, value.artifact) !== value.artifactSha256)
    throw new Error("plan_criterion_hash_mismatch");
  const key = `${path}:${value.proofSelector}`;
  if (used.has(key)) throw new Error("plan_criterion_proof_reused");
  used.add(key);
  const artifact: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!record(artifact) || artifact.verdict !== value.verifierVerdict)
    throw new Error("plan_criterion_verdict_mismatch");
  if (jsonPointer(artifact, value.proofSelector) !== value.criterionId)
    throw new Error("plan_criterion_selector_mismatch");
}

function planReport(
  mode: AuditMode,
  errors: string[],
  extra: Record<string, unknown>,
) {
  return {
    schemaVersion: 1,
    kind: "plan-audit",
    mode,
    status: errors.length ? ("fail" as const) : ("pass" as const),
    ...extra,
    errors,
    ok: !errors.length,
  };
}
