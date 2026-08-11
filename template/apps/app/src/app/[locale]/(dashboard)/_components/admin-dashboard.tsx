"use client";

import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { useQuery } from "convex/react";
import { useScopedI18n } from "@/locales/client";
import { AdminAgentTimeline } from "./admin-agent-timeline";
import { AdminEscalationQueue } from "./admin-escalation-queue";
import { AdminReservationsPanel } from "./admin-reservations-panel";
import { AdminWidgetBoard } from "./admin-widget-board";
import { OperatorCalendarControls } from "./operator-calendar-controls";

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
        <AdminEscalationQueue snapshot={snapshot} />
        <AdminWidgetBoard snapshot={snapshot} />
        {snapshot.domain.adminWidget === "calendar" &&
        snapshot.domain.features.operatorCalendarCrud ? (
          <OperatorCalendarControls snapshot={snapshot} />
        ) : null}
        <AdminReservationsPanel snapshot={snapshot} />
        <AdminAgentTimeline
          events={snapshot.events}
          locale={snapshot.domain.locale}
        />
      </div>
    </main>
  );
}
