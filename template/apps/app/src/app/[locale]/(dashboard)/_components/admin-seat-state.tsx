"use client";

import type {
  ReservationStatus,
  WidgetReservation,
} from "@jeomwon/backend/src/agent-contract";
import { useScopedI18n } from "@/locales/client";
import { formatWidgetTime } from "./admin-widget-format";

const slotOccupyingStatuses: ReadonlySet<ReservationStatus> = new Set([
  "held",
  "confirmed",
  "rescheduled",
  "escalated",
]);

export function isSlotOccupyingStatus(status: ReservationStatus) {
  return slotOccupyingStatuses.has(status);
}

export type SeatState =
  | { kind: "occupied"; reservation: WidgetReservation }
  | { kind: "upcoming"; reservation: WidgetReservation }
  | { kind: "available" };

export function resolveSeatState(
  resourceKey: string,
  reservations: WidgetReservation[],
  nowMs: number,
): SeatState {
  const occupying = reservations.filter(
    (reservation) =>
      reservation.resourceKey === resourceKey &&
      isSlotOccupyingStatus(reservation.status),
  );
  const current = occupying.find(
    (reservation) => reservation.startMs <= nowMs && nowMs < reservation.endMs,
  );
  if (current) return { kind: "occupied", reservation: current };

  const upcoming = occupying
    .filter((reservation) => reservation.startMs > nowMs)
    .sort((a, b) => a.startMs - b.startMs)[0];
  return upcoming
    ? { kind: "upcoming", reservation: upcoming }
    : { kind: "available" };
}

export function SeatStateLine({
  locale,
  state,
  timeZone,
}: {
  locale: string;
  state: SeatState;
  timeZone: string;
}) {
  const t = useScopedI18n("dashboard");
  if (state.kind === "occupied") {
    return `${t("seatOccupied")} · ${state.reservation.timeWindow}`;
  }
  if (state.kind === "upcoming") {
    return `${t("seatNextAt")} · ${formatWidgetTime(
      state.reservation.startMs,
      locale,
      timeZone,
      true,
    )}`;
  }
  return t("seatAvailable");
}
