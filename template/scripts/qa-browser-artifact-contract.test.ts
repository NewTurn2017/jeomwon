import { describe, expect, test } from "bun:test";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  artifactIssues,
  tempArtifactDir,
  writeArtifactFixture,
} from "./qa-artifact-contract-test-fixture";

describe("QA browser and cleanup artifact contract", () => {
  test("Given linked browser actions are missing, When validation runs, Then success is rejected", () => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    unlinkSync(join(artifactDir, "browser-actions.json"));
    expect(artifactIssues(artifactDir)).toContain("browser-actions:invalid");
  });

  test("Given a linked screenshot is empty, When validation runs, Then success is rejected", () => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    writeFileSync(join(artifactDir, "browser-a-login.png"), "");
    expect(artifactIssues(artifactDir)).toContain("screenshot:invalid:A");
  });

  test("Given linked cleanup JSON is malformed, When validation runs, Then success is rejected", () => {
    const artifactDir = tempArtifactDir();
    writeArtifactFixture(artifactDir);
    writeFileSync(join(artifactDir, "cleanup.json"), "not-json");
    expect(artifactIssues(artifactDir)).toContain("cleanup:not-closed");
  });
});
