import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  artifactIssues,
  tempArtifactDir,
  writeArtifactFixture,
} from "./qa-artifact-contract-test-fixture";
import { QA_CONTRACT_VERSION, QA_GATE_CONTRACT } from "./qa-contract";

describe("versioned QA evidence", () => {
  test("the compatibility manifest and QA evidence share one contract version", () => {
    const templateManifest = JSON.parse(
      readFileSync(join(import.meta.dir, "../jeomwon-template.json"), "utf8"),
    );
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    const manifest = JSON.parse(
      readFileSync(join(artifactDir, "manifest.json"), "utf8"),
    );
    const firstArtifact = JSON.parse(
      readFileSync(join(artifactDir, QA_GATE_CONTRACT[0].artifact), "utf8"),
    );

    expect(templateManifest.contracts.qaContract).toBe(QA_CONTRACT_VERSION);
    expect(manifest.qaContractVersion).toBe(QA_CONTRACT_VERSION);
    expect(firstArtifact.qaContractVersion).toBe(QA_CONTRACT_VERSION);
  });

  test.each([
    0,
    2,
    "1",
    null,
  ])("manifest QA contract version %p is rejected", (qaContractVersion) => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    const manifestPath = join(artifactDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.qaContractVersion = qaContractVersion;
    writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(artifactIssues(artifactDir)).toContain(
      "manifest:qa-contract-version",
    );
  });

  test("a gate artifact without the exact QA contract version is rejected", () => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    const gate = QA_GATE_CONTRACT[0];
    const artifactPath = join(artifactDir, gate.artifact);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    delete artifact.qaContractVersion;
    writeFileSync(artifactPath, JSON.stringify(artifact));

    expect(artifactIssues(artifactDir)).toContain("artifact:contract:1");
  });
});
