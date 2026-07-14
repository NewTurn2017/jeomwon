"use client";

import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { useQuery } from "convex/react";
import { useScopedI18n } from "@/locales/client";
import { AdminWidgetBoard } from "./admin-widget-board";

/**
 * The signed-in customer's own calendar. Read-only by construction: it renders
 * the SAME `AdminWidgetBoard` the operator uses, fed `admin:customerSnapshot`
 * (never `dashboardSnapshot`). That query is customer-scoped inside Convex and
 * already strips `internalContext`, `auditHistory`, escalations, and every other
 * customer's rows, so there is nothing here for the board to leak. Booking,
 * cancelling, and rescheduling happen through the chat widget mounted by the
 * dashboard layout on this same page.
 */
export function CustomerCalendar() {
  const t = useScopedI18n("dashboard");
  const snapshot = useQuery(jeomwonConvex.admin.customerSnapshot, {});

  if (!snapshot) {
    return (
      <main className="w-full bg-muted/40 px-4 py-6 sm:px-6 lg:py-8">
        <section
          aria-busy="true"
          className="mx-auto grid w-full max-w-screen-xl gap-4"
        >
          <span className="sr-only">{t("loading")}</span>
          <div className="h-80 animate-pulse rounded-lg border border-border bg-card" />
        </section>
      </main>
    );
  }

  const isEmpty = snapshot.reservations.length === 0;

  return (
    <main className="w-full bg-muted/40 px-4 py-6 sm:px-6 lg:py-8">
      <div className="mx-auto grid w-full max-w-screen-xl gap-6">
        <AdminWidgetBoard snapshot={snapshot} />
        <p className="text-center text-muted-foreground text-sm">
          {isEmpty ? t("customer.empty") : t("customer.bookViaChat")}
        </p>
      </div>
    </main>
  );
}
