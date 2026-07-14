import { describe, expect, test } from "bun:test";
import { expireHold } from "../convex/agentTools";
import * as customerReservations from "../convex/customerReservations";
import { publicReservationId } from "../convex/engine/customerReservationPublicId";
import { domainConfig } from "../domain.config";
import {
  customerFixture,
  futureAllowedStart,
  setCustomerAccountsFeature,
} from "./customer-reservations-fixture";
import {
  arrayItem,
  arrayLength,
  invoke,
  objectField,
  rejectionMessage,
  sortedObjectKeys,
} from "./customer-reservations-test-harness";

function reservationSetup() {
  const service = domainConfig.services[0];
  if (service === undefined) {
    throw new Error("test_service_missing");
  }
  const resource = domainConfig.resources.find(
    (candidate) => candidate.kind === service.resourceKind,
  );
  if (resource === undefined) {
    throw new Error("test_resource_missing");
  }
  return { service, resource };
}

describe("canonical customer reservation ownership and lifecycle", () => {
  test("legacy public ids are stable wide digests without raw-id suffix collisions", () => {
    const sharedSuffix = "a1b2c3d4";
    const first = publicReservationId({
      _id: `j571legacy-first-${sharedSuffix}`,
      reservationNumber: undefined,
    } as never);
    const second = publicReservationId({
      _id: `j571legacy-second-${sharedSuffix}`,
      reservationNumber: undefined,
    } as never);

    expect(first).toMatch(/^LEGACY-[A-F0-9]{32}$/);
    expect(second).toMatch(/^LEGACY-[A-F0-9]{32}$/);
    expect(first === second).toBe(false);
    expect(first.includes(sharedSuffix.toUpperCase())).toBe(false);
    expect(second.includes(sharedSuffix.toUpperCase())).toBe(false);
    expect(
      publicReservationId({
        _id: `j571legacy-first-${sharedSuffix}`,
        reservationNumber: undefined,
      } as never),
    ).toBe(first);
  });

  test("customers cannot mutate same-thread operator-origin rows by public number", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const { service, resource } = reservationSetup();
      for (const action of ["confirm", "cancel", "reschedule"] as const) {
        const fixture = customerFixture();
        const startMs = futureAllowedStart(4);
        const reservationId = `OPERATOR-${action.toUpperCase()}`;
        fixture.db.seed(
          "reservations",
          `reservations:operator-origin-${action}`,
          {
            domainKey: domainConfig.domainKey,
            threadId: "user:users:a",
            reservationNumber: reservationId,
            displayName: "Internal operator block",
            serviceKey: service.key,
            serviceLabel: service.label,
            resourceKey: resource.key,
            resourceLabel: resource.label,
            startMs,
            endMs: startMs + 60 * 60 * 1000,
            status: action === "reschedule" ? "confirmed" : "held",
            holdExpiresAtMs:
              action === "reschedule" ? null : Date.now() + 10 * 60 * 1000,
            origin: "operator",
            auditHistory: [],
            createdAtMs: Date.now() - 60 * 1000,
            updatedAtMs: Date.now() - 60 * 1000,
          },
        );

        const snapshotA = await invoke(
          customerReservations.snapshot,
          fixture.customerA,
          {},
        );
        const snapshotB = await invoke(
          customerReservations.snapshot,
          fixture.customerB,
          {},
        );
        expect(arrayLength(objectField(snapshotA, "reservations"))).toBe(0);
        expect(arrayLength(objectField(snapshotB, "reservations"))).toBe(0);

        const state = () =>
          JSON.stringify({
            reservations: fixture.db.tables.reservations,
            chatThreads: fixture.db.tables.chatThreads,
            chatEvents: fixture.db.tables.chatEvents,
            inserts: fixture.db.operations.inserts,
            patches: fixture.db.operations.patches,
            schedulerA: {
              runAt: fixture.customerA.scheduler.runAtCalls,
              runAfter: fixture.customerA.scheduler.runAfterCalls,
            },
            schedulerB: {
              runAt: fixture.customerB.scheduler.runAtCalls,
              runAfter: fixture.customerB.scheduler.runAfterCalls,
            },
          });
        const before = state();
        const invokeAction = (customer: typeof fixture.customerA) => {
          if (action === "confirm") {
            return invoke(customerReservations.confirmReservation, customer, {
              reservationId,
            });
          }
          if (action === "cancel") {
            return invoke(customerReservations.cancelReservation, customer, {
              reservationId,
            });
          }
          return invoke(customerReservations.rescheduleReservation, customer, {
            reservationId,
            serviceKey: service.key,
            resourceKey: resource.key,
            startMs: futureAllowedStart(6),
          });
        };

        const ownerError = await rejectionMessage(
          invokeAction(fixture.customerA),
        );
        const foreignError = await rejectionMessage(
          invokeAction(fixture.customerB),
        );
        expect(ownerError).toBe("reservation_not_found");
        expect(foreignError).toBe(ownerError);
        expect(state()).toBe(before);
      }
    } finally {
      restore();
    }
  });

  test("a legacy snapshot id drives owner lifecycle actions while remaining hidden from another customer", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const fixture = customerFixture();
      const { service, resource } = reservationSetup();
      const startMs = futureAllowedStart(4);
      fixture.db.seed("reservations", "j571legacyownerrow00000000a1b2c3d4", {
        domainKey: domainConfig.domainKey,
        threadId: "user:users:a",
        displayName: "Legacy Customer",
        serviceKey: service.key,
        serviceLabel: service.label,
        resourceKey: resource.key,
        resourceLabel: resource.label,
        startMs,
        endMs: startMs + 60 * 60 * 1000,
        status: "held",
        holdExpiresAtMs: Date.now() + 10 * 60 * 1000,
        auditHistory: [],
        createdAtMs: Date.now() - 60 * 1000,
        updatedAtMs: Date.now() - 60 * 1000,
      });

      const snapshot = await invoke(
        customerReservations.snapshot,
        fixture.customerA,
        {},
      );
      const reservations = objectField(snapshot, "reservations");
      const reservationId = objectField(arrayItem(reservations, 0), "id");
      if (typeof reservationId !== "string") {
        throw new Error("legacy_public_id_missing");
      }
      expect(reservationId.startsWith("LEGACY-")).toBe(true);
      expect(reservationId.includes("reservations:")).toBe(false);

      for (const write of [
        invoke(customerReservations.confirmReservation, fixture.customerB, {
          reservationId,
        }),
        invoke(customerReservations.cancelReservation, fixture.customerB, {
          reservationId,
        }),
        invoke(customerReservations.rescheduleReservation, fixture.customerB, {
          reservationId,
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: futureAllowedStart(6),
        }),
      ]) {
        expect(await rejectionMessage(write)).toBe("reservation_not_found");
      }

      const confirmed = await invoke(
        customerReservations.confirmReservation,
        fixture.customerA,
        { reservationId },
      );
      expect(
        objectField(objectField(confirmed, "publicContext"), "reservationId"),
      ).toBe(reservationId);
      const rescheduled = await invoke(
        customerReservations.rescheduleReservation,
        fixture.customerA,
        {
          reservationId,
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: futureAllowedStart(6),
        },
      );
      expect(
        objectField(objectField(rescheduled, "publicContext"), "reservationId"),
      ).toBe(reservationId);
      const cancelled = await invoke(
        customerReservations.cancelReservation,
        fixture.customerA,
        { reservationId },
      );

      expect(objectField(cancelled, "escalated")).toBe(false);
      expect(
        objectField(objectField(cancelled, "publicContext"), "reservationId"),
      ).toBe(reservationId);
      expect(
        objectField(objectField(cancelled, "publicContext"), "status"),
      ).toBe("cancelled");
      expect(fixture.db.tables.reservations[0]?.status).toBe("cancelled");
    } finally {
      restore();
    }
  });

  test("anonymous near-term held cancellation is final, releases once, and expiry replay is inert", async () => {
    const restoreAccounts = setCustomerAccountsFeature(true);
    const previousWaitlist = domainConfig.features.waitlist;
    const originalNow = Date.now;
    domainConfig.features.waitlist = true;
    try {
      const fixture = customerFixture();
      const { service, resource } = reservationSetup();
      const startMs = futureAllowedStart(4);
      const endMs = startMs + 90 * 60 * 1000;
      const serverNow =
        startMs -
        (domainConfig.policies.cancelWindowHours * 60 * 60 * 1000) / 2;
      Date.now = () => serverNow;
      const hold = await invoke(
        customerReservations.createHold,
        fixture.customerA,
        {
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs,
        },
      );
      const reservationId = objectField(
        objectField(hold, "publicContext"),
        "reservationId",
      );
      if (typeof reservationId !== "string") {
        throw new Error("reservation_id_missing");
      }
      fixture.db.seed("reservations", "reservations:near-term-waiter", {
        domainKey: domainConfig.domainKey,
        threadId: "thread:near-term-waiter",
        reservationNumber: "WAIT-NEAR-TERM",
        displayName: null,
        serviceKey: service.key,
        serviceLabel: service.label,
        resourceKey: resource.key,
        resourceLabel: resource.label,
        startMs,
        endMs,
        status: "waitlisted",
        holdExpiresAtMs: null,
        origin: "customer",
        auditHistory: [],
        createdAtMs: serverNow,
        updatedAtMs: serverNow,
      });

      const cancelled = await invoke(
        customerReservations.cancelReservation,
        fixture.customerA,
        { reservationId },
      );
      const owner = fixture.db.tables.reservations[0];
      const waiter = fixture.db.tables.reservations[1];
      if (owner === undefined || waiter === undefined) {
        throw new Error("reservation_fixture_missing");
      }
      expect(objectField(cancelled, "escalated")).toBe(false);
      expect(
        objectField(objectField(cancelled, "publicContext"), "status"),
      ).toBe("cancelled");
      expect(owner.status).toBe("cancelled");
      expect(owner.holdExpiresAtMs).toBe(null);
      expect(
        fixture.db.tables.chatEvents.filter(
          (event) => event.type === "waitlist.slotOpened",
        ).length,
      ).toBe(1);
      expect(
        JSON.stringify(
          (waiter.auditHistory as Array<{ type: string }>).map(
            (event) => event.type,
          ),
        ),
      ).toBe(JSON.stringify(["waitlist.notified"]));

      const effectsAfterCancel = {
        audits: (owner.auditHistory as unknown[]).length,
        chats: fixture.db.tables.chatEvents.length,
        emails: fixture.customerA.scheduler.runAfterCalls.length,
        waitlistAudits: (waiter.auditHistory as unknown[]).length,
      };
      expect(
        await rejectionMessage(
          invoke(customerReservations.cancelReservation, fixture.customerA, {
            reservationId,
          }),
        ),
      ).toBe("reservation_not_actionable");
      await invoke(expireHold, fixture.customerA, {
        reservationId: owner._id,
      });
      expect(owner.status).toBe("cancelled");
      expect(
        JSON.stringify({
          audits: (owner.auditHistory as unknown[]).length,
          chats: fixture.db.tables.chatEvents.length,
          emails: fixture.customerA.scheduler.runAfterCalls.length,
          waitlistAudits: (waiter.auditHistory as unknown[]).length,
        }),
      ).toBe(JSON.stringify(effectsAfterCancel));
    } finally {
      Date.now = originalNow;
      domainConfig.features.waitlist = previousWaitlist;
      restoreAccounts();
    }
  });

  test("customer B sees no A rows and every A reservation write is hidden", async () => {
    // Given
    const restore = setCustomerAccountsFeature(true);
    try {
      const fixture = customerFixture();
      const { service, resource } = reservationSetup();
      const hold = await invoke(
        customerReservations.createHold,
        fixture.customerA,
        {
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: futureAllowedStart(4),
        },
      );
      const reservationId = objectField(
        objectField(hold, "publicContext"),
        "reservationId",
      );
      if (typeof reservationId !== "string") {
        throw new Error("reservation_id_missing");
      }
      await invoke(customerReservations.confirmReservation, fixture.customerA, {
        reservationId,
      });

      // When
      const snapshotA = await invoke(
        customerReservations.snapshot,
        fixture.customerA,
        {},
      );
      const snapshotB = await invoke(
        customerReservations.snapshot,
        fixture.customerB,
        {},
      );
      const foreignWrites = [
        invoke(customerReservations.confirmReservation, fixture.customerB, {
          reservationId,
        }),
        invoke(customerReservations.cancelReservation, fixture.customerB, {
          reservationId,
        }),
        invoke(customerReservations.rescheduleReservation, fixture.customerB, {
          reservationId,
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: futureAllowedStart(6),
        }),
      ];

      // Then
      expect(objectField(snapshotA, "threadId")).toBe("user:users:a");
      const reservationsA = objectField(snapshotA, "reservations");
      expect(arrayLength(reservationsA)).toBe(1);
      expect(arrayLength(objectField(snapshotB, "reservations"))).toBe(0);
      expect(
        JSON.stringify(sortedObjectKeys(arrayItem(reservationsA, 0))),
      ).toBe(
        JSON.stringify(
          [
            "createdAtMs",
            "displayName",
            "endMs",
            "holdExpiresAtMs",
            "id",
            "resourceKey",
            "resourceLabel",
            "serviceKey",
            "serviceLabel",
            "startMs",
            "status",
            "timeWindow",
            "updatedAtMs",
          ].sort(),
        ),
      );
      const foreignErrors: string[] = [];
      for (const write of foreignWrites) {
        const error = await rejectionMessage(write);
        foreignErrors.push(error);
        expect(error).toBe("reservation_not_found");
      }
      console.log(
        `MANUAL_QA_OWNERSHIP=${JSON.stringify({
          aThreadId: objectField(snapshotA, "threadId"),
          aRows: arrayLength(reservationsA),
          bRows: arrayLength(objectField(snapshotB, "reservations")),
          bForeignWriteErrors: foreignErrors,
        })}`,
      );
    } finally {
      restore();
    }
  });

  test("own lifecycle returns public shapes and rejects a stale confirmation", async () => {
    // Given
    const restore = setCustomerAccountsFeature(true);
    try {
      const fixture = customerFixture();
      const { service, resource } = reservationSetup();
      const availability = await invoke(
        customerReservations.availableSlots,
        fixture.customerA,
        {
          serviceKey: service.key,
          resourceKey: resource.key,
          preferredStartMs: futureAllowedStart(4),
          count: 1,
        },
      );
      const slots = objectField(availability, "slots");
      const selectedStartMs = objectField(arrayItem(slots, 0), "startMs");
      if (typeof selectedStartMs !== "number") {
        throw new Error("available_slot_missing");
      }
      const hold = await invoke(
        customerReservations.createHold,
        fixture.customerA,
        {
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: selectedStartMs,
        },
      );
      const reservationId = objectField(
        objectField(hold, "publicContext"),
        "reservationId",
      );
      if (typeof reservationId !== "string") {
        throw new Error("reservation_id_missing");
      }

      // When
      const confirmed = await invoke(
        customerReservations.confirmReservation,
        fixture.customerA,
        { reservationId },
      );
      const rescheduled = await invoke(
        customerReservations.rescheduleReservation,
        fixture.customerA,
        {
          reservationId,
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: futureAllowedStart(6),
        },
      );
      const cancelled = await invoke(
        customerReservations.cancelReservation,
        fixture.customerA,
        { reservationId },
      );

      // Then
      expect(objectField(confirmed, "publicContext") === null).toBe(false);
      expect(objectField(rescheduled, "publicContext") === null).toBe(false);
      expect(objectField(cancelled, "escalated")).toBe(false);
      expect(
        await rejectionMessage(
          invoke(customerReservations.confirmReservation, fixture.customerA, {
            reservationId,
          }),
        ),
      ).toBe("reservation_not_actionable");
      console.log(
        `MANUAL_QA_CUSTOMER_LIFECYCLE=${JSON.stringify({
          availableSlots: arrayLength(slots),
          created: objectField(objectField(hold, "publicContext"), "status"),
          confirmed: objectField(
            objectField(confirmed, "publicContext"),
            "status",
          ),
          rescheduled: objectField(
            objectField(rescheduled, "publicContext"),
            "status",
          ),
          cancelled: objectField(
            objectField(cancelled, "publicContext"),
            "status",
          ),
        })}`,
      );
    } finally {
      restore();
    }
  });
});
