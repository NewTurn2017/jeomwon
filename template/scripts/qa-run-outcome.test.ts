import { expect, test } from "bun:test";
import {
  QaStableAssertionError,
  qaFailureCause,
  qaRunnerOutcome,
} from "./qa-run-outcome";

test("runner retains a stable wrapper and underlying gate assertion cause", () => {
  const cause = qaFailureCause(
    new QaStableAssertionError("confirmation_guardrail_not_blocked"),
  );
  expect(
    qaRunnerOutcome(
      { wrapperCode: "qa_runner_failed", stage: "gate-3", cause },
      [],
    ),
  ).toEqual({
    status: "FAIL",
    code: "qa_runner_failed",
    functionalFailure: {
      wrapperCode: "qa_runner_failed",
      stage: "gate-3",
      cause: "confirmation_guardrail_not_blocked",
    },
    cleanupFailures: [],
  });
});

test("cleanup failure retains the primary functional error deterministically", () => {
  expect(
    qaRunnerOutcome(
      {
        wrapperCode: "qa_runner_failed",
        stage: "gate-2",
        cause: "cancel_window_not_escalated",
      },
      ["browser:close"],
    ),
  ).toEqual({
    status: "FAIL",
    code: "cleanup_failed",
    functionalFailure: {
      wrapperCode: "qa_runner_failed",
      stage: "gate-2",
      cause: "cancel_window_not_escalated",
    },
    cleanupFailures: ["browser:close"],
  });
});
