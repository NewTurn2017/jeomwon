"use client";

import type {
  AdminDashboardSnapshot,
  AdminReservation,
} from "@jeomwon/backend/src/agent-contract";
import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { useMutation } from "convex/react";
import { ReceiptText, UserRound } from "lucide-react";
import { useState } from "react";
import { useScopedI18n } from "@/locales/client";
import {
  formatAdminDateTime,
  getDisplayReservationNumber,
} from "./admin-dashboard-format";
import {
  AdminNoShowAction,
  type AdminNoShowError,
  noShowErrorCode,
  useAdminNoShowSubmission,
} from "./admin-no-show";
import { adminNoShowCopy } from "./admin-no-show-copy";
import { StatusPill } from "./admin-status-pill";

export function AdminReservationsPanel({
  snapshot,
}: {
  snapshot: AdminDashboardSnapshot;
}) {
  const t = useScopedI18n("dashboard");
  const markNoShow = useMutation(jeomwonConvex.admin.markReservationNoShow);
  const submission = useAdminNoShowSubmission(markNoShow);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<{
    id: string;
    code: AdminNoShowError;
  } | null>(null);
  const reservations = [...snapshot.reservations].sort(
    (current, next) => current.startMs - next.startMs,
  );
  const stats = computeStats(reservations);

  async function confirmNoShow(reservation: AdminReservation) {
    setError(null);
    try {
      const result = await submission.submit(reservation.id);
      if (result !== null) setConfirmingId(null);
    } catch (caught) {
      setConfirmingId(null);
      setError({ id: reservation.id, code: noShowErrorCode(caught) });
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="grid gap-5 border-border border-b p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <h2 className="font-semibold text-card-foreground text-lg">
            {t("reservationsTitle")}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t("reservationsDescription")}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label={t("statsHeld")} value={stats.held} />
          <Metric label={t("statsConfirmed")} value={stats.confirmed} />
          <Metric label={t("statsEscalated")} value={stats.escalated} />
          <Metric label={t("statsExpired")} value={stats.expired} />
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
              action={
                <AdminNoShowAction
                  copy={adminNoShowCopy((key) => t(key))}
                  enabled={snapshot.domain.features.noShow}
                  error={error?.id === reservation.id ? error.code : null}
                  generatedAtMs={snapshot.generatedAtMs}
                  reservation={reservation}
                  confirming={confirmingId === reservation.id}
                  pending={submission.pending}
                  onCancel={() => {
                    if (!submission.pending) setConfirmingId(null);
                  }}
                  onConfirm={() => void confirmNoShow(reservation)}
                  onOpen={() => {
                    setError(null);
                    setConfirmingId(reservation.id);
                  }}
                />
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-md border border-border bg-background px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground text-xl">{value}</dd>
    </div>
  );
}

function ReservationRow({
  action,
  locale,
  reservation,
  timeZone,
}: {
  action: React.ReactNode;
  locale: string;
  reservation: AdminReservation;
  timeZone: string;
}) {
  const t = useScopedI18n("dashboard");
  const displayNumber = getDisplayReservationNumber(reservation);
  const holdExpiry = reservation.holdExpiresAtMs
    ? formatAdminDateTime(reservation.holdExpiresAtMs, locale, timeZone)
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
          {formatAdminDateTime(reservation.startMs, locale, timeZone)}
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
          {formatAdminDateTime(reservation.updatedAtMs, locale, timeZone)}
        </p>
        {holdExpiry ? (
          <p className="mt-1 text-chart-3 text-xs">
            {t("holdExpiresAt")} {holdExpiry}
          </p>
        ) : null}
        {action}
      </div>
    </article>
  );
}

function computeStats(reservations: AdminReservation[]) {
  return {
    held: reservations.filter(({ status }) => status === "held").length,
    confirmed: reservations.filter(({ status }) => status === "confirmed")
      .length,
    escalated: reservations.filter(({ status }) => status === "escalated")
      .length,
    expired: reservations.filter(({ status }) => status === "expired").length,
  };
}
