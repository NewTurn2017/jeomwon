import { describe, expect, test } from "bun:test";
import * as admin from "../convex/admin";
import { serviceEndMs } from "../convex/engine/availability";
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

function fixture() {
  const base = customerFixture();
  const service = domainConfig.services[0];
  if (!service) throw new Error("test_service_missing");
  const resource = domainConfig.resources.find(
    (candidate) => candidate.kind === service.resourceKind,
  );
  if (!resource) throw new Error("test_resource_missing");
  base.db.seed("users", "users:operator-calendar", {
    name: "Operator",
    email: "operator@example.com",
    isAnonymous: false,
  });
  return {
    ...base,
    operator: testContext(base.db, "users:operator-calendar"),
    service,
    resource,
  };
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

function enable() {
  const previousEmails = process.env.JEOMWON_ADMIN_EMAILS;
  const previousFeature = domainConfig.features.operatorCalendarCrud;
  process.env.JEOMWON_ADMIN_EMAILS = "operator@example.com";
  domainConfig.features.operatorCalendarCrud = true;
  return () => {
    domainConfig.features.operatorCalendarCrud = previousFeature;
    if (previousEmails === undefined) delete process.env.JEOMWON_ADMIN_EMAILS;
    else process.env.JEOMWON_ADMIN_EMAILS = previousEmails;
  };
}

describe("operator calendar backend boundary", () => {
  test("authorized create succeeds and stamps an operator-owned reservation", async () => {
    const value = fixture();
    const restore = enable();
    try {
      const created = await invoke(admin.createSession, value.operator, {
        title: " Team block ",
        serviceKey: value.service.key,
        resourceKey: value.resource.key,
        ...storeWallClock(futureAllowedStart(6)),
      });
      const reservation = objectField(created, "reservation");
      expect(objectField(reservation, "origin")).toBe("operator");
      expect(objectField(reservation, "displayName")).toBe("Team block");
      expect(objectField(reservation, "status")).toBe("confirmed");
    } finally {
      restore();
    }
  });

  test("non-operator is denied before a write", async () => {
    const value = fixture();
    const restore = enable();
    const before = value.db.tables.reservations.length;
    try {
      expect(
        await rejectionMessage(
          invoke(admin.createSession, value.customerA, {
            title: "Forbidden block",
            serviceKey: value.service.key,
            resourceKey: value.resource.key,
            ...storeWallClock(futureAllowedStart(6)),
          }),
        ),
      ).toBe("admin_forbidden");
      expect(value.db.tables.reservations.length).toBe(before);
    } finally {
      restore();
    }
  });

  test("collision is rejected by Convex without changing the existing row", async () => {
    const value = fixture();
    const restore = enable();
    const startMs = futureAllowedStart(6);
    value.db.seed("reservations", "reservations:occupied", {
      domainKey: domainConfig.domainKey,
      threadId: "occupied",
      reservationNumber: "OCCUPIED-1",
      displayName: "Existing customer",
      serviceKey: value.service.key,
      serviceLabel: value.service.label,
      resourceKey: value.resource.key,
      resourceLabel: value.resource.label,
      startMs,
      endMs: serviceEndMs(value.service, startMs),
      status: "confirmed",
      holdExpiresAtMs: null,
      origin: "customer",
      auditHistory: [],
      createdAtMs: 1,
      updatedAtMs: 1,
    });
    const before = JSON.stringify(value.db.tables.reservations);
    try {
      expect(
        await rejectionMessage(
          invoke(admin.createSession, value.operator, {
            title: "Conflicting block",
            serviceKey: value.service.key,
            resourceKey: value.resource.key,
            ...storeWallClock(startMs),
          }),
        ),
      ).toBe("slot_conflict");
      expect(JSON.stringify(value.db.tables.reservations)).toBe(before);
    } finally {
      restore();
    }
  });
});
