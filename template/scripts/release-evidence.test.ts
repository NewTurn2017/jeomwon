import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeArtifactFixture } from "./qa-artifact-contract-test-fixture";
import { buildReleaseReceipt } from "./release-evidence-contract";
import { sha256File } from "./release-evidence-files";

const digest = "a".repeat(64);

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "release-evidence-test-"));
  mkdirSync(join(root, "proof"));
  for (const name of [
    "archive.tgz",
    "compatibility.json",
    "project.json",
    "capabilities.json",
    "setup.json",
    "qa.ts",
    "generated.json",
    "setup.log",
    "manifest.json",
    "shot.png",
    "deploy.json",
    "workshop.json",
    "local.json",
  ]) {
    writeFileSync(
      join(root, "proof", name),
      name === "project.json"
        ? JSON.stringify({
            schemaVersion: 1,
            templateApi: 1,
            contracts: { capabilitySchema: 1, setupSchema: 2, qaContract: 2 },
          })
        : name === "compatibility.json"
          ? JSON.stringify({
              schemaVersion: 1,
              compatibility: {
                templateApi: 1,
                capabilitySchema: 1,
                setupSchema: 2,
                qaContract: 2,
              },
              templateSource: {
                archiveSha256: sha256File(root, "proof/archive.tgz"),
                contentSha256: digest,
              },
            })
          : name === "capabilities.json"
            ? JSON.stringify({ schemaVersion: 1 })
            : name === "setup.json"
              ? JSON.stringify({ schemaVersion: 2 })
              : name === "manifest.json"
                ? JSON.stringify({ qaContractVersion: 2 })
                : name === "generated.json"
                  ? "pending"
                  : name,
    );
  }
  writeArtifactFixture(join(root, "proof"));
  writeFileSync(
    join(root, "proof/generated.json"),
    JSON.stringify({
      schemaVersion: 3,
      projectIdentity: "b".repeat(64),
      templateApi: 1,
      contracts: { capabilitySchema: 1, setupSchema: 2, qaContract: 2 },
      templateSource: {
        archiveSha256: sha256File(root, "proof/archive.tgz"),
        contentSha256: digest,
      },
      contractFiles: {
        capabilityManifestSha256: sha256File(root, "proof/capabilities.json"),
        setupConfigSha256: sha256File(root, "proof/setup.json"),
        qaContractSha256: sha256File(root, "proof/qa.ts"),
      },
    }),
  );
  return root;
}

function validInput(root: string) {
  const evidence = (path: string, status = "verified") => ({
    status,
    path: `proof/${path}`,
    sha256: sha256File(root, `proof/${path}`),
  });
  return {
    schemaVersion: 1,
    git: { commit: "1".repeat(40), sourceState: "clean", diffSha256: null },
    runtime: {
      bun: Bun.version,
      node: process.versions.node,
      platform: `${process.platform}-${process.arch}`,
    },
    contracts: {
      compatibility: { ...evidence("compatibility.json"), schemaVersion: 1 },
      project: { ...evidence("project.json"), schemaVersion: 1 },
      capability: { ...evidence("capabilities.json"), schemaVersion: 1 },
      setup: { ...evidence("setup.json"), schemaVersion: 2 },
      qa: { ...evidence("qa.ts"), schemaVersion: 2 },
    },
    archive: { ...evidence("archive.tgz"), contentSha256: digest },
    generatedProofs: [evidence("generated.json")],
    setupPreview: evidence("setup.log"),
    qaManifest: { ...evidence("manifest.json"), schemaVersion: 2 },
    browser: {
      status: "verified",
      actions: evidence("browser-actions.json"),
      screenshots: [evidence("browser-a-login.png")],
    },
    deploymentReadiness: evidence("deploy.json"),
    workshop: evidence("workshop.json"),
    localProof: evidence("local.json"),
    firstSuccess: { status: "defined-not-measured" },
    operations: [
      {
        name: "tag",
        status: "blocked",
        reason: "publication_pending_orchestrator",
        receipt: evidence("local.json"),
      },
      {
        name: "release",
        status: "blocked",
        reason: "publication_pending_orchestrator",
      },
    ],
  };
}

