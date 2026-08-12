import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditEvidenceCoverage,
  auditPlanText,
  auditScopePaths,
} from "./release-evidence-audit";

const ids = [
  ...Array.from({ length: 17 }, (_, index) => String(index + 1)),
  "F1",
  "F2",
  "F3",
  "F4",
];
const unchecked = new Set(["15", "17", "F1", "F2", "F3", "F4"]);
const plan = `## Scope\n### Must have\n- Criterion A\n### Must NOT have\n- Forbidden A\n## Verification strategy\n${ids.map((id) => `- [${unchecked.has(id) ? " " : "x"}] ${id}. Item`).join("\n")}\n`;

describe("read-only audits", () => {
  test("in-progress requires exact unchecked set while strict rejects every unchecked item", () => {
    expect(auditPlanText(plan, "in-progress").ok).toBe(true);
    const strict = auditPlanText(plan, "strict");
    for (const id of unchecked)
      expect(strict.errors).toContain(`plan_required_item_unchecked:${id}`);
  });
  test("rejects missing criteria, identity, duplicates, and malformed checkbox syntax", () => {
    expect(
      auditPlanText(plan.replace("- Criterion A", ""), "in-progress").errors,
    ).toContain("plan_must_have_missing");
    expect(
      auditPlanText(plan.replace("- [x] 1. Item\n", ""), "in-progress").errors,
    ).toContain("plan_item_missing:1");
    expect(
      auditPlanText(`${plan}- [x] 1. Again\n`, "in-progress").errors,
    ).toContain("plan_item_duplicate:1");
    expect(
      auditPlanText(plan.replace("- [x] 2.", "- [X] 2."), "in-progress").errors,
    ).toContain("plan_checkbox_malformed:2");
  });
  test("requires one direct evidence mapping per item", () => {
    const root = mkdtempSync(join(tmpdir(), "release-audit-test-"));
    expect(auditEvidenceCoverage(root, root)).toEqual([
      "plan_evidence_mapping_missing",
    ]);
  });
  test("rejects forbidden, unrelated, and uncommitted strict scope", () => {
    const report = auditScopePaths(
      ["samples/bad.ts", "random.txt"],
      ["template/x.ts"],
      "strict",
    );
    expect(report.errors).toContain("scope_forbidden_path:samples/bad.ts");
    expect(report.errors).toContain("scope_unrelated_path:random.txt");
    expect(report.errors).toContain("scope_uncommitted_source:template/x.ts");
  });
});
