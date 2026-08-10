import { describe, expect, test } from "bun:test";
import { qaOverallStatus } from "./qa-cleanup-contract";

describe("QA cleanup outcome", () => {
  test("cleanup failure overrides successful functional assertions", () => {
    expect(
      qaOverallStatus({
        functionalSucceeded: true,
        artifactsValid: true,
        cleanupFailures: ["convex-env:JEOMWON_QA_RESET"],
      }),
    ).toBe("cleanup_failed");
  });

  test("functional failure remains distinct when cleanup succeeds", () => {
    expect(
      qaOverallStatus({
        functionalSucceeded: false,
        artifactsValid: false,
        cleanupFailures: [],
      }),
    ).toBe("qa_failed");
  });

  test("only complete functional, artifact, and cleanup success passes", () => {
    expect(
      qaOverallStatus({
        functionalSucceeded: true,
        artifactsValid: true,
        cleanupFailures: [],
      }),
    ).toBe("PASS");
  });
});
