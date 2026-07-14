import { describe, expect, test } from "bun:test";
import * as admin from "../convex/admin";
import * as customerReservations from "../convex/customerReservations";
import { serviceEndMs } from "../convex/engine/availability";
import {
  legacyPublicReservationLookupCap,
  publicReservationId,
} from "../convex/engine/customerReservationPublicId";
import { domainConfig } from "../domain.config";
import {
  customerFixture,
  futureAllowedStart,
} from "./customer-reservations-fixture";
import {
  invoke,
  objectField,
  rejectionMessage,
  testContext,
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

function storeWallClock(timestampMs: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: domainConfig.storeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(timestampMs)
      .map((part) => [part.type, part.value]),
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    startTime: `${parts.hour}:${parts.minute}`,
  };
}

function operatorFixture() {
  const fixture = customerFixture();
  const { service, resource } = reservationSetup();
  const startMs = futureAllowedStart(4);
  fixture.db.seed("users", "users:operator", {
    name: "Operator",
    email: "operator@example.com",
    isAnonymous: false,
  });
  fixture.db.seed("reservations", "reservations:customer", {
    domainKey: domainConfig.domainKey,
    threadId: "user:users:a",
    reservationNumber: "GAXX-260715-OPTEST",
    displayName: "Customer A",
    serviceKey: service.key,
    serviceLabel: service.label,
    resourceKey: resource.key,
    resourceLabel: resource.label,
    startMs,
    endMs: serviceEndMs(service, startMs),
    status: "confirmed",
    holdExpiresAtMs: null,
    origin: "customer",
    auditHistory: [
      {
        atMs: Date.now(),
        type: "reservation.confirmed",
        actor: "reservation",
        summary: "Confirmed fixture.",
        publicMessage: null,
      },
    ],
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  });
  return {
    ...fixture,
    operator: testContext(fixture.db, "users:operator"),
    service,
    resource,
  };
}

function makeFixtureReservationLegacy(
  fixture: ReturnType<typeof operatorFixture>,
) {
  const reservation = fixture.db.tables.reservations[0];
  if (reservation === undefined) {
    throw new Error("reservation_missing");
  }
  delete reservation.reservationNumber;
  return {
    reservation,
    reservationId: publicReservationId(reservation as never),
  };
}

function latestAuditActor(row: Record<string, unknown>): unknown {
  const history = row.auditHistory;
  if (!Array.isArray(history) || history.length === 0) {
    throw new Error("audit_history_missing");
  }
  return objectField(history[history.length - 1], "actor");
}

function enableAdminCustomerActions() {
  const previousAllowlist = process.env.JEOMWON_ADMIN_EMAILS;
  const previousFeature = domainConfig.features.operatorCalendarCrud;
  process.env.JEOMWON_ADMIN_EMAILS = "operator@example.com";
  domainConfig.features.operatorCalendarCrud = true;
  return () => {
    domainConfig.features.operatorCalendarCrud = previousFeature;
    if (previousAllowlist === undefined) {
      delete process.env.JEOMWON_ADMIN_EMAILS;
    } else {
      process.env.JEOMWON_ADMIN_EMAILS = previousAllowlist;
    }
  };
}

function enableEscalationIntegrityFeatures() {
  const restoreAdmin = enableAdminCustomerActions();
  const previousCustomerAccounts = domainConfig.features.customerAccounts;
  const previousWaitlist = domainConfig.features.waitlist;
  domainConfig.features.customerAccounts = true;
  domainConfig.features.waitlist = true;
  return () => {
    domainConfig.features.customerAccounts = previousCustomerAccounts;
    domainConfig.features.waitlist = previousWaitlist;
    restoreAdmin();
  };
}

function seedOverlappingWaitlist(
  fixture: ReturnType<typeof operatorFixture>,
  reservationNumber: string,
) {
  const reservation = fixture.db.tables.reservations[0];
  if (reservation === undefined) {
    throw new Error("reservation_missing");
  }
  fixture.db.seed("reservations", `reservations:${reservationNumber}`, {
    domainKey: domainConfig.domainKey,
    threadId: `waitlist:${reservationNumber}`,
    reservationNumber,
    displayName: "Waitlisted Customer",
    serviceKey: fixture.service.key,
    serviceLabel: fixture.service.label,
    resourceKey: fixture.resource.key,
    resourceLabel: fixture.resource.label,
    startMs: reservation.startMs,
    endMs: reservation.endMs,
    status: "waitlisted",
    holdExpiresAtMs: null,
    origin: "customer",
    auditHistory: [],
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  });
  return fixture.db.tables.reservations[1]!;
}

function waitlistNotificationCount(
  fixture: ReturnType<typeof operatorFixture>,
) {
  return fixture.db.tables.chatEvents.filter(
    (event) => event.type === "waitlist.slotOpened",
  ).length;
}