function object(value: Record<string, unknown>, key: string) {
  return value[key] as Record<string, unknown>;
}
function operation(value: Record<string, unknown>) {
  return (value.operations as Array<Record<string, unknown>>)[0]!;
}

describe("release evidence contract", () => {
  test("builds deterministic redacted evidence and accepts truthful blocked operations", () => {
    const root = fixtureRoot();
    const input = validInput(root);
    const one = buildReleaseReceipt(input, root, "1".repeat(40));
    const two = buildReleaseReceipt(input, root, "1".repeat(40));
    expect(one).toEqual(two);
    expect(one.firstSuccess.status).toBe("defined-not-measured");
    expect(one.operations[0]?.status).toBe("blocked");
    expect(
      one.operations.find((item) => item.name === "tag")?.receipt?.status,
    ).toBe("verified");
  });

  test("canonicalizes set-like operation order before self-hash", () => {
    const root = fixtureRoot();
    const left = validInput(root);
    const right = structuredClone(left);
    right.operations.reverse();
    expect(buildReleaseReceipt(left, root, "1".repeat(40))).toEqual(
      buildReleaseReceipt(right, root, "1".repeat(40)),
    );
  });

  test.each([
    [
      "missing path",
      (value: Record<string, unknown>): void => {
        delete object(value, "setupPreview").path;
      },
      "evidence_path_missing",
    ],
    [
      "bad hash",
      (value: Record<string, unknown>): void => {
        object(value, "localProof").sha256 = digest;
      },
      "evidence_hash_mismatch",
    ],
    [
      "schema mismatch",
      (value: Record<string, unknown>): void => {
        object(object(value, "contracts"), "setup").schemaVersion = 1;
      },
      "contract_schema_mismatch",
    ],
    [
      "commit mismatch",
      (value: Record<string, unknown>): void => {
        object(value, "git").commit = "2".repeat(40);
      },
      "git_commit_mismatch",
    ],
    [
      "dirty state mismatch",
      (value: Record<string, unknown>): void => {
        object(value, "git").sourceState = "uncommitted";
        object(value, "git").diffSha256 = digest;
      },
      "git_state_mismatch",
    ],
    [
      "archive mismatch",
      (value: Record<string, unknown>): void => {
        object(value, "archive").contentSha256 = "b".repeat(64);
      },
      "archive_manifest_mismatch",
    ],
    [
      "manifest mismatch",
      (value: Record<string, unknown>): void => {
        object(value, "qaManifest").schemaVersion = 1;
      },
      "qa_manifest_schema_mismatch",
    ],
    [
      "email",
      (value: Record<string, unknown>): void => {
        operation(value).reason = "owner@example.com";
      },
      "sensitive_input",
    ],
    [
      "token",
      (value: Record<string, unknown>): void => {
        operation(value).reason = "Bearer abcdefghijklmnop";
      },
      "sensitive_input",
    ],
    [
      "raw url",
      (value: Record<string, unknown>): void => {
        operation(value).reason = "https://user:pass@example.test?a=b";
      },
      "sensitive_input",
    ],
    [
      "browser storage",
      (value: Record<string, unknown>): void => {
        object(value, "browser").storageState = {};
      },
      "sensitive_input",
    ],
    [
      "provider payload",
      (value: Record<string, unknown>): void => {
        value.providerPayload = {};
      },
      "sensitive_input",
    ],
  ] as const)("rejects %s twice with a stable error", (_, mutate, code) => {
    const root = fixtureRoot();
    const input = validInput(root) as unknown as Record<string, unknown>;
    mutate(input);
    for (let round = 0; round < 2; round++)
      expect(() => buildReleaseReceipt(input, root, "1".repeat(40))).toThrow(
        code,
      );
  });

  test("rejects a forged measured first-success data set below ten runs", () => {
    const root = fixtureRoot();
    const input = validInput(root) as unknown as Record<string, unknown>;
    writeFileSync(
      join(root, "proof", "runs.json"),
      JSON.stringify({ runs: [] }),
    );
    input.firstSuccess = {
      status: "verified",
      dataset: {
        status: "verified",
        path: "proof/runs.json",
        sha256: sha256File(root, "proof/runs.json"),
      },
    };
    expect(() => buildReleaseReceipt(input, root, "1".repeat(40))).toThrow(
      "first_success_schema_invalid",
    );
  });
});
