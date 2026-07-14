import { describe, expect, test } from "bun:test";
import type {
  CustomerReservation,
  ReservationStatus,
} from "@jeomwon/backend/src/agent-contract";
import {
  type CustomerReservationGateway,
  createCustomerReservationFlow,
} from "./customer-reservation-flow";
import { customerDomainFixture } from "./customer-reservation-test-fixture";

const NOW_MS = Date.UTC(2026, 6, 15, 0, 0);

describe("customer reservation create flow", () => {
  test("Given a selected available slot When a hold is created Then confirmation is explicit and uses canonical args", async () => {
    const calls: CustomerCreateCalls = { holds: [], confirms: [] };
    const slot = availableSlot();
    const flow = createCustomerReservationFlow(gatewayForCreate(calls, slot));
    flow.openCreate("consultation", "advisor-a");
    await flow.searchAvailability(customerDomainFixture);
    flow.selectSlot(slot);

    await flow.createHold();

    expect(calls.holds).toEqual([
      {
        serviceKey: "consultation",
        resourceKey: "advisor-a",
        startMs: slot.startMs,
      },
    ]);
    expect(calls.confirms).toEqual([]);
    expect(flow.getState().dialog).toMatchObject({
      kind: "create",
      hold: { reservationId: "R-100", expiresAtMs: NOW_MS + 60_000 },
    });
  });

  test("Given a live hold When confirmation is double-clicked Then the mutation runs once", async () => {
    const calls: CustomerCreateCalls = { holds: [], confirms: [] };
    const slot = availableSlot();
    const flow = createCustomerReservationFlow(gatewayForCreate(calls, slot));
    flow.openCreate("consultation", "advisor-a");
    await flow.searchAvailability(customerDomainFixture);
    flow.selectSlot(slot);
    await flow.createHold();

    await Promise.all([flow.confirmHold(NOW_MS), flow.confirmHold(NOW_MS)]);

    expect(calls.confirms).toEqual([{ reservationId: "R-100" }]);
    expect(flow.getState()).toMatchObject({
      dialog: { kind: "closed" },
      notice: "confirmed",
      pending: false,
    });
  });

  test("Given an expired hold When confirmation is attempted Then it prompts a new search without a mutation", async () => {
    const calls: CustomerCreateCalls = { holds: [], confirms: [] };
    const slot = availableSlot();
    const flow = createCustomerReservationFlow(gatewayForCreate(calls, slot));
    flow.openCreate("consultation", "advisor-a");
    await flow.searchAvailability(customerDomainFixture);
    flow.selectSlot(slot);
    await flow.createHold();

    await flow.confirmHold(NOW_MS + 60_000);

    expect(calls.confirms).toEqual([]);
    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", hold: null, slots: [] },
      error: "hold_expired",
    });
  });

  test("Given the server expires a hold after the client check When confirmation rejects Then the dialog recovers as hold-expired", async () => {
    const calls: CustomerCreateCalls = { holds: [], confirms: [] };
    const slot = availableSlot();
    const base = gatewayForCreate(calls, slot);
    const flow = createCustomerReservationFlow({
      ...base,
      confirmReservation: async () => {
        throw new Error("reservation_not_actionable");
      },
    });
    flow.openCreate("consultation", "advisor-a");
    await flow.searchAvailability(customerDomainFixture);
    flow.selectSlot(slot);
    await flow.createHold();

    await flow.confirmHold(NOW_MS);

    expect(flow.getState()).toMatchObject({
      dialog: {
        kind: "create",
        hold: null,
        slots: [],
        selectedSlot: null,
      },
      error: "hold_expired",
      notice: null,
    });
  });

  test("Given a collision response When availability is searched Then no write runs and a safe recovery error is exposed", async () => {
    const calls: CustomerCreateCalls = { holds: [], confirms: [] };
    const base = gatewayForCreate(calls, availableSlot());
    const flow = createCustomerReservationFlow({
      ...base,
      availableSlots: async () => {
        throw new Error("reservation_collision");
      },
    });
    flow.openCreate("consultation", "advisor-a");

    await flow.searchAvailability(customerDomainFixture);

    expect(calls.holds).toEqual([]);
    expect(flow.getState()).toMatchObject({
      error: "collision",
      pending: false,
    });
  });
});