describe("admin customer reservation lifecycle", () => {
  for (const action of ["approveCancel", "keepReservation"] as const) {
    test(`legacy customer cancel escalation resolves through admin ${action} with one stable opaque id`, async () => {
      const fixture = operatorFixture();
      const restore = enableEscalationIntegrityFeatures();
      const originalNow = Date.now;
      const { reservation, reservationId } =
        makeFixtureReservationLegacy(fixture);
      Date.now = () =>
        Number(reservation.startMs) -
        (domainConfig.policies.cancelWindowHours * 60 * 60 * 1000) / 2;

      try {
        const rawSuffix = String(reservation._id).slice(-8).toUpperCase();
        expect(reservationId).toMatch(/^LEGACY-[A-F0-9]{32}$/);
        expect(reservationId.includes(rawSuffix)).toBe(false);

        const cancelled = await invoke(
          customerReservations.cancelReservation,
          fixture.customerA,
          { reservationId },
        );
        expect(objectField(cancelled, "escalated")).toBe(true);
        expect(
          objectField(objectField(cancelled, "publicContext"), "reservationId"),
        ).toBe(reservationId);

        const resolved = await invoke(
          admin.resolveEscalation,
          fixture.operator,
          { reservationId, action },
        );
        const resolvedReservation = objectField(resolved, "reservation");
        expect(objectField(resolvedReservation, "id")).toBe(reservationId);
        expect(objectField(resolvedReservation, "status")).toBe(
          action === "approveCancel" ? "cancelled" : "confirmed",
        );
      } finally {
        Date.now = originalNow;
        restore();
      }
    });
  }

  test("legacy admin reschedule and delete preserve the same opaque public id", async () => {
    const fixture = operatorFixture();
    const restore = enableAdminCustomerActions();
    const { reservationId } = makeFixtureReservationLegacy(fixture);

    try {
      const rescheduled = await invoke(
        admin.rescheduleCustomerReservation,
        fixture.operator,
        {
          reservationId,
          serviceKey: fixture.service.key,
          resourceKey: fixture.resource.key,
          ...storeWallClock(futureAllowedStart(6)),
        },
      );
      expect(objectField(objectField(rescheduled, "reservation"), "id")).toBe(
        reservationId,
      );
      expect(
        objectField(objectField(rescheduled, "reservation"), "status"),
      ).toBe("rescheduled");

      const cancelled = await invoke(admin.deleteSession, fixture.operator, {
        reservationId,
      });
      expect(objectField(objectField(cancelled, "reservation"), "id")).toBe(
        reservationId,
      );
      expect(objectField(objectField(cancelled, "reservation"), "status")).toBe(
        "cancelled",
      );
    } finally {
      restore();
    }
  });

  test("legacy admin lookup fails closed at its fixed domain scan cap", async () => {
    const fixture = operatorFixture();
    const restore = enableAdminCustomerActions();
    const { reservationId } = makeFixtureReservationLegacy(fixture);
    for (let index = 0; index < legacyPublicReservationLookupCap; index += 1) {
      fixture.db.seed("reservations", `reservations:legacy-noise-${index}`, {
        ...fixture.db.tables.reservations[0],
        threadId: `legacy-noise:${index}`,
        reservationNumber: undefined,
        status: "cancelled",
      });
    }

    try {
      expect(
        await rejectionMessage(
          invoke(admin.deleteSession, fixture.operator, { reservationId }),
        ),
      ).toBe("reservation_not_found");
      expect(
        fixture.db.queryTraces.some(
          (trace) =>
            trace.indexName === "by_domain_reservation_number" &&
            trace.filters.some(
              (filter) =>
                filter.field === "reservationNumber" &&
                filter.value === undefined,
            ) &&
            trace.rowsRead === legacyPublicReservationLookupCap + 1,
        ),
      ).toBe(true);
      expect(fixture.db.tables.reservations[0]?.status).toBe("confirmed");
    } finally {
      restore();
    }
  });

  test("escalation remains collision-active and notifies the waitlist exactly once only after approveCancel", async () => {
    // Given
    const fixture = operatorFixture();
    const restore = enableEscalationIntegrityFeatures();
    const originalNow = Date.now;
    const reservation = fixture.db.tables.reservations[0]!;
    const waitlisted = seedOverlappingWaitlist(fixture, "WAIT-APPROVE");
    Date.now = () =>
      Number(reservation.startMs) -
      (domainConfig.policies.cancelWindowHours * 60 * 60 * 1000) / 2;

    try {
      // When
      const cancellation = await invoke(admin.deleteSession, fixture.operator, {
        reservationId: "GAXX-260715-OPTEST",
      });
      const collisionError = await rejectionMessage(
        invoke(customerReservations.createHold, fixture.customerB, {
          serviceKey: fixture.service.key,
          resourceKey: fixture.resource.key,
          startMs: reservation.startMs,
        }),
      );
      const notificationsBeforeApproval = waitlistNotificationCount(fixture);
      const waitlistAuditsBeforeApproval = (
        waitlisted.auditHistory as Array<{ type: string }>
      ).length;
      await invoke(admin.resolveEscalation, fixture.operator, {
        reservationId: "GAXX-260715-OPTEST",
        action: "approveCancel",
      });
      const sideEffectsAfterApproval = {
        events: fixture.db.tables.chatEvents.length,
        emails: fixture.operator.scheduler.runAfterCalls.length,
        waitlistNotifications: waitlistNotificationCount(fixture),
      };
      const repeatedResolutionError = await rejectionMessage(
        invoke(admin.resolveEscalation, fixture.operator, {
          reservationId: "GAXX-260715-OPTEST",
          action: "approveCancel",
        }),
      );

      // Then
      expect(objectField(cancellation, "escalated")).toBe(true);
      expect(notificationsBeforeApproval).toBe(0);
      expect(waitlistAuditsBeforeApproval).toBe(0);
      expect(collisionError).toBe("slot_conflict");
      expect(fixture.customerB.scheduler.runAtCalls.length).toBe(0);
      expect(reservation.status).toBe("cancelled");
      expect(waitlistNotificationCount(fixture)).toBe(1);
      expect(
        JSON.stringify(
          (waitlisted.auditHistory as Array<{ type: string }>).map(
            (event) => event.type,
          ),
        ),
      ).toBe(JSON.stringify(["waitlist.notified"]));
      expect(repeatedResolutionError).toBe("reservation_not_escalated");
      expect(
        JSON.stringify({
          events: fixture.db.tables.chatEvents.length,
          emails: fixture.operator.scheduler.runAfterCalls.length,
          waitlistNotifications: waitlistNotificationCount(fixture),
        }),
      ).toBe(JSON.stringify(sideEffectsAfterApproval));
    } finally {
      Date.now = originalNow;
      restore();
    }
  });

  test("keepReservation leaves the escalated interval occupied without notifying the waitlist", async () => {
    // Given
    const fixture = operatorFixture();
    const restore = enableEscalationIntegrityFeatures();
    const originalNow = Date.now;
    const reservation = fixture.db.tables.reservations[0]!;
    const waitlisted = seedOverlappingWaitlist(fixture, "WAIT-KEEP");
    Date.now = () =>
      Number(reservation.startMs) -
      (domainConfig.policies.cancelWindowHours * 60 * 60 * 1000) / 2;

    try {
      // When
      await invoke(admin.deleteSession, fixture.operator, {
        reservationId: "GAXX-260715-OPTEST",
      });
      await invoke(admin.resolveEscalation, fixture.operator, {
        reservationId: "GAXX-260715-OPTEST",
        action: "keepReservation",
      });
      const collisionError = await rejectionMessage(
        invoke(customerReservations.createHold, fixture.customerB, {
          serviceKey: fixture.service.key,
          resourceKey: fixture.resource.key,
          startMs: reservation.startMs,
        }),
      );

      // Then
      expect(reservation.status).toBe("confirmed");
      expect(collisionError).toBe("slot_conflict");
      expect(fixture.customerB.scheduler.runAtCalls.length).toBe(0);
      expect(waitlistNotificationCount(fixture)).toBe(0);
      expect(JSON.stringify(waitlisted.auditHistory)).toBe(JSON.stringify([]));
    } finally {
      Date.now = originalNow;
      restore();
    }
  });

  test("admin reschedule authenticates then records the deep helper actor as operator", async () => {
    // Given
    const fixture = operatorFixture();
    const restore = enableAdminCustomerActions();

    try {
      // When
      await invoke(admin.rescheduleCustomerReservation, fixture.operator, {
        reservationId: "GAXX-260715-OPTEST",
        serviceKey: fixture.service.key,
        resourceKey: fixture.resource.key,
        ...storeWallClock(futureAllowedStart(6)),
      });

      // Then
      const row = fixture.db.tables.reservations[0];
      if (row === undefined) {
        throw new Error("reservation_missing");
      }
      expect(row.status).toBe("rescheduled");
      expect(latestAuditActor(row)).toBe("operator");
    } finally {
      restore();
    }
  });

  test("admin cancel authenticates then records the deep helper actor as operator", async () => {
    // Given
    const fixture = operatorFixture();
    const restore = enableAdminCustomerActions();

    try {
      // When
      await invoke(admin.deleteSession, fixture.operator, {
        reservationId: "GAXX-260715-OPTEST",
      });

      // Then
      const row = fixture.db.tables.reservations[0];
      if (row === undefined) {
        throw new Error("reservation_missing");
      }
      expect(row.status).toBe("cancelled");
      expect(latestAuditActor(row)).toBe("operator");
    } finally {
      restore();
    }
  });
});
