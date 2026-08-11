import { domainConfig } from "../packages/backend/domain.config";
import { pageCanonicalCall } from "./qa-browser";
import { subscribeQaPublicState } from "./qa-browser-state-wait";
import { runQaConvexFunction } from "./qa-convex-runner";
import {
  observedAccountBillingState,
  unchangedAccountBilling,
} from "./qa-no-show-billing";
import {
  assert,
  assertRecord,
  type JsonRecord,
  type QaResult,
  qaState,
  writeJson,
} from "./qa-shared";
import { exactStateTimeoutMs } from "./qa-time";
import {
  canonicalFailureCode,
  canonicalSuccessValue,
  qaPageA,
} from "./qa-transport";

const name = "노쇼 전이 경계";
const skipReason = "features.noShow=false";

export async function qaNoShowGate(): Promise<QaResult> {
  if (!domainConfig.features.noShow) {
    const billingBefore = await observedAccountBillingState();
    const billingAfter = await observedAccountBillingState();
    writeJson(
      "12-no-show.json",
      skippedEvidence(unchangedAccountBilling(billingBefore, billingAfter)),
    );
    return {
      id: 12,
      name,
      status: "SKIP",
      output: [`${skipReason} — 노쇼 전이 게이트는 변경 없이 생략.`],
    };
  }

  assert(qaState.threadA !== null, "no-show QA identity thread is missing");
  const prepared = await runQaConvexFunction("qaNoShow:prepareFixtures", {
    threadId: qaState.threadA,
  });
  assertRecord(prepared, "no-show fixture preparation");
  assertRecord(prepared.fixtureNumbers, "no-show fixture numbers");
  assertRecord(prepared.before, "no-show before side effects");
  assertRecord(
    prepared.accountBillingBefore,
    "no-show before account billing state",
  );
  const positiveId = requiredString(prepared.fixtureNumbers, "positive");
  const futureId = requiredString(prepared.fixtureNumbers, "future");
  const ineligibleId = requiredString(prepared.fixtureNumbers, "ineligible");

  const transitionWait = await subscribeQaPublicState(
    qaPageA(),
    { kind: "status", status: "no_show" },
    exactStateTimeoutMs(),
  );
  let publicState: Awaited<typeof transitionWait.result>;
  try {
    await canonicalSuccessValue(
      qaPageA(),
      { operation: "qaMarkNoShowFixture", args: { reservationId: positiveId } },
      "no-show positive transition",
    );
    publicState = await transitionWait.result;
  } finally {
    await transitionWait.cancel();
  }

  const repeat = await rejection(positiveId, "no_show_already_marked");
  const future = await rejection(futureId, "no_show_future");
  const ineligible = await rejection(ineligibleId, "no_show_wrong_status");
  const inspected = await runQaConvexFunction("qaNoShow:inspectFixtures", {});
  assertRecord(inspected, "no-show fixture inspection");
  assert(Array.isArray(inspected.rows), "no-show fixture rows are missing");
  assert(
    Array.isArray(inspected.publicContexts),
    "no-show public contexts are missing",
  );
  assertRecord(inspected.sideEffects, "no-show after side effects");
  assertRecord(
    inspected.accountBillingState,
    "no-show after account billing state",
  );
  const positive = fixtureRow(inspected.rows, "positive");
  const futureRow = fixtureRow(inspected.rows, "future");
  const ineligibleRow = fixtureRow(inspected.rows, "ineligible");
  const auditTypes = requiredStrings(positive, "auditTypes");
  assert(
    positive.status === "no_show",
    "no-show positive status did not persist",
  );
  assert(
    auditTypes.length === 1 && auditTypes[0] === "reservation.no_show",
    "no-show audit must be exactly once",
  );
  assert(futureRow.status === "confirmed", "future no-show fixture changed");
  assert(
    ineligibleRow.status === "cancelled",
    "ineligible no-show fixture changed",
  );
  assert(
    inspected.publicContexts.length === 1,
    "no-show public context must be unique",
  );
  assert(
    publicState.publicContext.status === "no_show",
    "no-show subscribed public context did not transition",
  );

  const sideEffects = unchangedSideEffects(
    prepared.before,
    inspected.sideEffects,
  );
  const accountBillingState = unchangedAccountBilling(
    prepared.accountBillingBefore,
    inspected.accountBillingState,
  );
  const evidence = {
    status: "PASS",
    fixtureVersion: 1,
    transition: {
      reservationId: positiveId,
      from: "confirmed",
      to: "no_show",
      auditType: "reservation.no_show",
      auditCount: auditTypes.length,
      publicContextStatus: publicState.publicContext.status,
      publicContextCount: inspected.publicContexts.length,
    },
    rejections: { repeat, future, ineligible },
    negativeStatuses: {
      future: futureRow.status,
      ineligible: ineligibleRow.status,
    },
    sideEffects,
    accountBillingState,
    operatorSuccessSmoke: "BLOCKED_MAINTAINER_GOOGLE_IDENTITY",
  } as const;
  writeJson("12-no-show.json", evidence);
  return {
    id: 12,
    name,
    status: "PASS",
    output: [
      `reservation: ${positiveId}`,
      "transition: confirmed -> no_show",
      "audit/publicContext: exactly one",
      "repeat/future/ineligible: stable rejection with no write",
      "email/waitlist/chat + durable account-billing state: unchanged",
    ],
  };
}

async function rejection(
  reservationId: string,
  expected:
    | "no_show_already_marked"
    | "no_show_future"
    | "no_show_wrong_status",
) {
  const result = await pageCanonicalCall(qaPageA(), {
    operation: "qaMarkNoShowFixture",
    args: { reservationId },
  });
  return canonicalFailureCode(result, `no-show ${expected}`, expected);
}

function skippedEvidence(accountBillingState: JsonRecord) {
  const unchanged = { before: 0, after: 0, unchanged: true } as const;
  return {
    status: "SKIP",
    reason: skipReason,
    mutationAttempted: false,
    sideEffects: {
      reservationEmailDeliveries: unchanged,
      waitlistReservations: unchanged,
      chatEvents: unchanged,
    },
    accountBillingState,
    operatorSuccessSmoke: "BLOCKED_MAINTAINER_GOOGLE_IDENTITY",
  } as const;
}

function unchangedSideEffects(before: JsonRecord, after: JsonRecord) {
  const result: Record<
    string,
    { before: number; after: number; unchanged: true }
  > = {};
  for (const key of [
    "reservationEmailDeliveries",
    "waitlistReservations",
    "chatEvents",
  ]) {
    const beforeCount = before[key];
    const afterCount = after[key];
    assert(
      typeof beforeCount === "number",
      `no-show ${key} before count missing`,
    );
    assert(
      typeof afterCount === "number",
      `no-show ${key} after count missing`,
    );
    assert(beforeCount === afterCount, `no-show ${key} changed`);
    result[key] = { before: beforeCount, after: afterCount, unchanged: true };
  }
  return result;
}

function fixtureRow(rows: unknown[], key: string): JsonRecord {
  const row = rows.find(
    (candidate) =>
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      Reflect.get(candidate, "key") === key,
  );
  assertRecord(row, `no-show ${key} fixture`);
  return row;
}

function requiredString(record: JsonRecord, key: string): string {
  const value = record[key];
  assert(typeof value === "string", `no-show ${key} is missing`);
  return value;
}

function requiredStrings(record: JsonRecord, key: string): string[] {
  const value = record[key];
  assert(
    Array.isArray(value) && value.every((entry) => typeof entry === "string"),
    `no-show ${key} is invalid`,
  );
  return value;
}
