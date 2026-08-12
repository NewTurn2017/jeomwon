import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256File, validateEvidenceRef } from "./release-evidence-files";
import type { VersionedRef } from "./release-evidence-input";
import { validateVersioned } from "./release-evidence-validation";

describe("required release evidence fields", () => {
  test("rejects a missing hash and missing schema twice", () => {
    const root = mkdtempSync(join(tmpdir(), "release-missing-test-"));
    writeFileSync(join(root, "proof.json"), "{}\n");
    const base = {
      status: "verified" as const,
      path: "proof.json",
      sha256: sha256File(root, "proof.json"),
    };
    for (let round = 0; round < 2; round++) {
      expect(() =>
        validateEvidenceRef(root, { status: "verified", path: "proof.json" }),
      ).toThrow("evidence_path_missing");
      expect(() => validateVersioned(root, base as VersionedRef)).toThrow(
        "contract_schema_invalid",
      );
    }
  });
});
