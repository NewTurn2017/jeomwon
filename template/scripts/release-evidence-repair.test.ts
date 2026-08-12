import { describe, expect, test } from "bun:test";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditPlanText, auditScopePaths } from "./release-evidence-audit";
import { safeFile, validateEvidenceRef } from "./release-evidence-files";
import { parseReleaseInput } from "./release-evidence-input";

const required = [
  ...Array.from({ length: 17 }, (_, index) => String(index + 1)),
  "F1",
  "F2",
  "F3",
  "F4",
];
const plan = `### Must have\n- 유니코드 criterion\n### Must NOT have\n- forbidden\n## Verification strategy\n${required.map((id) => `- [x] ${id}. Item`).join("\n")}\n`;

describe("Todo 17 verifier regressions", () => {
  test.each([
    [
      "unknown release key",
      { schemaVersion: 1, surprise: true },
      "release_schema_invalid",
    ],
    [
      "unknown first-success status",
      { schemaVersion: 1, firstSuccess: { status: "measured" } },
      "release_schema_invalid",
    ],
    [
      "sensitive normalized key",
      { schemaVersion: 1, browser_storage: {} },
      "sensitive_input",
    ],
  ])("rejects %s twice", (_, input, code) => {
    for (let round = 0; round < 2; round++)
      expect(() => parseReleaseInput(input)).toThrow(code);
  });

  test("plan requires exact unique structurally valid identities", () => {
    expect(auditPlanText(plan, "strict").ok).toBe(true);
    expect(
      auditPlanText(plan.replace("- [x] 17. Item\n", ""), "strict").errors,
    ).toContain("plan_item_missing:17");
    expect(
      auditPlanText(`${plan}- [x] 1. Duplicate\n`, "strict").errors,
    ).toContain("plan_item_duplicate:1");
    expect(
      auditPlanText(plan.replace("- [x] 2.", "- [X] 2."), "strict").errors,
    ).toContain("plan_checkbox_malformed:2");
    expect(
      auditPlanText(`${plan}\nprose - [ ] 99. false`, "strict").errors,
    ).not.toContain("plan_item_unexpected:99");
  });

  test("strict scope rejects every protected and suspicious class", () => {
    const report = auditScopePaths(
      [
        ".gjc/x",
        "samples/x",
        "upstream/x",
        "template/x/_generated/y",
        "template/secrets/prod.key",
        "template/a\nb",
      ],
      [],
      "strict",
    );
    expect(report.errors.length).toBe(6);
  });

  test("rejects symlinked evidence root before outside read", () => {
    const outside = mkdtempSync(join(tmpdir(), "release-outside-"));
    writeFileSync(join(outside, "proof.json"), "{}\n");
    const parent = mkdtempSync(join(tmpdir(), "release-root-"));
    symlinkSync(outside, join(parent, "linked"));
    expect(() => safeFile(join(parent, "linked"), "proof.json")).toThrow(
      "evidence_root_unsafe",
    );
  });

  test("evidence refs are recursively strict and blocked reasons enumerated", () => {
    expect(() =>
      validateEvidenceRef(".", {
        status: "missing",
        reason: "invented_reason",
      }),
    ).toThrow("reason_invalid");
    expect(() =>
      validateEvidenceRef(".", {
        status: "missing",
        reason: "evidence_absent",
        extra: true,
      }),
    ).toThrow("evidence_ref_invalid");
  });
});
