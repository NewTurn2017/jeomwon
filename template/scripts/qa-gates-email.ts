import {
  createConfirmedReservation,
  createConfirmedReservationWithEmail,
  waitForEmailCapture,
} from "./qa-booking";
import { pageCanonicalCall } from "./qa-browser";
import { subscribeQaPublicState } from "./qa-browser-state-wait";
import {
  assert,
  assertRecord,
  type QaResult,
  readPath,
  writeJson,
} from "./qa-shared";
import {
  availabilityRequest,
  exactStateTimeoutMs,
  insideCancelFeasible,
  insideCancelRequest,
  outsideCancelRequest,
  qaSlotSelectionMessage,
} from "./qa-time";
import { canonicalFailureCode, postChat, qaPageA } from "./qa-transport";

export async function qaHoldExpiry(): Promise<QaResult> {
  const threadId = `qa-expiry-${Date.now()}`;
  await postChat(threadId, availabilityRequest("내일"));
  const holdExpiry = await subscribeQaPublicState(
    qaPageA(),
    { kind: "status", status: "expired" },
    exactStateTimeoutMs(),
  );
  let hold: unknown;
  let expiredSnapshot: Awaited<typeof holdExpiry.result>;
  try {
    hold = await postChat(threadId, qaSlotSelectionMessage);
    expiredSnapshot = await holdExpiry.result;
  } finally {
    await holdExpiry.cancel();
  }
  assertRecord(hold, "expiry hold response");
  assert(
    readPath(hold, ["publicContext", "status"]) === "held",
    "expiry gate did not create held reservation",
  );
  const reservationId = readPath(hold, ["publicContext", "reservationId"]);
  assert(
    typeof reservationId === "string",
    "expiry gate hold has no reservation ID",
  );
  assert(
    expiredSnapshot.publicContext.status === "expired",
    "hold expiry subscription returned the wrong state",
  );
  const expiredConfirmation = await pageCanonicalCall(qaPageA(), {
    operation: "confirmReservation",
    args: { reservationId },
  });
  const expiredConfirmationCode = canonicalFailureCode(
    expiredConfirmation,
    "expired hold confirmation",
    "reservation_not_actionable",
  );
  writeJson("07-hold-expiry.json", {
    expiredSnapshot,
    expiredConfirmation: { code: expiredConfirmationCode },
  });

  return {
    id: 7,
    name: "홀드 만료 전이",
    status: "PASS",
    output: [
      "wait: exact status subscription",
      `status: ${expiredSnapshot.publicContext.status}`,
      `confirm: ${expiredConfirmationCode}`,
    ],
  };
}

export async function qaEmailCaptureGate(): Promise<QaResult> {
  const confirmed = await createConfirmedReservationWithEmail(
    `qa-email-confirmed-${Date.now()}`,
    availabilityRequest("내일"),
  );

  const cancelledThreadId = await createConfirmedReservation(
    `qa-email-cancelled-${Date.now()}`,
    outsideCancelRequest,
  );
  const cancelledCapture = await waitForEmailCapture(
    cancelledThreadId,
    "reservation.cancelled",
    () => postChat(cancelledThreadId, "취소해줘"),
  );
  const cancelledState = cancelledCapture.triggerResult;
  const cancelled = cancelledCapture.evidence;
  assertRecord(cancelledState, "cancelled email response");
  assert(
    readPath(cancelledState, ["publicContext", "status"]) === "cancelled",
    "email capture gate did not produce a non-escalated cancellation",
  );

  // Escalation needs a reservation inside the cancel window; skip deterministically
  // when the pack's open hours make that impossible at this run time.
  let escalated: typeof confirmed | null = null;
  if (insideCancelFeasible()) {
    const escalatedThreadId = await createConfirmedReservation(
      `qa-email-escalated-${Date.now()}`,
      insideCancelRequest,
    );
    const escalatedCapture = await waitForEmailCapture(
      escalatedThreadId,
      "reservation.escalated",
      () => postChat(escalatedThreadId, "취소해줘"),
    );
    const escalatedState = escalatedCapture.triggerResult;
    escalated = escalatedCapture.evidence;
    assertRecord(escalatedState, "escalated email response");
    assert(
      readPath(escalatedState, ["publicContext", "status"]) === "escalated",
      "email capture gate did not produce an escalation",
    );
  }

  const rescheduledThreadId = await createConfirmedReservation(
    `qa-email-rescheduled-${Date.now()}`,
    outsideCancelRequest,
  );
  await postChat(rescheduledThreadId, "예약 변경하고 싶어요");
  const rescheduledCapture = await waitForEmailCapture(
    rescheduledThreadId,
    "reservation.rescheduled",
    () => postChat(rescheduledThreadId, qaSlotSelectionMessage),
  );
  const rescheduledState = rescheduledCapture.triggerResult;
  const rescheduled = rescheduledCapture.evidence;
  assertRecord(rescheduledState, "rescheduled email response");
  assert(
    readPath(rescheduledState, ["publicContext", "status"]) === "rescheduled",
    "email capture gate did not produce a reschedule",
  );

  writeJson("08-email-capture.json", {
    confirmed,
    cancelled,
    escalated,
    rescheduled,
  });

  return {
    id: 8,
    name: "메일 capture 모드",
    status: "PASS",
    output: [
      `cancelledScenario: ${outsideCancelRequest}`,
      `escalatedScenario: ${insideCancelRequest}`,
      `confirmed: ${confirmed.template}/${confirmed.mode}`,
      `cancelled: ${cancelled.template}/${cancelled.mode}`,
      `escalated: ${escalated ? `${escalated.template}/${escalated.mode}` : "(생략 — 운영시간상 inside-window 불가)"}`,
      `rescheduled: ${rescheduled.template}/${rescheduled.mode}`,
    ],
  };
}
