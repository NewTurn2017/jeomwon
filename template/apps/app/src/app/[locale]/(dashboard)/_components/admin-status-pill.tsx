"use client";

import type { ReservationStatus } from "@jeomwon/backend/src/agent-contract";
import { cn } from "@jeomwon/ui/utils";
import { useScopedI18n } from "@/locales/client";

const statusStyles = {
  draft: "border-border bg-muted text-muted-foreground",
  eligible: "border-primary/30 bg-primary/10 text-primary",
  held: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  confirmed: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  rescheduled: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  no_show: "border-border bg-muted text-muted-foreground",
  waitlisted: "border-chart-4/30 bg-chart-4/10 text-chart-4",
  cancelled: "border-border bg-secondary text-secondary-foreground",
  expired: "border-border bg-muted text-muted-foreground",
  denied: "border-destructive/30 bg-destructive/10 text-destructive",
  escalated: "border-destructive/40 bg-destructive/10 text-destructive",
} satisfies Record<ReservationStatus, string>;

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
