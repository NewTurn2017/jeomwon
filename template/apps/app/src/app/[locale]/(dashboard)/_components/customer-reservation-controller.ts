import type {
  CustomerReservation,
  DomainPublicSnapshot,
  ReservationStatus,
} from "@jeomwon/backend/src/agent-contract";

export const customerReservationActions = [
  "confirm",
  "edit",
  "cancel",
] as const;

export type CustomerReservationAction =
  (typeof customerReservationActions)[number];

export function compatibleResources(
  domain: DomainPublicSnapshot,
  serviceKey: string,
) {
  const service = domain.services.find((entry) => entry.key === serviceKey);
  if (!service) return [];
  return domain.resources.filter(
    (resource) => resource.kind === service.resourceKind,
  );
}

export function compatibleResourceKey(
  domain: DomainPublicSnapshot,
  serviceKey: string,
  resourceKey: string | null,
): string | null {
  if (resourceKey === null) return null;
  return compatibleResources(domain, serviceKey).some(
    (resource) => resource.key === resourceKey,
  )
    ? resourceKey
    : null;
}

export function isHoldExpired(
  holdExpiresAtMs: number | null,
  nowMs: number,
): boolean {
  return holdExpiresAtMs === null || holdExpiresAtMs <= nowMs;
}

export function reservationActions(
  reservation: Pick<CustomerReservation, "status" | "holdExpiresAtMs">,
  nowMs: number,
): readonly CustomerReservationAction[] {
  switch (reservation.status) {
    case "held":
      return !isHoldExpired(reservation.holdExpiresAtMs, nowMs)
        ? ["confirm", "cancel"]
        : [];
    case "confirmed":
    case "rescheduled":
      return ["edit", "cancel"];
    case "draft":
    case "eligible":
    case "waitlisted":
    case "cancelled":
    case "expired":
    case "denied":
    case "escalated":
      return [];
    default:
      return assertNever(reservation.status);
  }
}

export function isHistoryStatus(status: ReservationStatus): boolean {
  switch (status) {
    case "cancelled":
    case "expired":
    case "denied":
      return true;
    case "draft":
    case "eligible":
    case "held":
    case "confirmed":
    case "rescheduled":
    case "waitlisted":
    case "escalated":
      return false;
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected reservation status: ${String(value)}`);
}
