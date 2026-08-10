export type QaFunctionalFailure = {
  readonly wrapperCode: "qa_runner_failed";
  readonly stage: string;
  readonly cause: string;
};

export type QaRunnerOutcome =
  | { readonly status: "PASS" }
  | {
      readonly status: "FAIL";
      readonly code: "qa_runner_failed" | "cleanup_failed";
      readonly functionalFailure: QaFunctionalFailure | null;
      readonly cleanupFailures: readonly string[];
    };

export class QaStableAssertionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "QaStableAssertionError";
    this.code = code;
  }
}

export function qaAssertionCause(message: string): string {
  const description = message.split(/[(:]/, 1)[0] ?? "";
  const code = description
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")
    .slice(0, 80);
  return code === "" ? "assertion_failed" : code;
}

export function qaFailureCause(error: unknown): string {
  if (error instanceof QaStableAssertionError) return error.code;
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[a-z][a-z0-9_]{2,80}$/.test(error.code)
  ) {
    return error.code;
  }
  return "unexpected_error";
}

export function qaRunnerOutcome(
  functionalFailure: QaFunctionalFailure | null,
  cleanupFailures: readonly string[],
): QaRunnerOutcome {
  if (functionalFailure === null && cleanupFailures.length === 0) {
    return { status: "PASS" };
  }
  return {
    status: "FAIL",
    code: cleanupFailures.length > 0 ? "cleanup_failed" : "qa_runner_failed",
    functionalFailure,
    cleanupFailures,
  };
}
