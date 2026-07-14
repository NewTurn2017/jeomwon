import { describe, expect, test } from "bun:test";
import type {
  CustomerReservation,
  PublicContext,
  PublicSlot,
} from "@jeomwon/backend/src/agent-contract";
import { retryExpiredHold } from "./customer-reservation-dialogs";
import {
  type CustomerReservationGateway,
  createCustomerReservationFlow,
} from "./customer-reservation-flow";
import { customerDomainFixture } from "./customer-reservation-test-fixture";

const NOW_MS = Date.UTC(2026, 6, 15, 0, 0);
const slot: PublicSlot = {
  serviceKey: "consultation",
  serviceLabel: "Consultation",
  resourceKey: "advisor-a",
  resourceLabel: "Advisor A",
  startMs: NOW_MS + 3_600_000,
  endMs: NOW_MS + 7_200_000,
  timeWindow: "01:00–02:00",
};

describe("customer reservation runtime boundaries", () => {
  test("Given valid-shaped slots for another request or incompatible domain resource When searched Then no poisoned slot can create a hold", async () => {
    const domain = {
      ...customerDomainFixture,
      resources: [
        ...customerDomainFixture.resources,
        { key: "advisor-b", label: "Advisor B", kind: "person" as const },
      ],
    };
    const incoherentCases: ReadonlyArray<{
      readonly requestedResourceKey: string | null;
      readonly slot: PublicSlot;
    }> = [
      {
        requestedResourceKey: "advisor-a",
        slot: {
          ...slot,
          serviceKey: "another-service",
          resourceKey: "advisor-a",
        },
      },
      {
        requestedResourceKey: "advisor-a",
        slot: { ...slot, resourceKey: "advisor-b" },
      },
      {
        requestedResourceKey: null,
        slot: { ...slot, resourceKey: "room-a" },
      },
      {
        requestedResourceKey: null,
        slot: { ...slot, resourceKey: "missing-person" },
      },
    ];

    for (const incoherent of incoherentCases) {
      let holdCount = 0;
      const flow = createCustomerReservationFlow(
        gateway({
          availableSlots: async () => ({ slots: [incoherent.slot] }),
          createHold: async () => {
            holdCount += 1;
            return {
              publicContext: context("held"),
              holdExpiresAtMs: NOW_MS + 60_000,
            };
          },
        }),
      );
      flow.openCreate("consultation", incoherent.requestedResourceKey);

      await flow.searchAvailability(domain);
      const dialog = flow.getState().dialog;
      if (
        (dialog.kind === "create" || dialog.kind === "edit") &&
        dialog.slots[0]
      ) {
        flow.selectSlot(dialog.slots[0]);
      }
      await flow.createHold();

      expect(flow.getState()).toMatchObject({
        dialog: { kind: "create", slots: [], selectedSlot: null, hold: null },
        error: "action_failed",
      });
      expect(holdCount).toBe(0);
    }
  });

  test("Given availability omits slots When searched Then no malformed slot state is accepted", async () => {
    const flow = createCustomerReservationFlow(
      gateway({ availableSlots: async () => ({}) }),
    );
    flow.openCreate("consultation", null);

    await flow.searchAvailability(customerDomainFixture);

    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", slots: [], selectedSlot: null },
      error: "action_failed",
    });
  });

  test("Given availability returns a non-array slots value When searched Then it fails safely", async () => {
    const flow = createCustomerReservationFlow(
      gateway({ availableSlots: async () => ({ slots: null }) }),
    );
    flow.openCreate("consultation", null);

    await flow.searchAvailability(customerDomainFixture);

    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", slots: [] },
      error: "action_failed",
      pending: false,
    });
  });

  test("Given availability returns an invalid slot When searched Then it cannot enter selection state", async () => {
    const flow = createCustomerReservationFlow(
      gateway({
        availableSlots: async () => ({
          slots: [{ ...slot, resourceKey: "", startMs: Number.NaN }],
        }),
      }),
    );
    flow.openCreate("consultation", null);

    await flow.searchAvailability(customerDomainFixture);

    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", slots: [], selectedSlot: null },
      error: "action_failed",
    });
  });

  test("Given createHold omits a valid reservationId When held Then no confirm can follow", async () => {
    let confirmCount = 0;
    const flow = createCustomerReservationFlow(
      gateway({
        createHold: async () => ({
          publicContext: { ...context("held"), reservationId: null },
          holdExpiresAtMs: NOW_MS + 60_000,
        }),
        confirmReservation: async () => {
          confirmCount += 1;
          return { publicContext: context("confirmed") };
        },
      }),
    );
    await selectAvailableSlot(flow);

    await flow.createHold();
    await flow.confirmHold(NOW_MS);

    expect(confirmCount).toBe(0);
    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", hold: null },
      error: "malformed_hold_result",
    });
  });

  test("Given createHold has no reservationId field When held Then the malformed result cannot enable confirmation", async () => {
    let confirmCount = 0;
    const missingId = Object.fromEntries(
      Object.entries(context("held")).filter(
        ([key]) => key !== "reservationId",
      ),
    );
    const flow = createCustomerReservationFlow(
      gateway({
        createHold: async () => ({
          publicContext: missingId,
          holdExpiresAtMs: NOW_MS + 60_000,
        }),
        confirmReservation: async () => {
          confirmCount += 1;
          return { publicContext: context("confirmed") };
        },
      }),
    );
    await selectAvailableSlot(flow);

    await flow.createHold();
    await flow.confirmHold(NOW_MS);

    expect(confirmCount).toBe(0);
    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", hold: null },
      error: "malformed_hold_result",
    });
  });

  test("Given createHold returns an invalid expiry When held Then no malformed hold is stored", async () => {
    const flow = createCustomerReservationFlow(
      gateway({
        createHold: async () => ({
          publicContext: context("held"),
          holdExpiresAtMs: Number.NaN,
        }),
      }),
    );
    await selectAvailableSlot(flow);

    await flow.createHold();

    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", hold: null },
      error: "malformed_hold_result",
    });
  });

  test("Given createHold omits holdExpiresAtMs When held Then no malformed hold is stored", async () => {
    const flow = createCustomerReservationFlow(
      gateway({
        createHold: async () => ({ publicContext: context("held") }),
      }),
    );
    await selectAvailableSlot(flow);

    await flow.createHold();

    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", hold: null },
      error: "malformed_hold_result",
    });
  });

  for (const status of ["confirmed", "cancelled", "escalated"] as const) {
    test(`Given createHold returns a valid-shaped ${status} result When handled as a hold Then no hold, false success, or follow-up confirm is accepted`, async () => {
      let confirmCount = 0;
      const flow = createCustomerReservationFlow(
        gateway({
          createHold: async () => ({
            publicContext: context(status),
            holdExpiresAtMs: NOW_MS + 60_000,
          }),
          confirmReservation: async () => {
            confirmCount += 1;
            return { publicContext: context("confirmed") };
          },
        }),
      );
      await selectAvailableSlot(flow);

      await flow.createHold();
      await flow.confirmHold(NOW_MS);

      expect(confirmCount).toBe(0);
      expect(flow.getState()).toMatchObject({
        dialog: { kind: "create", hold: null },
        error: "malformed_hold_result",
        notice: null,
        pending: false,
      });
    });
  }

  test("Given confirm returns malformed publicContext When confirmed Then the dialog stays recoverable", async () => {
    const flow = createCustomerReservationFlow(
      gateway({ confirmReservation: async () => ({ publicContext: {} }) }),
    );
    await selectAvailableSlot(flow);
    await flow.createHold();

    await flow.confirmHold(NOW_MS);

    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", hold: { reservationId: "R-100" } },
      error: "action_failed",
      pending: false,
    });
  });

  test("Given confirm returns a valid-shaped non-confirmed context When confirmed Then no success state is accepted", async () => {
    const flow = createCustomerReservationFlow(
      gateway({
        confirmReservation: async () => ({ publicContext: context("held") }),
      }),
    );
    await selectAvailableSlot(flow);
    await flow.createHold();

    await flow.confirmHold(NOW_MS);

    expect(flow.getState()).toMatchObject({
      dialog: { kind: "create", hold: { reservationId: "R-100" } },
      error: "action_failed",
      notice: null,
      pending: false,
    });
  });

  test("Given reschedule returns a valid-shaped non-rescheduled context When changed Then no success state is accepted", async () => {
    const flow = createCustomerReservationFlow(
      gateway({
        rescheduleReservation: async () => ({
          publicContext: context("confirmed"),
        }),
      }),
    );
    flow.openEdit(existingReservation());
    await flow.searchAvailability(customerDomainFixture);
    flow.selectSlot(slot);

    await flow.reschedule();

    expect(flow.getState()).toMatchObject({
      dialog: {
        kind: "edit",
        reservationId: "R-100",
        selectedSlot: slot,
      },
      error: "action_failed",
      notice: null,
      pending: false,
    });
  });

  test("Given cancel omits escalated When cancelled Then no success notice or closed state is accepted", async () => {
    const flow = createCustomerReservationFlow(
      gateway({
        cancelReservation: async () => ({
          publicContext: context("cancelled"),
        }),
      }),
    );
    flow.openCancel("R-100");

    await flow.cancel();

    expect(flow.getState()).toMatchObject({
      dialog: { kind: "cancel", reservationId: "R-100" },
      error: "action_failed",
      notice: null,
      pending: false,
    });
  });

  test("Given cancel status disagrees with its escalated flag When cancelled Then no success state is accepted", async () => {
    const inconsistentResults = [
      { publicContext: context("cancelled"), escalated: true },
      { publicContext: context("escalated"), escalated: false },
    ] as const;

    for (const result of inconsistentResults) {
      const flow = createCustomerReservationFlow(
        gateway({ cancelReservation: async () => result }),
      );
      flow.openCancel("R-100");

      await flow.cancel();

      expect(flow.getState()).toMatchObject({
        dialog: { kind: "cancel", reservationId: "R-100" },
        error: "action_failed",
        notice: null,
        pending: false,
      });
    }
  });

  test("Given an expired hold When the recovery control runs Then it clears stale state and re-searches availability", async () => {
    let searchCount = 0;
    const flow = createCustomerReservationFlow(
      gateway({
        availableSlots: async () => {
          searchCount += 1;
          return { slots: [slot] };
        },
        createHold: async () => ({
          publicContext: context("held"),
          holdExpiresAtMs: NOW_MS - 1,
        }),
      }),
    );
    await selectAvailableSlot(flow);
    await flow.createHold();
    const dialog = flow.getState().dialog;
    if (dialog.kind !== "create") throw new TypeError("missing_create_dialog");

    await retryExpiredHold(flow, dialog, customerDomainFixture);

    expect(searchCount).toBe(2);
    expect(flow.getState()).toMatchObject({
      dialog: {
        kind: "create",
        hold: null,
        selectedSlot: null,
        slots: [slot],
      },
      error: null,
    });
  });
});

