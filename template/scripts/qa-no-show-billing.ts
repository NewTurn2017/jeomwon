import { runQaConvexFunction } from "./qa-convex-runner";
import { assert, assertRecord, type JsonRecord } from "./qa-shared";

const billingSource =
  "accountDeletionJobs.phase+subscriptionCompleted" as const;

export async function observedAccountBillingState(): Promise<JsonRecord> {
  const value = await runQaConvexFunction(
    "qaNoShow:inspectAccountBillingState",
    {},
  );
  assertRecord(value, "no-show observed account billing state");
  return value;
}

export function unchangedAccountBilling(
  before: JsonRecord,
  after: JsonRecord,
): JsonRecord {
  assert(before.source === billingSource, "no-show billing source is invalid");
  assert(after.source === billingSource, "no-show billing source changed");
  assert(
    JSON.stringify(before) === JSON.stringify(after),
    "no-show account billing state changed",
  );
  return { source: billingSource, before, after, unchanged: true };
}
