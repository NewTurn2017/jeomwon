export type QaOverallStatus = "PASS" | "qa_failed" | "cleanup_failed";

type QaOutcomeInput = {
  readonly functionalSucceeded: boolean;
  readonly artifactsValid: boolean;
  readonly cleanupFailures: readonly string[];
};

export function qaOverallStatus(input: QaOutcomeInput): QaOverallStatus {
  if (input.cleanupFailures.length > 0) return "cleanup_failed";
  return input.functionalSucceeded && input.artifactsValid
    ? "PASS"
    : "qa_failed";
}