async function selectAvailableSlot(
  flow: ReturnType<typeof createCustomerReservationFlow>,
) {
  flow.openCreate("consultation", "advisor-a");
  await flow.searchAvailability(customerDomainFixture);
  flow.selectSlot(slot);
}

function gateway(
  overrides: Partial<CustomerReservationGateway> = {},
): CustomerReservationGateway {
  return {
    availableSlots: async () => ({ slots: [slot] }),
    createHold: async () => ({
      publicContext: context("held"),
      holdExpiresAtMs: NOW_MS + 60_000,
    }),
    confirmReservation: async () => ({
      publicContext: context("confirmed"),
    }),
    rescheduleReservation: async () => ({
      publicContext: context("rescheduled"),
    }),
    cancelReservation: async () => ({
      publicContext: context("cancelled"),
      escalated: false,
    }),
    ...overrides,
  };
}

function context(status: PublicContext["status"]): PublicContext {
  return {
    displayName: null,
    reservationId: "R-100",
    serviceLabel: "Consultation",
    resourceLabel: "Room A",
    timeWindow: "01:00–02:00",
    status,
    policySummary: "",
    nextStep: "",
  };
}

function existingReservation(): CustomerReservation {
  return {
    id: "R-100",
    displayName: null,
    serviceKey: "consultation",
    serviceLabel: "Consultation",
    resourceKey: "advisor-a",
    resourceLabel: "Advisor A",
    startMs: slot.startMs,
    endMs: slot.endMs,
    timeWindow: slot.timeWindow,
    status: "confirmed",
    holdExpiresAtMs: null,
    createdAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
  };
}
