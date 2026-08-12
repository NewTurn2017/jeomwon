import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateFirstSuccessRuns } from "./first-success-report";
import { auditEvidenceCoverage } from "./release-evidence-audit";
import {
  safeFile,
  sha256Bytes,
  sha256File,
  stableJson,
  writeEvidenceReport,
} from "./release-evidence-files";
import { validateFirstSuccess } from "./release-evidence-validation";

const criterionIds = ["must-have:01", "must-have:02"];
function artifact(root: string, id: string, verdict = "confirmed") {
  const path = `${id.replaceAll(":", "-")}.json`;
  writeFileSync(
    join(root, path),
    JSON.stringify({ verdict, proof: { criterionId: id } }),
  );
  return {
    criterionId: id,
    artifact: path,
    artifactSha256: sha256File(root, path),
    verifierVerdict: verdict,
    proofKind: "json-pointer",
    proofSelector: "/proof/criterionId",
  };
}
function mapping(root: string, criteria: unknown[]) {
  writeFileSync(
    join(root, "audit-plan-evidence.json"),
    JSON.stringify({ schemaVersion: 2, criteria }),
  );
}

describe("typed criterion evidence", () => {
  test.each([
    [
      "global file reuse",
      (root: string) => {
        const one = artifact(root, criterionIds[0]!);
        return [one, { ...one, criterionId: criterionIds[1] }];
      },
      "plan_criterion_proof_reused",
    ],
    [
      "needs-fix verdict",
      (root: string) => [artifact(root, criterionIds[0]!, "needs-fix")],
      "plan_criterion_verdict_invalid",
    ],
    [
      "wrong id",
      (root: string) => [
        { ...artifact(root, criterionIds[0]!), criterionId: "wrong" },
      ],
      "plan_criterion_id_unexpected",
    ],
    [
      "hash mismatch",
      (root: string) => [
        { ...artifact(root, criterionIds[0]!), artifactSha256: "a".repeat(64) },
      ],
      "plan_criterion_hash_mismatch",
    ],
    [
      "missing selector",
      (root: string) => {
        const value = artifact(root, criterionIds[0]!) as Record<
          string,
          unknown
        >;
        delete value.proofSelector;
        return [value];
      },
      "plan_criterion_record_invalid",
    ],
    [
      "duplicate selector",
      (root: string) => {
        const one = artifact(root, criterionIds[0]!);
        return [one, { ...one }];
      },
      "plan_criterion_id_duplicate",
    ],
  ] as const)("rejects %s twice", (_, create, code) => {
    for (let round = 0; round < 2; round++) {
      const root = mkdtempSync(join(tmpdir(), "criterion-map-"));
      mapping(root, create(root));
      expect(auditEvidenceCoverage(root, root, criterionIds)).toContain(code);
    }
  });
});

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
function firstSuccess(
  root: string,
  mutate: (value: Record<string, unknown>) => void,
) {
  const runs = platforms.map((platform, index) => ({
    participantId: `P${index}`,
    platform,
    elapsedMinutes: 10,
    outcome: "complete" as const,
    setupAutomation: true,
    oauthPauseResume: true,
    securityBoundary: true,
    sessionSeparation: true,
    approveCancelRoundtrip: true,
    restartPersistence: true,
  }));
  const report = evaluateFirstSuccessRuns(runs);
  const value: Record<string, unknown> = {
    schemaVersion: 1,
    runs: runs.map((run) => ({
      ...run,
      runHash: sha256Bytes(stableJson(run)),
    })),
    evaluator: {
      schemaVersion: 1,
      result: "PASS",
      reportHash: sha256Bytes(stableJson(report)),
    },
  };
  mutate(value);
  writeFileSync(join(root, "runs.json"), JSON.stringify(value));
  return {
    status: "verified" as const,
    path: "runs.json",
    sha256: sha256File(root, "runs.json"),
  };
}

describe("nested first-success exact schemas", () => {
  test.each([
    [
      "dataset unknown",
      (value: Record<string, unknown>) => {
        value.extra = true;
      },
    ],
    [
      "evaluator unknown",
      (value: Record<string, unknown>) => {
        (value.evaluator as Record<string, unknown>).extra = true;
      },
    ],
    [
      "run unknown with recomputed hash",
      (value: Record<string, unknown>) => {
        const run = (value.runs as Record<string, unknown>[])[0]!;
        run.extra = true;
        const { runHash: _, ...plain } = run;
        run.runHash = sha256Bytes(stableJson(plain));
      },
    ],
  ])("rejects %s twice", (_, mutate) => {
    for (let round = 0; round < 2; round++) {
      const root = mkdtempSync(join(tmpdir(), "first-schema-"));
      expect(() =>
        validateFirstSuccess(root, {
          status: "verified",
          dataset: firstSuccess(root, mutate),
        }),
      ).toThrow("first_success_schema_invalid");
    }
  });
});

describe("explicit anchor component safety", () => {
  test("rejects evidence and output ancestor links twice without reading outside FIFO", () => {
    const anchor = mkdtempSync(join(tmpdir(), "anchor-"));
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    mkdirSync(join(outside, "sub"));
    writeFileSync(join(outside, "sub/proof"), "outside");
    expect(spawnSync("mkfifo", [join(outside, "sub/never-read")]).status).toBe(
      0,
    );
    symlinkSync(outside, join(anchor, "link"));
    for (let round = 0; round < 2; round++) {
      expect(() => safeFile(join(anchor, "link/sub"), "proof", anchor)).toThrow(
        "evidence_root_unsafe",
      );
      expect(() =>
        safeFile(join(anchor, "link/sub"), "never-read", anchor),
      ).toThrow("evidence_root_unsafe");
      expect(() =>
        writeEvidenceReport(
          join(anchor, "link/sub"),
          "receipt.json",
          {},
          anchor,
        ),
      ).toThrow("report_root_unsafe");
      expect(readFileSync(join(outside, "sub/proof"), "utf8")).toBe("outside");
    }
  });
});
