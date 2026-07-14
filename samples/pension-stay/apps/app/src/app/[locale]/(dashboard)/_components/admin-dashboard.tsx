"use client";

import type {
  AdminChatEvent,
  AdminDashboardSnapshot,
  AdminReservation,
  AdminReservationAction,
  ReservationStatus,
} from "@pension-stay/backend/src/agent-contract";
import { jeomwonConvex } from "@pension-stay/backend/src/convex-refs";
import { Button } from "@pension-stay/ui/button";
import { cn } from "@pension-stay/ui/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  Check,
  ClipboardList,
  Clock,
  History,
  ReceiptText,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { useScopedI18n } from "@/locales/client";
import { AdminWidgetBoard } from "./admin-widget-board";

type ReservationNumberValue = string | number | null | undefined;
type ReservationWithDisplayNumber = AdminReservation & {
  publicReservationNumber?: ReservationNumberValue;
  publicReservationId?: ReservationNumberValue;
  reservationNumber?: ReservationNumberValue;
  displayReservationNumber?: ReservationNumberValue;
};

const statusStyles = {
  draft: "border-border bg-muted text-muted-foreground",
  eligible: "border-primary/30 bg-primary/10 text-primary",
  held: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  confirmed: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  rescheduled: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  waitlisted: "border-chart-4/30 bg-chart-4/10 text-chart-4",
  cancelled: "border-border bg-secondary text-secondary-foreground",
  expired: "border-border bg-muted text-muted-foreground",
  denied: "border-destructive/30 bg-destructive/10 text-destructive",
  escalated: "border-destructive/40 bg-destructive/10 text-destructive",
} satisfies Record<ReservationStatus, string>;

export function AdminDashboard() {
  const t = useScopedI18n("dashboard");
  const snapshot = useQuery(jeomwonConvex.admin.dashboardSnapshot, {});

  if (!snapshot) {
    return (
      <main className="w-full bg-muted/40 px-4 py-6 sm:px-6 lg:py-8">
        <section
          aria-busy="true"
          className="mx-auto grid w-full max-w-screen-xl gap-4"
        >
          <span className="sr-only">{t("loading")}</span>
          <div className="h-56 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-80 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-56 animate-pulse rounded-lg border border-border bg-card" />
        </section>
      </main>
    );
  }

  return (
    <main className="w-full bg-muted/40 px-4 py-6 sm:px-6 lg:py-8">
      <div className="mx-auto grid w-full max-w-screen-xl gap-6">
        <EscalationQueue snapshot={snapshot} />
        <AdminWidgetBoard snapshot={snapshot} />
        <ReservationsPanel snapshot={snapshot} />
        <AgentTimeline
          events={snapshot.events}
          locale={snapshot.domain.locale}
        />
      </div>
    </main>
  );
}

