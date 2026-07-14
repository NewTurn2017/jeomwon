"use client";

import type {
  ReservationStatus,
  WidgetReservation,
  WidgetSnapshot,
} from "@jeomwon/backend/src/agent-contract";
import { CalendarDays, LayoutGrid } from "lucide-react";
import { useScopedI18n } from "@/locales/client";
import { StatusPill } from "./admin-dashboard";

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_DAY_COUNT = 7;

// Statuses that occupy a slot from the operator's point of view. Cancelled,
// expired, denied, and notify-only waitlist rows do not block a resource.
const slotOccupyingStatuses: ReadonlySet<ReservationStatus> = new Set([
  "held",
  "confirmed",
  "rescheduled",
  "escalated",
]);

// All times below derive from snapshot.generatedAtMs, not a local clock: the
// board re-renders when the snapshot changes, so a render-time Date.now()
// would only add nondeterminism without adding freshness.
export function AdminWidgetBoard({
  snapshot,
}: {
  snapshot: WidgetSnapshot;
}) {
  if (snapshot.domain.adminWidget === "seatGrid") {
    return <SeatGridWidget snapshot={snapshot} />;
  }

  return <CalendarWidget snapshot={snapshot} />;
}

type CalendarDay = {
  key: string;
  startMs: number;
  reservations: WidgetReservation[];
};

function CalendarWidget({ snapshot }: { snapshot: WidgetSnapshot }) {
  const t = useScopedI18n("dashboard");
  const { locale, storeTimezone } = snapshot.domain;
  const days = buildCalendarDays(
    snapshot.reservations,
    storeTimezone,
    snapshot.generatedAtMs,
  );

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex min-w-0 items-start gap-3 border-border border-b p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CalendarDays aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-card-foreground text-lg">
            {t("calendarTitle")}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t("calendarDescription")}
          </p>
        </div>
      </div>
      <ol className="divide-y divide-border">
        {days.map((day) => (
          <li
            className="grid gap-2 px-5 py-3 md:grid-cols-[150px_minmax(0,1fr)]"
            key={day.key}
          >
            <p className="font-medium text-foreground text-sm">
              {formatDayLabel(day.startMs, locale, storeTimezone)}
            </p>
            {day.reservations.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("calendarDayEmpty")}
              </p>
            ) : (
              <ul className="grid min-w-0 gap-2">
                {day.reservations.map((reservation) => (
                  <li
                    className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                    key={reservation.id}
                  >
                    <span className="font-medium text-foreground tabular-nums">
                      {formatTime(reservation.startMs, locale, storeTimezone)}–
                      {formatTime(reservation.endMs, locale, storeTimezone)}
                    </span>
                    <span className="min-w-0 truncate text-foreground/80">
                      {reservation.serviceLabel} · {reservation.resourceLabel}
                    </span>
                    <StatusPill status={reservation.status} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function buildCalendarDays(
  reservations: WidgetReservation[],
  timeZone: string,
  nowMs: number,
): CalendarDay[] {
  const days: CalendarDay[] = Array.from(
    { length: CALENDAR_DAY_COUNT },
    (_, index) => {
      const startMs = nowMs + index * DAY_MS;
      return { key: dayKey(startMs, timeZone), startMs, reservations: [] };
    },
  );
  const dayByKey = new Map(days.map((day) => [day.key, day]));
  const occupying = reservations
    .filter((reservation) => slotOccupyingStatuses.has(reservation.status))
    .sort((current, next) => current.startMs - next.startMs);

  for (const reservation of occupying) {
    dayByKey.get(dayKey(reservation.startMs, timeZone))?.reservations.push(
      reservation,
    );
  }

  return days;
}

type SeatState =
  | { kind: "occupied"; reservation: WidgetReservation }
  | { kind: "upcoming"; reservation: WidgetReservation }
  | { kind: "available" };

function SeatGridWidget({ snapshot }: { snapshot: WidgetSnapshot }) {
  const t = useScopedI18n("dashboard");
  const { locale, storeTimezone } = snapshot.domain;

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex min-w-0 items-start gap-3 border-border border-b p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <LayoutGrid aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-card-foreground text-lg">
            {t("seatGridTitle")}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t("seatGridDescription")}
          </p>
        </div>
      </div>
      <ul className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {snapshot.domain.resources.map((resource) => {
          const state = resolveSeatState(
            resource.key,
            snapshot.reservations,
            snapshot.generatedAtMs,
          );

          return (
            <li
              className="rounded-lg border border-border bg-background p-4"
              key={resource.key}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-semibold text-foreground text-sm">
                  {resource.label}
                </p>
                {state.kind === "available" ? (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-chart-2/30 bg-chart-2/10 px-2.5 py-1 font-medium text-chart-2 text-xs">
                    {t("seatAvailable")}
                  </span>
                ) : (
                  <StatusPill status={state.reservation.status} />
                )}
              </div>
              <p className="mt-2 text-muted-foreground text-xs">
                <SeatStateLine
                  locale={locale}
                  state={state}
                  timeZone={storeTimezone}
                />
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function resolveSeatState(
  resourceKey: string,
  reservations: WidgetReservation[],
  nowMs: number,
): SeatState {
  const occupying = reservations.filter(
    (reservation) =>
      reservation.resourceKey === resourceKey &&
      slotOccupyingStatuses.has(reservation.status),
  );

  const current = occupying.find(
    (reservation) =>
      reservation.startMs <= nowMs && nowMs < reservation.endMs,
  );
  if (current) {
    return { kind: "occupied", reservation: current };
  }

  const upcoming = occupying
    .filter((reservation) => reservation.startMs > nowMs)
    .sort((a, b) => a.startMs - b.startMs)[0];
  if (upcoming) {
    return { kind: "upcoming", reservation: upcoming };
  }

  return { kind: "available" };
}

function SeatStateLine({
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
    return `${t("seatNextAt")} · ${formatDayTime(
      state.reservation.startMs,
      locale,
      timeZone,
    )}`;
  }

  return t("seatAvailable");
}

function dayKey(timestampMs: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestampMs);
}

function formatDayLabel(timestampMs: number, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(timestampMs);
}

function formatTime(timestampMs: number, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestampMs);
}

function formatDayTime(timestampMs: number, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestampMs);
}
