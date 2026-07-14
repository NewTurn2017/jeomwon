import { expect, test } from "bun:test";
import type {
  CustomerReservation,
  CustomerSnapshot,
  PublicContext,
  PublicSlot,
  ReservationStatus,
} from "@jeomwon/backend/src/agent-contract";
import { renderToStaticMarkup } from "react-dom/server";
import ko from "@/locales/ko";
import { createCustomerReservationFlow } from "./customer-reservation-flow";
import { customerDomainFixture } from "./customer-reservation-test-fixture";
import {
  type CustomerReservationCopy,
  CustomerReservationView,
} from "./customer-reservation-view";

const NOW_MS = Date.UTC(2026, 6, 15, 0, 0);
const firstSlot = slot(NOW_MS + 3_600_000);
const secondSlot = slot(NOW_MS + 86_400_000);

test("Given customer A's reactive snapshot When CRUD runs Then hold, confirm, reschedule, and escalated cancel remain customer-safe", async () => {
  let rows: readonly CustomerReservation[] = [];
  let available: readonly PublicSlot[] = [firstSlot];
  const counts = { hold: 0, confirm: 0, reschedule: 0, cancel: 0 };
  const flow = createCustomerReservationFlow({
    availableSlots: async () => ({ slots: available }),
    createHold: async () => {
      counts.hold += 1;
      rows = [reservation(firstSlot, "held", NOW_MS + 60_000)];
      return {
        publicContext: context("held"),
        holdExpiresAtMs: NOW_MS + 60_000,
      };
    },
    confirmReservation: async () => {
      counts.confirm += 1;
      rows = rows.map((row) => ({ ...row, status: "confirmed" }));
      return { publicContext: context("confirmed") };
    },
    rescheduleReservation: async () => {
      counts.reschedule += 1;
      rows = [reservation(secondSlot, "rescheduled", null)];
      return { publicContext: context("rescheduled") };
    },
    cancelReservation: async () => {
      counts.cancel += 1;
      rows = rows.map((row) => ({ ...row, status: "escalated" }));
      return { publicContext: context("escalated"), escalated: true };
    },
  });

  flow.openCreate("consultation", "advisor-a");
  await flow.searchAvailability(customerDomainFixture);
  flow.selectSlot(firstSlot);
  await flow.createHold();
  await Promise.all([flow.confirmHold(NOW_MS), flow.confirmHold(NOW_MS)]);

  available = [secondSlot];
  flow.openEdit(currentReservation(rows));
  await flow.searchAvailability(customerDomainFixture);
  flow.selectSlot(secondSlot);
  await flow.reschedule();
  flow.openCancel(currentReservation(rows).id);
  await Promise.all([flow.cancel(), flow.cancel()]);

  const html = renderToStaticMarkup(
    <CustomerReservationView
      copy={copy}
      flow={flow}
      snapshot={snapshot(rows)}
      state={flow.getState()}
    />,
  );
  expect(counts).toEqual({ hold: 1, confirm: 1, reschedule: 1, cancel: 1 });
  expect(html).toContain("취소 요청됨 · 운영자 확인 필요");
  expect(html).toContain("운영자 확인");
  expect(html).not.toContain("internalContext");
  expect(html).not.toContain("auditHistory");
});

const copy = {
  ...ko.dashboard.customer.manager,
  status: ko.dashboard.status,
} satisfies CustomerReservationCopy;

function slot(startMs: number): PublicSlot {
  return {
    serviceKey: "consultation",
    serviceLabel: "상담 예약",
    resourceKey: "advisor-a",
    resourceLabel: "상담 담당 A",
    startMs,
    endMs: startMs + 1_800_000,
    timeWindow: new Date(startMs).toISOString(),
  };
}

function reservation(
  selected: PublicSlot,
  status: ReservationStatus,
  holdExpiresAtMs: number | null,
): CustomerReservation {
  return {
    id: "A-RESERVATION",
    displayName: null,
    ...selected,
    status,
    holdExpiresAtMs,
    createdAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
  };
}

function context(status: ReservationStatus): PublicContext {
  return {
    displayName: null,
    reservationId: "A-RESERVATION",
    serviceLabel: "상담 예약",
    resourceLabel: "상담 담당 A",
    timeWindow: "customer-safe-window",
    status,
    policySummary: "",
    nextStep: "",
  };
}

function currentReservation(
  rows: readonly CustomerReservation[],
): CustomerReservation {
  const current = rows[0];
  if (current === undefined) throw new TypeError("missing_test_reservation");
  return current;
}

function snapshot(
  reservations: readonly CustomerReservation[],
): CustomerSnapshot {
  return {
    domain: customerDomainFixture,
    threadId: "customer-a-thread",
    reservations: [...reservations],
    generatedAtMs: NOW_MS,
  };
}
