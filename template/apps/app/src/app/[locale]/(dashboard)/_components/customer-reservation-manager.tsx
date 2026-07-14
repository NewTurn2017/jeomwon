"use client";

import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useState, useSyncExternalStore } from "react";
import { useScopedI18n } from "@/locales/client";
import { createCustomerReservationFlow } from "./customer-reservation-flow";
import {
  type CustomerReservationCopy,
  CustomerReservationView,
} from "./customer-reservation-view";
import { ReservationWidgetBoard } from "./reservation-widget-board";

export function CustomerReservationManager() {
  const t = useScopedI18n("dashboard");
  const convex = useConvex();
  const createHold = useMutation(jeomwonConvex.customerReservations.createHold);
  const confirmReservation = useMutation(
    jeomwonConvex.customerReservations.confirmReservation,
  );
  const rescheduleReservation = useMutation(
    jeomwonConvex.customerReservations.rescheduleReservation,
  );
  const cancelReservation = useMutation(
    jeomwonConvex.customerReservations.cancelReservation,
  );
  const snapshot = useQuery(jeomwonConvex.customerReservations.snapshot, {});
  const [flow] = useState(() =>
    createCustomerReservationFlow({
      availableSlots: (args) =>
        convex.query(jeomwonConvex.customerReservations.availableSlots, args),
      createHold,
      confirmReservation,
      rescheduleReservation,
      cancelReservation,
    }),
  );
  const state = useSyncExternalStore(
    flow.subscribe,
    flow.getState,
    flow.getState,
  );

  if (snapshot === undefined) {
    return (
      <main aria-busy="true" className="w-full px-4 py-6 sm:px-6">
        <span className="sr-only">{t("loading")}</span>
        <div className="mx-auto h-80 max-w-screen-xl animate-pulse rounded-lg border bg-card" />
      </main>
    );
  }

  const copy: CustomerReservationCopy = {
    title: t("customer.manager.title"),
    newReservation: t("customer.manager.newReservation"),
    activeTitle: t("customer.manager.activeTitle"),
    historyTitle: t("customer.manager.historyTitle"),
    empty: t("customer.manager.empty"),
    historyEmpty: t("customer.manager.historyEmpty"),
    confirm: t("customer.manager.confirm"),
    edit: t("customer.manager.edit"),
    cancel: t("customer.manager.cancel"),
    createTitle: t("customer.manager.createTitle"),
    editTitle: t("customer.manager.editTitle"),
    cancelTitle: t("customer.manager.cancelTitle"),
    service: t("customer.manager.service"),
    resource: t("customer.manager.resource"),
    allResources: t("customer.manager.allResources"),
    search: t("customer.manager.search"),
    noSlots: t("customer.manager.noSlots"),
    createHold: t("customer.manager.createHold"),
    confirmHold: t("customer.manager.confirmHold"),
    reschedule: t("customer.manager.reschedule"),
    cancelPrompt: t("customer.manager.cancelPrompt"),
    close: t("customer.manager.close"),
    pending: t("customer.manager.pending"),
    holdCreated: t("customer.manager.holdCreated"),
    expiredPrompt: t("customer.manager.expiredPrompt"),
    confirmedNotice: t("customer.manager.confirmedNotice"),
    rescheduledNotice: t("customer.manager.rescheduledNotice"),
    cancelledNotice: t("customer.manager.cancelledNotice"),
    escalatedNotice: t("customer.manager.escalatedNotice"),
    collisionError: t("customer.manager.collisionError"),
    unavailableError: t("customer.manager.unavailableError"),
    genericError: t("customer.manager.genericError"),
    status: {
      draft: t("status.draft"),
      eligible: t("status.eligible"),
      held: t("status.held"),
      confirmed: t("status.confirmed"),
      rescheduled: t("status.rescheduled"),
      waitlisted: t("status.waitlisted"),
      cancelled: t("status.cancelled"),
      expired: t("status.expired"),
      denied: t("status.denied"),
      escalated: t("status.escalated"),
    },
  };

  return (
    <main className="w-full bg-muted/40 px-4 py-6 sm:px-6 lg:py-8">
      <div className="mx-auto grid w-full max-w-screen-xl gap-6">
        <ReservationWidgetBoard snapshot={snapshot} />
        <CustomerReservationView
          copy={copy}
          flow={flow}
          snapshot={snapshot}
          state={state}
        />
      </div>
    </main>
  );
}
