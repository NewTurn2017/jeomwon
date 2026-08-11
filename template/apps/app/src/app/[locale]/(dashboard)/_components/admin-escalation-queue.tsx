"use client";

import type {
  AdminDashboardSnapshot,
  AdminReservation,
  AdminReservationAction,
} from "@jeomwon/backend/src/agent-contract";
import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { Button } from "@jeomwon/ui/button";
import { useMutation } from "convex/react";
import { Check, History, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { useScopedI18n } from "@/locales/client";
import { getDisplayReservationNumber } from "./admin-dashboard-format";
import { StatusPill } from "./admin-status-pill";

export function AdminEscalationQueue({
  snapshot,
}: {
  snapshot: AdminDashboardSnapshot;
}) {
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
      await resolveEscalation({ reservationId: reservation.id, action });
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
            className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
            role="alert"
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
            {snapshot.escalations.map((reservation) => (
              <EscalationCard
                key={reservation.id}
                reservation={reservation}
                pending={pending}
                onResolve={resolve}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EscalationCard({
  reservation,
  pending,
  onResolve,
}: {
  reservation: AdminReservation;
  pending: string | null;
  onResolve: (
    reservation: AdminReservation,
    action: AdminReservationAction,
  ) => void;
}) {
  const t = useScopedI18n("dashboard");
  const displayNumber = getDisplayReservationNumber(reservation);
  return (
    <article className="rounded-lg border border-border bg-background p-4">
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
          {reservation.internalContext.riskSignals.join(", ") ||
            t("noRiskSignals")}
        </p>
      </div>
      <div className="mt-4 space-y-2">
        <p className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
          <History className="h-3.5 w-3.5" /> {t("auditHistory")}
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
              <p className="mt-1 text-muted-foreground">{audit.summary}</p>
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
          onClick={() => onResolve(reservation, "approveCancel")}
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
          onClick={() => onResolve(reservation, "keepReservation")}
        >
          <Check className="h-4 w-4" />
          {pending === `${reservation.id}:keepReservation`
            ? t("actionWorking")
            : t("keepReservation")}
        </Button>
      </div>
    </article>
  );
}
