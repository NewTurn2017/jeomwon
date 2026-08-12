import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateFirstSuccessRuns } from "./first-success-report";
import { sha256Bytes, sha256File, stableJson } from "./release-evidence-files";
import {
  validateFirstSuccess,
  validateGenerated,
  validateQaManifest,
} from "./release-evidence-validation";

const platforms = [
  "macos-latest",
  "macos-latest",
  "macos-previous",
  "macos-previous",
  "ubuntu-lts",
  "ubuntu-lts",
  "ubuntu-lts",
  "windows-11-powershell-7",
  "windows-11-powershell-7",
  "windows-11-powershell-7",
] as const;
function runs() {
  return platforms.map((platform, index) => ({
    participantId: `P${index}`,
    platform,
    elapsedMinutes: 10 + index,
    outcome: "complete" as const,
    setupAutomation: true,
    oauthPauseResume: true,
    securityBoundary: true,
    sessionSeparation: true,
    approveCancelRoundtrip: true,
    restartPersistence: true,
  }));
}
function dataset(
  root: string,
  mutate?: (document: Record<string, unknown>) => void,
) {
  const plain = runs();
  const report = evaluateFirstSuccessRuns(plain);
  const document: Record<string, unknown> = {
    schemaVersion: 1,
    runs: plain.map((run) => ({
      ...run,
      runHash: sha256Bytes(stableJson(run)),
    })),
    evaluator: {
      schemaVersion: 1,
      result: "PASS",
      reportHash: sha256Bytes(stableJson(report)),
    },
  };
  mutate?.(document);
  writeFileSync(join(root, "runs.json"), JSON.stringify(document));
  return {
    status: "verified" as const,
    path: "runs.json",
    sha256: sha256File(root, "runs.json"),
  };
}

describe("strict first-success maturity", () => {
  test("binds ten run hashes and the unchanged evaluator result", () => {
    const root = mkdtempSync(join(tmpdir(), "first-success-release-"));
    expect(
      validateFirstSuccess(root, { status: "verified", dataset: dataset(root) })
        .participants,
    ).toBe(10);
  });
  test.each([
    [
      "missing hash",
      (value: Record<string, unknown>) => {
        delete (value.runs as Record<string, unknown>[])[0]?.runHash;
      },
      "first_success_run_hash_missing",
    ],
    [
      "bad hash",
      (value: Record<string, unknown>) => {
        (value.runs as Record<string, unknown>[])[0]!.runHash = "a".repeat(64);
      },
      "first_success_run_hash_invalid",
    ],
    [
      "duplicate hash",
      (value: Record<string, unknown>) => {
        (value.runs as Record<string, unknown>[])[1] = {
          ...(value.runs as Record<string, unknown>[])[0]!,
        };
      },
      "first_success_run_hash_duplicate",
    ],
    [
      "bad evaluator",
      (value: Record<string, unknown>) => {
        (value.evaluator as Record<string, unknown>).reportHash = "a".repeat(
          64,
        );
      },
      "first_success_evaluator_mismatch",
    ],
  ])("rejects %s twice", (_, mutate, code) => {
    for (let round = 0; round < 2; round++) {
      const root = mkdtempSync(join(tmpdir(), "first-success-release-"));
      expect(() =>
        validateFirstSuccess(root, {
          status: "verified",
          dataset: dataset(root, mutate),
        }),
      ).toThrow(code);
    }
  });
  test("never promotes blocked datasets", () => {
    const root = mkdtempSync(join(tmpdir(), "first-success-release-"));
    const ref = dataset(root);
    expect(() =>
      validateFirstSuccess(root, {
        status: "verified",
        dataset: { ...ref, status: "blocked", reason: "evidence_absent" },
      }),
    ).toThrow("first_success_dataset_unverified");
  });
});

describe("generated and QA evidence maturity", () => {
  test("rejects skeletal generated receipt and QA manifest twice", () => {
    for (let round = 0; round < 2; round++) {
      const root = mkdtempSync(join(tmpdir(), "release-fabrication-"));
      mkdirSync(join(root, "qa"));
      writeFileSync(join(root, "generated.json"), "{}\n");
      writeFileSync(
        join(root, "qa/manifest.json"),
        '{"qaContractVersion":2}\n',
      );
      const generated = {
        status: "verified" as const,
        path: "generated.json",
        sha256: sha256File(root, "generated.json"),
      };
      const archive = {
        status: "verified" as const,
        path: "archive",
        sha256: "a".repeat(64),
        contentSha256: "b".repeat(64),
      };
      expect(() => validateGenerated(root, generated, archive)).toThrow(
        "generated_identity_missing",
      );
      const qa = {
        status: "verified" as const,
        path: "qa/manifest.json",
        sha256: sha256File(root, "qa/manifest.json"),
        schemaVersion: 2,
      };
      expect(() => validateQaManifest(root, qa, 2)).toThrow(
        "qa_artifact_validation_failed",
      );
    }
  });
});
