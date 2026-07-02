"use client";

import type {
  AdminChatEvent,
  AdminDashboardSnapshot,
  AdminReservation,
  AdminReservationAction,
  ReservationStatus,
} from "@v1/backend/src/agent-contract";
import { jeomwonConvex } from "@v1/backend/src/convex-refs";
import { Button } from "@v1/ui/button";
import { cn } from "@v1/ui/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  Armchair,
  CalendarDays,
  Check,
  Clock,
  History,
  ShieldAlert,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useScopedI18n } from "@/locales/client";

type BusinessHours = AdminDashboardSnapshot["domain"]["businessHours"];
type WeekdayKey = keyof BusinessHours;

const statusStyles = {
  draft:
    "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200",
  eligible:
    "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  held: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  confirmed:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  rescheduled:
    "border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200",
  waitlisted:
    "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200",
  cancelled:
    "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200",
  expired:
    "border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-200",
  denied:
    "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  escalated:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
} satisfies Record<ReservationStatus, string>;

const statusLabels = {
  draft: "초안 / Draft",
  eligible: "가능 / Eligible",
  held: "홀드 / Held",
  confirmed: "확정 / Confirmed",
  rescheduled: "변경 / Rescheduled",
  waitlisted: "대기 / Waitlisted",
  cancelled: "취소 / Cancelled",
  expired: "만료 / Expired",
  denied: "거절 / Denied",
  escalated: "에스컬레이션 / Escalated",
} satisfies Record<ReservationStatus, string>;

const visibleGridStatuses = new Set<ReservationStatus>([
  "held",
  "confirmed",
  "rescheduled",
  "escalated",
]);

export function AdminDashboard() {
  const t = useScopedI18n("dashboard");
  const snapshot = useQuery(jeomwonConvex.admin.dashboardSnapshot, {});

  if (!snapshot) {
    return (
      <main className="flex w-full bg-secondary px-6 py-8 dark:bg-black">
        <section className="mx-auto grid w-full max-w-screen-xl gap-4">
          <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-96 animate-pulse rounded-lg border border-border bg-card" />
        </section>
      </main>
    );
  }

  const stats = computeStats(snapshot.reservations);

  return (
    <main className="flex w-full bg-secondary px-6 py-8 dark:bg-black">
      <div className="mx-auto grid w-full max-w-screen-xl gap-6">
        <section className="grid gap-3 md:grid-cols-4">
          <StatTile
            label={t("statsHeld")}
            value={stats.held}
            tone="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
          />
          <StatTile
            label={t("statsConfirmed")}
            value={stats.confirmed}
            tone="border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
          />
          <StatTile
            label={t("statsEscalated")}
            value={stats.escalated}
            tone="border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
          />
          <StatTile
            label={t("statsExpired")}
            value={stats.expired}
            tone="border-stone-300 bg-stone-50 dark:border-stone-800 dark:bg-stone-950/30"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {snapshot.domain.adminWidget === "seatGrid" ? (
            <SeatGridView snapshot={snapshot} />
          ) : (
            <CalendarView snapshot={snapshot} />
          )}
          <EscalationQueue snapshot={snapshot} />
        </section>

        <AgentTimeline
          events={snapshot.events}
          locale={snapshot.domain.locale}
        />
      </div>
    </main>
  );
}

