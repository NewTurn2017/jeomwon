import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("dedicated no-show QA gate", () => {
  test("uses the next stable gate identity without changing gates 1-11", async () => {
    const { QA_CONTRACT_VERSION, QA_GATE_CONTRACT } = await import(
      "./qa-contract"
    );
    expect(QA_CONTRACT_VERSION).toBe(2);
    expect(QA_GATE_CONTRACT.map(({ id }) => id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(QA_GATE_CONTRACT[11]).toEqual({
      id: 12,
      name: "노쇼 전이 경계",
      artifact: "12-no-show.json",
      skipContract: "features.noShow=false",
    });
  });

  test("owns a distinct runner, deployed fixture, and artifact validator", () => {
    expect(existsSync(join(root, "scripts/qa-gate-no-show.ts"))).toBe(true);
    expect(existsSync(join(root, "packages/backend/convex/qaNoShow.ts"))).toBe(
      true,
    );
    expect(source("scripts/qa.ts")).toContain("qaNoShowGate");
    expect(source("scripts/qa-artifact-contract.ts")).toContain(
      "validateNoShowEvidence",
    );
  });

  test("subscribes before the positive trigger and never waits by timing luck", () => {
    const gate = source("scripts/qa-gate-no-show.ts");
    expect(gate.indexOf("subscribeQaPublicState(")).toBeLessThan(
      gate.indexOf("qaMarkNoShowFixture"),
    );
    expect(gate).not.toMatch(/setTimeout|sleep|poll/i);
    expect(gate).toContain("await transitionWait.result");
    expect(gate).toContain("await transitionWait.cancel()");
  });
});