function ReservationsPanel({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const t = useScopedI18n("dashboard");
  const reservations = [...snapshot.reservations].sort(
    (current, next) => current.startMs - next.startMs,
  );
  const stats = computeStats(reservations);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="grid gap-5 border-border border-b p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ClipboardList aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-card-foreground text-lg">
              {t("reservationsTitle")}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("reservationsDescription")}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ReservationMetric label={t("statsHeld")} value={stats.held} />
          <ReservationMetric
            label={t("statsConfirmed")}
            value={stats.confirmed}
          />
          <ReservationMetric
            label={t("statsEscalated")}
            value={stats.escalated}
          />
          <ReservationMetric label={t("statsExpired")} value={stats.expired} />
        </dl>
      </div>

      {reservations.length === 0 ? (
        <div className="p-5">
          <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center text-muted-foreground text-sm">
            {t("reservationsEmpty")}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {reservations.map((reservation) => (
            <ReservationRow
              key={reservation.id}
              locale={snapshot.domain.locale}
              reservation={reservation}
              timeZone={snapshot.domain.storeTimezone}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ReservationMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-md border border-border bg-background px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground text-xl">{value}</dd>
    </div>
  );
}

function ReservationRow({
  locale,
  reservation,
  timeZone,
}: {
  locale: string;
  reservation: AdminReservation;
  timeZone: string;
}) {
  const t = useScopedI18n("dashboard");
  const displayNumber = getDisplayReservationNumber(reservation);
  const holdExpiresAt = reservation.holdExpiresAtMs
    ? formatDateTime(reservation.holdExpiresAtMs, locale, timeZone)
    : null;

  return (
    <article className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.7fr)_minmax(170px,0.6fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={reservation.status} />
          {displayNumber ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 font-medium text-muted-foreground text-xs">
              <ReceiptText aria-hidden="true" className="h-3.5 w-3.5" />
              {displayNumber}
            </span>
          ) : null}
        </div>
        <h3 className="mt-3 truncate font-semibold text-card-foreground">
          {reservation.serviceLabel}
        </h3>
        <p className="mt-1 flex min-w-0 items-center gap-2 text-muted-foreground text-sm">
          <UserRound aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {reservation.displayName ?? t("unknownCustomer")}
          </span>
        </p>
      </div>

      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">{reservation.timeWindow}</p>
        <p className="mt-1 text-muted-foreground">
          {formatDateTime(reservation.startMs, locale, timeZone)}
        </p>
      </div>

      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">
          {reservation.resourceLabel}
        </p>
        <p className="mt-1 text-muted-foreground">{t("assignedResource")}</p>
      </div>

      <div className="text-sm lg:text-right">
        <p className="text-muted-foreground">{t("updatedAt")}</p>
        <p className="mt-1 font-medium text-foreground">
          {formatDateTime(reservation.updatedAtMs, locale, timeZone)}
        </p>
        {holdExpiresAt ? (
          <p className="mt-1 text-chart-3 text-xs">
            {t("holdExpiresAt")} {holdExpiresAt}
          </p>
        ) : null}
      </div>
    </article>
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
      setError(caught instanceof Error ? caught.message : t("actionFailed"));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="grid gap-3 border-border border-b p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <ShieldAlert aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-card-foreground text-lg">
              {t("escalationTitle")}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("escalationDescription")}
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-border bg-background px-3 py-1 font-medium text-muted-foreground text-sm">
          {t("waitingCount", { count: snapshot.escalations.length })}
        </span>
      </div>
      <div className="p-5">
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          >
            {error}
          </p>
        ) : null}

        {snapshot.escalations.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center text-muted-foreground text-sm">
            {t("escalationEmpty")}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {snapshot.escalations.map((reservation) => {
              const displayNumber = getDisplayReservationNumber(reservation);

              return (
                <article
                  className="rounded-lg border border-border bg-background p-4"
                  key={reservation.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {reservation.serviceLabel}
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {reservation.resourceLabel} · {reservation.timeWindow}
                      </p>
                      {displayNumber ? (
                        <p className="mt-1 text-muted-foreground text-xs">
                          {displayNumber}
                        </p>
                      ) : null}
                    </div>
                    <StatusPill status={reservation.status} />
                  </div>

                  <div className="mt-4 rounded-md bg-muted/60 p-3">
                    <p className="font-medium text-muted-foreground text-xs">
                      {t("internalMemo")}
                    </p>
                    <p className="mt-1 text-foreground text-sm">
                      {reservation.internalContext.operatorMemo ?? t("noMemo")}
                    </p>
                    <p className="mt-2 text-muted-foreground text-xs">
                      {t("riskSignals")}:{" "}
                      {reservation.internalContext.riskSignals.length > 0
                        ? reservation.internalContext.riskSignals.join(", ")
                        : t("noRiskSignals")}
                    </p>
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
                      <History className="h-3.5 w-3.5" />
                      {t("auditHistory")}
                    </p>
                    {reservation.auditHistory.length > 0 ? (
                      reservation.auditHistory.slice(-3).map((audit) => (
                        <div
                          className="rounded-md border border-border bg-card px-3 py-2 text-xs"
                          key={`${reservation.id}-${audit.atMs}-${audit.type}`}
                        >
                          <p className="font-medium text-foreground">
                            {audit.type} · {audit.actor}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {audit.summary}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-dashed border-border px-3 py-2 text-muted-foreground text-xs">
                        {t("auditHistoryEmpty")}
                      </p>
                    )}
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
              );
            })}
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
      <div className="flex items-start justify-between gap-3 border-border border-b p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Activity aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-card-foreground text-lg">
              {t("timelineTitle")}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("timelineDescription")}
            </p>
          </div>
        </div>
        <span className="hidden rounded-full border border-border bg-background px-3 py-1 text-muted-foreground text-xs sm:inline-flex">
          {t("realtimeLabel")}
        </span>
      </div>
      <div className="divide-y divide-border">
        {events.length === 0 ? (
          <div className="px-5 py-8 text-muted-foreground text-sm">
            {t("timelineEmpty")}
          </div>
        ) : (
          events.slice(0, 24).map((event) => (
            <article
              className="grid gap-3 px-5 py-4 md:grid-cols-[180px_1fr_180px]"
              key={event.id}
            >
              <div>
                <p className="font-medium text-foreground text-sm">
                  {t(`agent.${event.agent}`)}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {event.type}
                </p>
              </div>
              <p className="min-w-0 text-foreground/80 text-sm">
                {event.message}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground text-xs md:justify-end">
                <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                {formatDateTime(event.createdAtMs, locale)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function StatusPill({ status }: { status: ReservationStatus }) {
  const t = useScopedI18n("dashboard");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-medium text-xs",
        statusStyles[status],
      )}
    >
      {t(`status.${status}`)}
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

function getDisplayReservationNumber(reservation: AdminReservation) {
  const displayableReservation: ReservationWithDisplayNumber = reservation;
  const displayNumber =
    displayableReservation.publicReservationNumber ??
    displayableReservation.publicReservationId ??
    displayableReservation.reservationNumber ??
    displayableReservation.displayReservationNumber;

  if (displayNumber === null || displayNumber === undefined) {
    return null;
  }

  return String(displayNumber);
}

function formatDateTime(
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