describe("customer reservation edit and cancel flows", () => {
  test("Given an existing reservation When edit opens Then its current service and resource seed availability", () => {
    const flow = createCustomerReservationFlow(
      gatewayForCreate({ holds: [], confirms: [] }, availableSlot()),
    );

    flow.openEdit(reservation("confirmed"));

    expect(flow.getState().dialog).toMatchObject({
      kind: "edit",
      reservationId: "reservation-confirmed",
      serviceKey: "consultation",
      resourceKey: "advisor-a",
      preferredStartMs: NOW_MS + 3_600_000,
    });
  });

  test("Given a newly selected edit slot When reschedule is double-clicked Then canonical mutation args are sent once", async () => {
    const slot = availableSlot();
    const reschedules: Array<{
      readonly reservationId: string;
      readonly serviceKey: string;
      readonly resourceKey: string;
      readonly startMs: number;
    }> = [];
    const base = gatewayForCreate({ holds: [], confirms: [] }, slot);
    const flow = createCustomerReservationFlow({
      ...base,
      rescheduleReservation: async (args) => {
        reschedules.push(args);
        return {
          publicContext: publicContext("rescheduled", args.reservationId),
        };
      },
    });
    flow.openEdit(reservation("confirmed"));
    await flow.searchAvailability(customerDomainFixture);
    flow.selectSlot(slot);

    await Promise.all([flow.reschedule(), flow.reschedule()]);

    expect(reschedules).toEqual([
      {
        reservationId: "reservation-confirmed",
        serviceKey: "consultation",
        resourceKey: "advisor-a",
        startMs: slot.startMs,
      },
    ]);
    expect(flow.getState()).toMatchObject({
      dialog: { kind: "closed" },
      notice: "rescheduled",
    });
  });

  test("Given cancellation needs operator review When cancel is double-clicked Then one request reports escalation", async () => {
    const cancellations: Array<{ readonly reservationId: string }> = [];
    const base = gatewayForCreate({ holds: [], confirms: [] }, availableSlot());
    const flow = createCustomerReservationFlow({
      ...base,
      cancelReservation: async (args) => {
        cancellations.push(args);
        return {
          publicContext: publicContext("escalated", args.reservationId),
          escalated: true,
        };
      },
    });
    flow.openCancel("reservation-confirmed");

    await Promise.all([flow.cancel(), flow.cancel()]);

    expect(cancellations).toEqual([{ reservationId: "reservation-confirmed" }]);
    expect(flow.getState()).toMatchObject({
      dialog: { kind: "closed" },
      notice: "cancel_escalated",
    });
  });
});

type CustomerCreateCalls = {
  readonly holds: Array<{
    readonly serviceKey: string;
    readonly resourceKey: string;
    readonly startMs: number;
  }>;
  readonly confirms: Array<{ readonly reservationId: string }>;
};

function reservation(status: ReservationStatus): CustomerReservation {
  return {
    id: `reservation-${status}`,
    displayName: null,
    serviceKey: "consultation",
    serviceLabel: "Consultation",
    resourceKey: "advisor-a",
    resourceLabel: "Advisor A",
    startMs: NOW_MS + 3_600_000,
    endMs: NOW_MS + 7_200_000,
    timeWindow: "01:00–02:00",
    status,
    holdExpiresAtMs: null,
    createdAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
  };
}

function availableSlot() {
  return {
    serviceKey: "consultation",
    serviceLabel: "Consultation",
    resourceKey: "advisor-a",
    resourceLabel: "Advisor A",
    startMs: NOW_MS + 3_600_000,
    endMs: NOW_MS + 7_200_000,
    timeWindow: "01:00–02:00",
  };
}

function gatewayForCreate(
  calls: CustomerCreateCalls,
  slot: ReturnType<typeof availableSlot>,
): CustomerReservationGateway {
  return {
    availableSlots: async () => ({ slots: [slot] }),
    createHold: async (args) => {
      calls.holds.push(args);
      return {
        publicContext: publicContext("held", "R-100"),
        holdExpiresAtMs: NOW_MS + 60_000,
      };
    },
    confirmReservation: async (args) => {
      calls.confirms.push(args);
      return { publicContext: publicContext("confirmed", args.reservationId) };
    },
    rescheduleReservation: async (args) => ({
      publicContext: publicContext("rescheduled", args.reservationId),
    }),
    cancelReservation: async (args) => ({
      publicContext: publicContext("cancelled", args.reservationId),
      escalated: false,
    }),
  };
}

function publicContext(status: ReservationStatus, reservationId: string) {
  return {
    displayName: null,
    reservationId,
    serviceLabel: "Consultation",
    resourceLabel: "Room A",
    timeWindow: "01:00–02:00",
    status,
    policySummary: "",
    nextStep: "",
  };
}
