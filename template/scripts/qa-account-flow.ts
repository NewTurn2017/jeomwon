import type { domainConfig } from "../packages/backend/domain.config";
import {
  type AccountFlowHooks,
  accountCancellationTemplate,
  capturedCanonicalSuccess,
} from "./qa-account-delivery";
import { pageCanonicalCall } from "./qa-browser";
import { assert, assertRecord, DAY_MS, isRecord, readPath } from "./qa-shared";
import { nextAllowedSlotStart } from "./qa-time";
import {
  assertErrorOmitsSensitiveData,
  canonicalFailureCode,
  canonicalSuccessValue,
  firstCanonicalSlot,
  qaPageA,
  qaPageB,
  requestJson,
  threadIdForPage,
} from "./qa-transport";

type Service = (typeof domainConfig.services)[number];
type Resource = (typeof domainConfig.resources)[number];

export async function runAuthenticatedAccountFlow(
  service: Service,
  resource: Resource,
  hooks?: AccountFlowHooks,
) {
  const initialAvailability = await canonicalSuccessValue(
    qaPageA(),
    {
      operation: "availableSlots",
      args: {
        serviceKey: service.key,
        resourceKey: resource.key,
        preferredStartMs: nextAllowedSlotStart(Date.now() + DAY_MS),
        count: 3,
      },
    },
    "identity A initial availability",
  );
  const initialSlot = firstCanonicalSlot(initialAvailability, "initial slot");
  const created = await canonicalSuccessValue(
    qaPageA(),
    {
      operation: "createHold",
      args: {
        serviceKey: initialSlot.serviceKey,
        resourceKey: initialSlot.resourceKey,
        startMs: initialSlot.startMs,
      },
    },
    "identity A createHold",
  );
  const ownerReservationId = readPath(created, [
    "publicContext",
    "reservationId",
  ]);
  assert(
    typeof ownerReservationId === "string",
    "identity A confirmation has no reservation ID",
  );
  const confirmed = await capturedCanonicalSuccess(
    {
      operation: "confirmReservation",
      args: { reservationId: ownerReservationId },
    },
    "identity A confirmReservation",
    "reservation.confirmed",
    hooks,
  );
  const rescheduleAvailability = await canonicalSuccessValue(
    qaPageA(),
    {
      operation: "availableSlots",
      args: {
        serviceKey: service.key,
        resourceKey: resource.key,
        preferredStartMs: initialSlot.startMs + DAY_MS,
        count: 3,
      },
    },
    "identity A reschedule availability",
  );
  const rescheduleSlot = firstCanonicalSlot(
    rescheduleAvailability,
    "reschedule slot",
  );
  const ownerThread = threadIdForPage(qaPageA());
  const crossOwnerRead = await requestJson(
    `/api/chat?thread_id=${encodeURIComponent(ownerThread)}`,
    {},
    qaPageB(),
  );
  const crossOwnerCreateHold = await pageCanonicalCall(qaPageB(), {
    operation: "createHold",
    args: {
      serviceKey: initialSlot.serviceKey,
      resourceKey: initialSlot.resourceKey,
      startMs: initialSlot.startMs,
    },
  });
  const crossOwnerCreateHoldCode = canonicalFailureCode(
    crossOwnerCreateHold,
    "identity B createHold at A occupied slot",
    "slot_conflict",
  );
  const crossOwnerCreateHoldRejected =
    crossOwnerCreateHoldCode === "slot_conflict";
  const lifecycleResults = [
    [
      "confirm",
      await pageCanonicalCall(qaPageB(), {
        operation: "confirmReservation",
        args: { reservationId: ownerReservationId },
      }),
    ],
    [
      "cancel",
      await pageCanonicalCall(qaPageB(), {
        operation: "cancelReservation",
        args: { reservationId: ownerReservationId },
      }),
    ],
    [
      "reschedule",
      await pageCanonicalCall(qaPageB(), {
        operation: "rescheduleReservation",
        args: {
          reservationId: ownerReservationId,
          serviceKey: rescheduleSlot.serviceKey,
          resourceKey: rescheduleSlot.resourceKey,
          startMs: rescheduleSlot.startMs,
        },
      }),
    ],
  ] as const;
  const crossOwnerLifecycleCodes = lifecycleResults.map(([operation, result]) =>
    canonicalFailureCode(
      result,
      `identity B ${operation} A reservation`,
      "reservation_not_found",
    ),
  );
  assertErrorOmitsSensitiveData(
    crossOwnerRead.body,
    "identity B foreign-thread response",
    [ownerReservationId, ownerThread],
  );
  for (const [operation, result] of lifecycleResults) {
    assertErrorOmitsSensitiveData(result, `identity B ${operation} error`, [
      ownerReservationId,
      ownerThread,
    ]);
  }
  const identityBSnapshot = await canonicalSuccessValue(
    qaPageB(),
    { operation: "snapshot", args: {} },
    "identity B snapshot",
  );
  const identityBSnapshotRows = readPath(identityBSnapshot, ["reservations"]);
  assert(
    Array.isArray(identityBSnapshotRows) && identityBSnapshotRows.length === 0,
    "identity B snapshot exposed reservation rows from identity A",
  );
  assertErrorOmitsSensitiveData(identityBSnapshot, "identity B snapshot", [
    ownerReservationId,
    ownerThread,
  ]);
  const crossOwnerLifecycleRejected = crossOwnerLifecycleCodes.every(
    (code) => code === "reservation_not_found",
  );
  const crossOwnerRejected =
    crossOwnerRead.status >= 400 &&
    crossOwnerCreateHoldRejected &&
    crossOwnerLifecycleRejected;
  assert(crossOwnerRejected, "identity B accessed identity A reservation");
  const rescheduled = await capturedCanonicalSuccess(
    {
      operation: "rescheduleReservation",
      args: {
        reservationId: ownerReservationId,
        serviceKey: rescheduleSlot.serviceKey,
        resourceKey: rescheduleSlot.resourceKey,
        startMs: rescheduleSlot.startMs,
      },
    },
    "identity A rescheduleReservation",
    "reservation.rescheduled",
    hooks,
  );
  const cancelTemplate = accountCancellationTemplate(rescheduleSlot.startMs);
  const cancelled = await capturedCanonicalSuccess(
    {
      operation: "cancelReservation",
      args: { reservationId: ownerReservationId },
    },
    "identity A cancelReservation",
    cancelTemplate,
    hooks,
  );
  const snapshot = await canonicalSuccessValue(
    qaPageA(),
    { operation: "snapshot", args: {} },
    "identity A snapshot",
  );
  const snapshotRows = readPath(snapshot, ["reservations"]);
  assert(
    Array.isArray(snapshotRows),
    "identity A snapshot has no reservations",
  );
  const ownerRow = snapshotRows.find(
    (row) => isRecord(row) && row.id === ownerReservationId,
  );
  assertRecord(ownerRow, "identity A snapshot owner row");
  const ownCrudSucceeded =
    readPath(created, ["publicContext", "status"]) === "held" &&
    readPath(confirmed, ["publicContext", "status"]) === "confirmed" &&
    readPath(rescheduled, ["publicContext", "status"]) === "rescheduled" &&
    ["cancelled", "escalated"].includes(
      String(readPath(cancelled, ["publicContext", "status"])),
    ) &&
    ["cancelled", "escalated"].includes(String(ownerRow.status));
  assert(ownCrudSucceeded, "identity A canonical own CRUD did not complete");
  return {
    crossOwnerReadStatus: crossOwnerRead.status,
    crossOwnerCreateHoldCode,
    crossOwnerLifecycleCodes,
    identityBSnapshot,
    crossOwnerRejected,
    ownCrudSucceeded,
    ownCrud: { created, confirmed, rescheduled, cancelled, snapshot },
  };
}
