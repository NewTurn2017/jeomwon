import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeEvidenceReport } from "./release-evidence-files";

describe("release evidence output safety", () => {
  test("rejects traversal, symlink, and FIFO output twice with stable errors", () => {
    const root = mkdtempSync(join(tmpdir(), "release-output-test-"));
    const outside = mkdtempSync(join(tmpdir(), "release-output-outside-"));
    mkdirSync(join(root, "safe"));
    symlinkSync(outside, join(root, "linked"));
    const fifo = join(root, "safe", "receipt.fifo");
    expect(spawnSync("mkfifo", [fifo]).status).toBe(0);
    const cases = [
      ["../escape.json", "report_path_invalid"],
      ["linked/escape.json", "report_parent_unsafe"],
      ["safe/receipt.fifo", "report_output_unsafe"],
    ] as const;
    for (let round = 0; round < 2; round++) {
      for (const [path, error] of cases) {
        expect(() => writeEvidenceReport(root, path, { ok: true })).toThrow(
          error,
        );
      }
    }
  });
});
