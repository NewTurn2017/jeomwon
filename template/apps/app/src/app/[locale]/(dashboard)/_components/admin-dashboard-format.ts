import type { AdminReservation } from "@jeomwon/backend/src/agent-contract";

type DisplayNumber = string | number | null | undefined;
type DisplayableReservation = AdminReservation & {
  publicReservationNumber?: DisplayNumber;
  publicReservationId?: DisplayNumber;
  reservationNumber?: DisplayNumber;
  displayReservationNumber?: DisplayNumber;
};

export function getDisplayReservationNumber(reservation: AdminReservation) {
  const value: DisplayableReservation = reservation;
  const displayNumber =
    value.publicReservationNumber ??
    value.publicReservationId ??
    value.reservationNumber ??
    value.displayReservationNumber;
  return displayNumber === null || displayNumber === undefined
    ? null
    : String(displayNumber);
}

export function formatAdminDateTime(
  timestampMs: number,
  locale: string,
  timeZone?: string,
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestampMs);
}