export function SeatGridPrimitiveStory() {
  const now = Date.now();
  const story: AdminDashboardSnapshot = {
    domain: {
      domainKey: "seat-grid-story",
      storeName: "Seat Grid Story",
      storeTimezone: "Asia/Seoul",
      locale: "ko-KR",
      adminWidget: "seatGrid",
      businessHours: {
        monday: { open: "09:00", close: "18:00" },
        tuesday: { open: "09:00", close: "18:00" },
        wednesday: { open: "09:00", close: "18:00" },
        thursday: { open: "09:00", close: "18:00" },
        friday: { open: "09:00", close: "18:00" },
        saturday: { open: "10:00", close: "14:00" },
        sunday: { closed: true },
      },
      policies: {
        cancelWindowHours: 24,
        holdMinutes: 10,
        confirmationRequired: true,
      },
      resources: [
        { key: "seat-a1", label: "A1", kind: "seat" },
        { key: "seat-a2", label: "A2", kind: "seat" },
        { key: "seat-b1", label: "B1", kind: "seat" },
      ],
      services: [
        {
          key: "desk",
          label: "좌석 이용",
          durationMinutes: 60,
          resourceKind: "seat",
        },
      ],
    },
    reservations: [
      {
        id: "SG-260702-STORY1",
        threadId: "story-thread",
        displayName: "Story User",
        serviceKey: "desk",
        serviceLabel: "좌석 이용",
        resourceKey: "seat-a1",
        resourceLabel: "A1",
        startMs: now,
        endMs: now + 60 * 60 * 1000,
        timeWindow: "오늘 10:00-11:00",
        status: "confirmed",
        holdExpiresAtMs: null,
        auditHistory: [],
        internalContext: {
          operatorMemo: "Story render fixture",
          privateDecision: null,
          riskSignals: [],
          costBasisCents: null,
        },
        createdAtMs: now,
        updatedAtMs: now,
      },
    ],
    escalations: [],
    events: [],
    generatedAtMs: now,
  };

  return <SeatGridView snapshot={story} />;
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", tone)}>
      <p className="font-medium text-primary/60 text-xs">{label}</p>
      <p className="mt-2 font-semibold text-3xl text-primary">{value}</p>
    </div>
  );
}

