import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as customerReservations from "../convex/customerReservations";
import {
  getVerifiedCustomerRecipient,
  resolveVerifiedCustomerRecipient,
} from "../convex/engine/customerRecipient";
import { backfillVerifiedCustomerReservationOwners } from "../convex/migrations";
import { domainConfig } from "../domain.config";
import {
  customerFixture,
  futureAllowedStart,
  setCustomerAccountsFeature,
} from "./customer-reservations-fixture";
import {
  exportedArgKeys,
  invoke,
  objectField,
  rejectionMessage,
  sortedObjectKeys,
} from "./customer-reservations-test-harness";

function expectEqual(actual: unknown, expected: unknown) {
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
}

function registeredHandler(registered: unknown) {
  const value = Reflect.get(Object(registered), "_handler");
  if (typeof value !== "function")
    throw new Error("registered_handler_missing");
  return value as (
    ctx: unknown,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

function setup() {
  const service = domainConfig.services[0];
  if (!service) throw new Error("test_service_missing");
  const resource = domainConfig.resources.find(
    (candidate) => candidate.kind === service.resourceKind,
  );
  if (!resource) throw new Error("test_resource_missing");
  return { service, resource };
}

describe("private verified-customer recipient foundation", () => {
  test("canonical hold captures an immutable owner while public shapes exclude recipient data", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const fixture = customerFixture();
      const { service, resource } = setup();
      Object.assign(fixture.db.tables.users[0]!, {
        isAnonymous: false,
        email: "  OWNER@Example.COM  ",
        emailVerificationTime: 1_700_000_000_000,
      });

      const hold = await invoke(
        customerReservations.createHold,
        fixture.customerA,
        {
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: futureAllowedStart(4),
        },
      );
      const reservation = fixture.db.tables.reservations[0]!;
      expect(reservation.customerUserId).toBe("users:a");
      expectEqual(
        sortedObjectKeys(objectField(hold, "publicContext")),
        [
          "displayName",
          "nextStep",
          "policySummary",
          "reservationId",
          "resourceLabel",
          "serviceLabel",
          "status",
          "timeWindow",
        ].sort(),
      );
      expect(
        JSON.stringify(hold).toLowerCase().includes("owner@example.com"),
      ).toBe(false);
      expect(JSON.stringify(hold).includes("users:a")).toBe(false);

      const reservationId = objectField(
        objectField(hold, "publicContext"),
        "reservationId",
      );
      if (typeof reservationId !== "string")
        throw new Error("reservation_id_missing");
      await invoke(customerReservations.confirmReservation, fixture.customerA, {
        reservationId,
      });
      expect(reservation.customerUserId).toBe("users:a");

      const recipient = await resolveVerifiedCustomerRecipient(
        fixture.customerA as never,
        reservation as never,
        1_700_000_000_123,
      );
      expectEqual(recipient, {
        normalizedEmail: "owner@example.com",
        provenance: "users.email",
        verifiedAtMs: 1_700_000_000_000,
        resolvedAtMs: 1_700_000_000_123,
      });
      expectEqual(exportedArgKeys(getVerifiedCustomerRecipient), [
        "reservationId",
      ]);
      const privateBoundary = await invoke(
        getVerifiedCustomerRecipient,
        fixture.customerA,
        { reservationId: reservation._id },
      );
      expect(objectField(privateBoundary, "normalizedEmail")).toBe(
        "owner@example.com",
      );
      expect(objectField(privateBoundary, "provenance")).toBe("users.email");
    } finally {
      restore();
    }
  });

  test("mismatched immutable owner is indistinguishable from a missing reservation", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const fixture = customerFixture();
      const { service, resource } = setup();
      const startMs = futureAllowedStart(4);
      fixture.db.seed("reservations", "reservations:mismatch", {
        domainKey: domainConfig.domainKey,
        threadId: "user:users:a",
        reservationNumber: "OWNER-MISMATCH",
        customerUserId: "users:b",
        displayName: null,
        serviceKey: service.key,
        serviceLabel: service.label,
        resourceKey: resource.key,
        resourceLabel: resource.label,
        startMs,
        endMs: startMs + 60 * 60 * 1000,
        status: "held",
        holdExpiresAtMs: Date.now() + 60_000,
        origin: "customer",
        auditHistory: [],
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });

      expect(
        await rejectionMessage(
          invoke(customerReservations.confirmReservation, fixture.customerA, {
            reservationId: "OWNER-MISMATCH",
          }),
        ),
      ).toBe("reservation_not_found");
      expect(fixture.db.tables.reservations[0]?.status).toBe("held");
      expect(fixture.db.tables.reservations[0]?.customerUserId).toBe("users:b");
      expect(
        await resolveVerifiedCustomerRecipient(
          fixture.customerA as never,
          fixture.db.tables.reservations[0] as never,
          10,
        ),
      ).toBe(null);
    } finally {
      restore();
    }
  });

  test("recipient resolution fails closed for anonymous, unverified, blank, deleted, and stale links", async () => {
    const fixture = customerFixture();
    const reservation = {
      _id: "reservations:recipient",
      origin: "customer",
      threadId: "user:users:a",
      customerUserId: "users:a",
    };
    const user = fixture.db.tables.users[0]!;
    Object.assign(user, {
      isAnonymous: false,
      email: "person@example.com",
      emailVerificationTime: 5,
    });
    expect(
      (await resolveVerifiedCustomerRecipient(
        fixture.customerA as never,
        reservation as never,
        10,
      )) === null,
    ).toBe(false);

    for (const malformed of [
      {
        isAnonymous: true,
        email: "person@example.com",
        emailVerificationTime: 5,
      },
      {
        isAnonymous: false,
        email: "person@example.com",
        emailVerificationTime: undefined,
      },
      { isAnonymous: false, email: "   ", emailVerificationTime: 5 },
      {
        isAnonymous: false,
        email: "person@example.com",
        emailVerificationTime: Number.NaN,
      },
    ]) {
      Object.assign(user, malformed);
      expect(
        await resolveVerifiedCustomerRecipient(
          fixture.customerA as never,
          reservation as never,
          10,
        ),
      ).toBe(null);
    }
    Object.assign(user, {
      isAnonymous: false,
      email: "person@example.com",
      emailVerificationTime: 5,
    });
    expect(
      await resolveVerifiedCustomerRecipient(
        fixture.customerA as never,
        { ...reservation, customerUserId: undefined } as never,
        10,
      ),
    ).toBe(null);
    expect(
      await resolveVerifiedCustomerRecipient(
        fixture.customerA as never,
        { ...reservation, threadId: "deleted:PUBLIC-1" } as never,
        10,
      ),
    ).toBe(null);
  });

  test("internal legacy backfill is verified-only, guarded, ownership-preserving, and idempotent", async () => {
    const fixture = customerFixture();
    const { service, resource } = setup();
    const user = fixture.db.tables.users[0]!;
    Object.assign(user, {
      isAnonymous: false,
      email: " Legacy@Example.COM ",
      emailVerificationTime: 20,
    });
    const base = {
      domainKey: domainConfig.domainKey,
      displayName: null,
      serviceKey: service.key,
      serviceLabel: service.label,
      resourceKey: resource.key,
      resourceLabel: resource.label,
      startMs: 100,
      endMs: 200,
      status: "confirmed",
      holdExpiresAtMs: null,
      auditHistory: [],
      createdAtMs: 1,
      updatedAtMs: 1,
    };
    fixture.db.seed("reservations", "reservations:legacy", {
      ...base,
      threadId: "user:users:a",
      reservationNumber: "LEGACY-OWNER",
      origin: "customer",
    });
    fixture.db.seed("reservations", "reservations:operator", {
      ...base,
      threadId: "user:users:a",
      reservationNumber: "OPERATOR-ROW",
      origin: "operator",
    });
    fixture.db.seed("reservations", "reservations:foreign", {
      ...base,
      threadId: "user:users:a",
      reservationNumber: "FOREIGN-LINK",
      origin: "customer",
      customerUserId: "users:b",
    });

    const run = () =>
      registeredHandler(backfillVerifiedCustomerReservationOwners)(
        fixture.customerA,
        { userId: "users:a" },
      );
    expectEqual(await run(), { scanned: 3, linked: 1, skipped: 2 });
    expect(fixture.db.tables.reservations[0]?.customerUserId).toBe("users:a");
    expect(fixture.db.tables.reservations[1]?.customerUserId).toBe(undefined);
    expect(fixture.db.tables.reservations[2]?.customerUserId).toBe("users:b");
    expectEqual(await run(), { scanned: 3, linked: 0, skipped: 3 });

    Object.assign(user, { emailVerificationTime: undefined });
    expectEqual(await run(), { scanned: 0, linked: 0, skipped: 0 });
    expectEqual(
      await registeredHandler(backfillVerifiedCustomerReservationOwners)(
        fixture.customerA,
        { userId: "users:missing" },
      ),
      { scanned: 0, linked: 0, skipped: 0 },
    );
  });

  test("backfill fails closed before writes when a legacy thread exceeds its guard", async () => {
    const fixture = customerFixture();
    Object.assign(fixture.db.tables.users[0]!, {
      isAnonymous: false,
      email: "verified@example.com",
      emailVerificationTime: 20,
    });
    for (let index = 0; index < 257; index += 1) {
      fixture.db.seed("reservations", `reservations:overflow:${index}`, {
        domainKey: domainConfig.domainKey,
        threadId: "user:users:a",
        reservationNumber: `OVERFLOW-${index}`,
        origin: "customer",
      });
    }

    expect(
      await rejectionMessage(
        registeredHandler(backfillVerifiedCustomerReservationOwners)(
          fixture.customerA,
          { userId: "users:a" },
        ),
      ),
    ).toBe("recipient_backfill_limit_exceeded");
    expect(
      fixture.db.tables.reservations.every(
        (reservation) => reservation.customerUserId === undefined,
      ),
    ).toBe(true);
  });

  test("schema keeps owner linkage indexed and recipient data out of reservation/public validators", () => {
    const schema = readFileSync(
      new URL("../convex/schema.ts", import.meta.url),
      "utf8",
    );
    const reservationSection = schema.slice(
      schema.indexOf("reservations: defineTable"),
      schema.indexOf("chatThreads: defineTable"),
    );
    const publicContextSection = schema.slice(
      schema.indexOf("const publicContext"),
      schema.indexOf("const publicSlot"),
    );

    expect(
      reservationSection.includes('customerUserId: v.optional(v.id("users"))'),
    ).toBe(true);
    expect(
      reservationSection.includes(
        '.index("by_customer_user", ["customerUserId"])',
      ),
    ).toBe(true);
    expect(/recipientEmail|customerEmail/.test(reservationSection)).toBe(false);
    expect(/email|customerUserId|recipient/i.test(publicContextSection)).toBe(
      false,
    );
  });
});
