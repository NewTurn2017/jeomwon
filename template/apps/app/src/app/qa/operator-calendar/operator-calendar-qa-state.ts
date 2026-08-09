import type {
  AdminCustomerRescheduleArgs,
  AdminReservation,
  AdminSessionCreateArgs,
  AdminSessionUpdateArgs,
} from "@jeomwon/backend/src/agent-contract";

export type OperatorCalendarQaAction =
  | { kind: "create"; args: AdminSessionCreateArgs }
  | { kind: "update"; args: AdminSessionUpdateArgs }
  | { kind: "reschedule"; args: AdminCustomerRescheduleArgs }
  | { kind: "cancel"; args: { reservationId: string } };

export function applyOperatorCalendarQaAction(
  reservations: readonly AdminReservation[],
  action: OperatorCalendarQaAction,
): AdminReservation[] {
  if (action.kind === "cancel") {
    return reservations.filter((row) => row.id !== action.args.reservationId);
  }

  const startMs = fixtureStartMs(action.args.dateKey, action.args.startTime);
  if (action.kind === "create") {
    return [
      ...reservations,
      {
        id: "OP-QA-CREATED",
        threadId: "operator:OP-QA-CREATED",
        origin: "operator",
        displayName: action.args.title,
        serviceKey: action.args.serviceKey,
        serviceLabel: "Consultation",
        resourceKey: action.args.resourceKey,
        resourceLabel: "Room A",
        startMs,
        endMs: startMs + 60 * 60_000,
        timeWindow: fixtureTimeWindow(action.args.startTime),
        status: "confirmed",
        holdExpiresAtMs: null,
        auditHistory: [],
        internalContext: {
          operatorMemo: null,
          privateDecision: null,
          riskSignals: [],
          costBasisCents: null,
        },
        createdAtMs: 1,
        updatedAtMs: 1,
      },
    ];
  }

  return reservations.map((row) =>
    row.id === action.args.reservationId
      ? {
          ...row,
          displayName:
            action.kind === "update" ? action.args.title : row.displayName,
          serviceKey: action.args.serviceKey,
          resourceKey: action.args.resourceKey,
          startMs,
          endMs: startMs + 60 * 60_000,
          timeWindow: fixtureTimeWindow(action.args.startTime),
          updatedAtMs: row.updatedAtMs + 1,
        }
      : row,
  );
}

export function operatorCalendarQaStateHash(
  reservations: readonly AdminReservation[],
): string {
  const serialized = JSON.stringify(
    reservations.map((row) => ({
      id: row.id,
      origin: row.origin,
      displayName: row.displayName,
      serviceKey: row.serviceKey,
      resourceKey: row.resourceKey,
      startMs: row.startMs,
      endMs: row.endMs,
      status: row.status,
    })),
  );
  let hash = 2_166_136_261;
  for (const character of serialized) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fixtureStartMs(dateKey: string, startTime: string) {
  return Date.parse(`${dateKey}T${startTime}:00+09:00`);
}

function fixtureTimeWindow(startTime: string) {
  const [hours = "00", minutes = "00"] = startTime.split(":");
  const endMinutes = Number(hours) * 60 + Number(minutes) + 60;
  const endHours = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
  const endMinutePart = String(endMinutes % 60).padStart(2, "0");
  return `${startTime}-${endHours}:${endMinutePart}`;
}