function CalendarView({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const t = useScopedI18n("dashboard");
  const board = useMemo(() => buildCalendarBoard(snapshot), [snapshot]);
  const gridTemplateColumns = `minmax(132px, 168px) repeat(${Math.max(
    board.slots.length,
    1,
  )}, minmax(118px, 1fr))`;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-2 border-border border-b p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary/70" />
            <h2 className="font-semibold text-lg text-primary">
              {t("calendarTitle")}
            </h2>
          </div>
          <p className="mt-1 text-primary/60 text-sm">
            {board.dateLabel} · {snapshot.domain.storeTimezone}
          </p>
        </div>
        <StatusLegend />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-max" style={{ gridTemplateColumns }}>
          <div
            className="grid border-border border-b"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-10 border-border border-r bg-card px-4 py-3 font-medium text-primary/60 text-xs">
              {t("resourceColumn")}
            </div>
            {board.slots.length > 0 ? (
              board.slots.map((slot) => (
                <div
                  className="border-border border-r px-3 py-3 text-center font-medium text-primary/70 text-xs"
                  key={slot}
                >
                  {slot}
                </div>
              ))
            ) : (
              <div className="px-4 py-3 text-primary/50 text-sm">
                {t("closedDay")}
              </div>
            )}
          </div>

          {snapshot.domain.resources.map((resource) => (
            <div
              className="grid min-h-24 border-border border-b last:border-b-0"
              key={resource.key}
              style={{ gridTemplateColumns }}
            >
              <div className="sticky left-0 z-10 flex flex-col justify-center border-border border-r bg-card px-4 py-3">
                <span className="font-medium text-primary text-sm">
                  {resource.label}
                </span>
                <span className="text-primary/50 text-xs">{resource.kind}</span>
              </div>
              {board.slots.map((slot) => {
                const reservation = board.visibleReservations.find(
                  (item) =>
                    item.resourceKey === resource.key &&
                    formatTime(item.startMs, snapshot.domain.storeTimezone) ===
                      slot,
                );

                return (
                  <CalendarCell
                    key={`${resource.key}-${slot}`}
                    reservation={reservation}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CalendarCell({
  reservation,
}: {
  reservation: AdminReservation | undefined;
}) {
  if (!reservation) {
    return (
      <div className="min-h-24 border-border border-r bg-background/35 p-2">
        <span className="block h-full rounded-md border border-dashed border-border/70" />
      </div>
    );
  }

  return (
    <div className="min-h-24 border-border border-r bg-background/35 p-2">
      <article
        className={cn(
          "h-full rounded-md border p-2 shadow-sm",
          statusStyles[reservation.status],
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-xs">{reservation.serviceLabel}</p>
          <span className="rounded bg-background/60 px-1.5 py-0.5 font-medium text-[10px]">
            {statusLabels[reservation.status]}
          </span>
        </div>
        <p className="mt-1 truncate text-xs">
          {reservation.displayName ?? reservation.threadId}
        </p>
        <p className="mt-1 font-mono text-[10px] opacity-75">
          {reservation.id}
        </p>
        <p className="mt-2 text-[11px] opacity-80">{reservation.timeWindow}</p>
      </article>
    </div>
  );
}

function SeatGridView({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const t = useScopedI18n("dashboard");
  const upcoming = new Map<string, AdminReservation>();

  for (const reservation of snapshot.reservations) {
    if (!visibleGridStatuses.has(reservation.status)) {
      continue;
    }
    if (!upcoming.has(reservation.resourceKey)) {
      upcoming.set(reservation.resourceKey, reservation);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-2">
        <Armchair className="h-5 w-5 text-primary/70" />
        <div>
          <h2 className="font-semibold text-lg text-primary">
            {t("seatGridTitle")}
          </h2>
          <p className="text-primary/60 text-sm">{t("seatGridDescription")}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {snapshot.domain.resources.map((resource) => {
          const reservation = upcoming.get(resource.key);

          return (
            <article
              className={cn(
                "min-h-32 rounded-lg border p-4",
                reservation
                  ? statusStyles[reservation.status]
                  : "border-border bg-background text-primary",
              )}
              key={resource.key}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">{resource.label}</p>
                <span className="text-xs opacity-70">{resource.kind}</span>
              </div>
              {reservation ? (
                <div className="mt-5 text-xs">
                  <p className="font-medium">
                    {statusLabels[reservation.status]}
                  </p>
                  <p className="mt-1">{reservation.timeWindow}</p>
                  <p className="mt-1 font-mono opacity-75">{reservation.id}</p>
                </div>
              ) : (
                <p className="mt-5 text-primary/50 text-xs">
                  {t("seatAvailable")}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EscalationQueue({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const t = useScopedI18n("dashboard");
  const resolveEscalation = useMutation(jeomwonConvex.admin.resolveEscalation);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(
    reservation: AdminReservation,
    action: AdminReservationAction,
  ) {
    setPending(`${reservation.id}:${action}`);
    setError(null);

    try {
      await resolveEscalation({
        reservationId: reservation.id,
        action,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-border border-b p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-300" />
          <h2 className="font-semibold text-lg text-primary">
            {t("escalationTitle")}
          </h2>
        </div>
        <p className="mt-1 text-primary/60 text-sm">
          {t("escalationDescription")}
        </p>
      </div>
      <div className="max-h-[610px] overflow-y-auto p-4">
        {error ? (
          <p className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-800 text-sm dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {snapshot.escalations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-primary/50 text-sm">
            {t("escalationEmpty")}
          </div>
        ) : (
          <div className="space-y-4">
            {snapshot.escalations.map((reservation) => (
              <article
                className="rounded-lg border border-border bg-background p-4"
                key={reservation.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-primary text-sm">
                      {reservation.serviceLabel}
                    </p>
                    <p className="mt-1 text-primary/60 text-xs">
                      {reservation.resourceLabel} · {reservation.timeWindow}
                    </p>
                    <p className="mt-1 font-mono text-primary/50 text-xs">
                      {reservation.id}
                    </p>
                  </div>
                  <StatusPill status={reservation.status} />
                </div>

                <div className="mt-4 rounded-md bg-secondary/70 p-3">
                  <p className="font-medium text-primary/60 text-xs">
                    {t("internalMemo")}
                  </p>
                  <p className="mt-1 text-primary text-sm">
                    {reservation.internalContext.operatorMemo ?? "-"}
                  </p>
                  <p className="mt-2 text-primary/50 text-xs">
                    {t("riskSignals")}:{" "}
                    {reservation.internalContext.riskSignals.length > 0
                      ? reservation.internalContext.riskSignals.join(", ")
                      : "-"}
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  <p className="flex items-center gap-2 font-medium text-primary/60 text-xs">
                    <History className="h-3.5 w-3.5" />
                    {t("auditHistory")}
                  </p>
                  {reservation.auditHistory.slice(-3).map((audit) => (
                    <div
                      className="rounded-md border border-border px-3 py-2 text-xs"
                      key={`${reservation.id}-${audit.atMs}-${audit.type}`}
                    >
                      <p className="font-medium text-primary">
                        {audit.type} · {audit.actor}
                      </p>
                      <p className="mt-1 text-primary/60">{audit.summary}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    className="gap-2"
                    disabled={pending !== null}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => resolve(reservation, "approveCancel")}
                  >
                    <X className="h-4 w-4" />
                    {pending === `${reservation.id}:approveCancel`
                      ? t("actionWorking")
                      : t("approveCancel")}
                  </Button>
                  <Button
                    className="gap-2"
                    disabled={pending !== null}
                    size="sm"
                    type="button"
                    onClick={() => resolve(reservation, "keepReservation")}
                  >
                    <Check className="h-4 w-4" />
                    {pending === `${reservation.id}:keepReservation`
                      ? t("actionWorking")
                      : t("keepReservation")}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AgentTimeline({
  events,
  locale,
}: {
  events: AdminChatEvent[];
  locale: string;
}) {
  const t = useScopedI18n("dashboard");

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-border border-b p-5">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary/70" />
          <h2 className="font-semibold text-lg text-primary">
            {t("timelineTitle")}
          </h2>
        </div>
        <span className="text-primary/50 text-xs">{t("realtimeLabel")}</span>
      </div>
      <div className="divide-y divide-border">
        {events.length === 0 ? (
          <div className="px-5 py-8 text-primary/50 text-sm">
            {t("timelineEmpty")}
          </div>
        ) : (
          events.slice(0, 24).map((event) => (
            <article
              className="grid gap-3 px-5 py-4 md:grid-cols-[180px_1fr_180px]"
              key={event.id}
            >
              <div>
                <p className="font-medium text-primary text-sm">
                  {event.agent}
                </p>
                <p className="mt-1 text-primary/50 text-xs">{event.type}</p>
              </div>
              <p className="min-w-0 text-primary/75 text-sm">{event.message}</p>
              <p className="flex items-center gap-2 text-primary/50 text-xs md:justify-end">
                <Clock className="h-3.5 w-3.5" />
                {formatDateTime(event.createdAtMs, locale)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function StatusLegend() {
  const statuses: ReservationStatus[] = [
    "held",
    "confirmed",
    "escalated",
    "expired",
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => (
        <StatusPill key={status} status={status} />
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: ReservationStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-medium text-xs",
        statusStyles[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

function computeStats(reservations: AdminReservation[]) {
  return {
    held: reservations.filter((reservation) => reservation.status === "held")
      .length,
    confirmed: reservations.filter(
      (reservation) => reservation.status === "confirmed",
    ).length,
    escalated: reservations.filter(
      (reservation) => reservation.status === "escalated",
    ).length,
    expired: reservations.filter(
      (reservation) => reservation.status === "expired",
    ).length,
  };
}

function buildCalendarBoard(snapshot: AdminDashboardSnapshot) {
  const anchor =
    snapshot.reservations.find((reservation) =>
      visibleGridStatuses.has(reservation.status),
    )?.startMs ??
    snapshot.reservations[0]?.startMs ??
    Date.now();
  const dateKey = formatDateKey(anchor, snapshot.domain.storeTimezone);
  const weekday = getWeekday(anchor, snapshot.domain.storeTimezone);
  const window = snapshot.domain.businessHours[weekday];
  const slots =
    "closed" in window ? [] : buildTimeSlots(window.open, window.close);
  const visibleReservations = snapshot.reservations.filter(
    (reservation) =>
      formatDateKey(reservation.startMs, snapshot.domain.storeTimezone) ===
      dateKey,
  );

  return {
    dateLabel: new Intl.DateTimeFormat(snapshot.domain.locale, {
      timeZone: snapshot.domain.storeTimezone,
      weekday: "short",
      month: "long",
      day: "numeric",
    }).format(anchor),
    slots,
    visibleReservations,
  };
}

function buildTimeSlots(open: string, close: string) {
  const slots: string[] = [];
  const start = minutesFromClock(open);
  const end = minutesFromClock(close);

  for (let minute = start; minute < end; minute += 30) {
    const hour = Math.floor(minute / 60);
    const rest = minute % 60;
    slots.push(
      `${hour.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`,
    );
  }

  return slots;
}

function minutesFromClock(clock: string) {
  const [hour, minute] = clock.split(":");

  return Number(hour) * 60 + Number(minute);
}

function formatDateKey(timestampMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestampMs);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function getWeekday(timestampMs: number, timeZone: string): WeekdayKey {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(timestampMs);

  const normalized = weekday.toLowerCase();
  if (isWeekdayKey(normalized)) {
    return normalized;
  }

  return "monday";
}

function isWeekdayKey(value: string): value is WeekdayKey {
  return [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ].includes(value);
}

function formatTime(timestampMs: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestampMs);
}

function formatDateTime(timestampMs: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestampMs);
}
