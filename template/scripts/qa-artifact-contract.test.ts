import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateQaRuntimeArtifacts } from "./qa-artifact-contract";
import {
  artifactIssues,
  tempArtifactDir,
  writeArtifactFixture,
} from "./qa-artifact-contract-test-fixture";
import { QA_GATE_CONTRACT } from "./qa-contract";

describe("QA runtime artifact contract", () => {
  test("Given exact linked gate/browser/cleanup artifacts, When validation runs, Then runtime evidence passes", () => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir, { 2: "SKIP", 9: "SKIP" });
    expect(validateQaRuntimeArtifacts(artifactDir)).toEqual({ ok: true });
  });

  test.each([
    7, 10, 11,
  ])("Given required gate %i is top-level SKIP, When validation runs, Then success is rejected", (id) => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir, { [id]: "SKIP" });
    expect(artifactIssues(artifactDir)).toContain(`results:skip:${id}`);
  });

  test("Given an empty gate artifact, When validation runs, Then success is rejected", () => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    writeFileSync(join(artifactDir, QA_GATE_CONTRACT[9].artifact), "");
    expect(artifactIssues(artifactDir)).toContain("artifact:invalid:10");
  });

  test.each([
    { status: "SKIP" },
    {
      status: "PASS",
      unauthenticated: {
        createRejected: true,
        updateRejected: true,
        deleteRejected: true,
      },
      authenticatedNonoperator: {
        createRejected: true,
        updateRejected: true,
        deleteRejected: false,
      },
    },
  ])("Given an invalid gate 10 CRUD subcase, When validation runs, Then success is rejected", (operatorCrudBoundarySubcase) => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    const artifactPath = join(artifactDir, QA_GATE_CONTRACT[9].artifact);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    artifact.evidence.operatorCrudBoundarySubcase = operatorCrudBoundarySubcase;
    writeFileSync(artifactPath, JSON.stringify(artifact));

    expect(artifactIssues(artifactDir)).toContain(
      "artifact:operator-boundary:10",
    );
  });

  test("Given a gate artifact identity mismatch, When validation runs, Then success is rejected", () => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    writeFileSync(
      join(artifactDir, QA_GATE_CONTRACT[10].artifact),
      JSON.stringify({ id: 10, name: "wrong", status: "PASS", evidence: {} }),
    );

    expect(artifactIssues(artifactDir)).toContain("artifact:contract:11");
  });

  test("Given a PASS runner embeds raw diagnostic output, When validation runs, Then the manifest is rejected", () => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    const manifest = JSON.parse(
      readFileSync(join(artifactDir, "manifest.json"), "utf8"),
    );
    manifest.runner.output = "operator@example.com raw browser error";
    writeFileSync(join(artifactDir, "manifest.json"), JSON.stringify(manifest));
    expect(artifactIssues(artifactDir)).toContain("manifest:runner");
  });

  test.each([
    [null],
    [{}],
    [[]],
    [""],
    ["placeholder"],
    [{ placeholder: true }],
  ])("Given gate evidence %p, When validation runs, Then placeholder proof is rejected", (evidence) => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    const gate = QA_GATE_CONTRACT[0];
    writeFileSync(
      join(artifactDir, gate.artifact),
      JSON.stringify({
        id: gate.id,
        name: gate.name,
        status: "PASS",
        evidence,
      }),
    );
    expect(artifactIssues(artifactDir)).toContain("artifact:evidence:1");
  });

  test.each([
    2, 9,
  ])("Given allowed SKIP gate %i has no concrete reason, When validation runs, Then success is rejected", (id) => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir, { [id]: "SKIP" });
    const gate = QA_GATE_CONTRACT[id - 1];
    if (gate === undefined) throw new Error("fixture gate missing");
    writeFileSync(
      join(artifactDir, gate.artifact),
      JSON.stringify({
        id,
        name: gate.name,
        status: "SKIP",
        evidence: { status: "SKIP", reason: "" },
      }),
    );
    expect(artifactIssues(artifactDir)).toContain(
      `artifact:skip-evidence:${id}`,
    );
  });

  test.each([
    null,
    { reset: {}, seed: {} },
    {
      reset: {
        domainKey: "",
        reservations: -1,
        chatThreads: 0,
        chatEvents: 0,
      },
      seed: { resources: 0 },
    },
  ])("Given qaReset proof %p, When validation runs, Then placeholder reset evidence is rejected", (qaReset) => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    const manifest = JSON.parse(
      readFileSync(join(artifactDir, "manifest.json"), "utf8"),
    );
    manifest.qaReset = qaReset;
    writeFileSync(join(artifactDir, "manifest.json"), JSON.stringify(manifest));
    expect(artifactIssues(artifactDir)).toContain("manifest:qa-reset");
  });
});
