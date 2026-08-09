import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getFunctionName } from "convex/server";
import * as customerReservations from "../convex/customerReservations";
import { sendEmail } from "../convex/email";
import {
  executeReservationEmailDelivery,
  sendReservationEmail,
} from "../convex/email/reservationActions";
import {
  completeReservationEmailDelivery,
  invalidateReservationEmailDelivery,
  prepareReservationEmailDelivery,
  scheduleReservationEmail,
} from "../convex/reservationEmailScheduler";
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
  sortedObjectKeys,
} from "./customer-reservations-test-harness";

function registeredHandler(registered: unknown) {
  const value = Reflect.get(Object(registered), "_handler");
  if (typeof value !== "function")
    throw new Error("registered_handler_missing");
  return value as (
    ctx: unknown,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

function expectEqual(actual: unknown, expected: unknown) {
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
}

function reservationSetup() {
  const service = domainConfig.services[0];
  if (!service) throw new Error("test_service_missing");
  const resource = domainConfig.resources.find(
    (candidate) => candidate.kind === service.resourceKind,
  );
  if (!resource) throw new Error("test_resource_missing");
  return { service, resource };
}

function actionContext(fixture: ReturnType<typeof customerFixture>) {
  const mutationContext = fixture.customerA;
  return {
    runQuery: async (reference: unknown, args: unknown) => {
      const name = getFunctionName(reference as never);
      if (name !== "reservationEmailScheduler:prepareReservationEmailDelivery")
        throw new Error(`unexpected_query:${name}`);
      return await registeredHandler(prepareReservationEmailDelivery)(
        mutationContext,
        args as Record<string, unknown>,
      );
    },
    runMutation: async (reference: unknown, args: unknown) => {
      const name = getFunctionName(reference as never);
      const target =
        name === "reservationEmailScheduler:completeReservationEmailDelivery"
          ? completeReservationEmailDelivery
          : name ===
              "reservationEmailScheduler:invalidateReservationEmailDelivery"
            ? invalidateReservationEmailDelivery
            : null;
      if (!target) throw new Error(`unexpected_mutation:${name}`);
      return await registeredHandler(target)(
        mutationContext,
        args as Record<string, unknown>,
      );
    },
  };
}

function capturedEvents(fixture: ReturnType<typeof customerFixture>) {
  return fixture.db.tables.chatEvents.filter(
    (event) => event.type === "email.captured" || event.type === "email.sent",
  );
}

async function executeAll(
  fixture: ReturnType<typeof customerFixture>,
  mode: "capture" | "sent" = "capture",
  send: (input: { idempotencyKey: string }) => Promise<void> = async () => {},
) {
  const deliveries = fixture.db.tables.reservationEmailDeliveries.slice();
  for (const delivery of deliveries) {
    await executeReservationEmailDelivery(
      actionContext(fixture) as never,
      { deliveryId: delivery._id as never },
      {
        mode,
        render: async () => ({
          subject: "private subject",
          summary: "private summary",
          html: "<p>private</p>",
          text: "private",
        }),
        send,
      },
    );
  }
}

async function createConfirmedVerifiedFixture() {
  const fixture = customerFixture();
  Object.assign(fixture.db.tables.users[0]!, {
    isAnonymous: false,
    email: " Verified@Example.COM ",
    emailVerificationTime: 1_700_000_000_000,
  });
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
  if (typeof reservationId !== "string")
    throw new Error("reservation_id_missing");
  await invoke(customerReservations.confirmReservation, fixture.customerA, {
    reservationId,
  });
  return { fixture, reservationId };
}

describe("reservation email delivery ledger", () => {
  test("schema declares the exact delivery key and reservation indexes", () => {
    const schema = readFileSync(
      new URL("../convex/schema.ts", import.meta.url),
      "utf8",
    );
    const deliverySection = schema.slice(
      schema.indexOf("reservationEmailDeliveries: defineTable"),
      schema.indexOf("chatThreads: defineTable"),
    );
    for (const field of [
      "reservationId",
      "audience",
      "template",
      "generation",
      "status",
      "idempotencyKey",
      "eventRecorded",
    ]) {
      expect(deliverySection.includes(`${field}:`)).toBe(true);
    }
    expect(deliverySection.includes('.index("by_reservation",')).toBe(true);
    expect(
      deliverySection.includes(
        '.index("by_reservation_audience_template_generation",',
      ),
    ).toBe(true);
    expect(
      /emailAddress|recipientEmail|customerEmail/.test(deliverySection),
    ).toBe(false);
  });

  test("verified-dual-audience creates two unique intents and exact private scheduler args/public events", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const { fixture, reservationId } = await createConfirmedVerifiedFixture();
      expect(fixture.db.tables.reservationEmailDeliveries.length).toBe(2);
      expect(
        new Set(
          fixture.db.tables.reservationEmailDeliveries.map(
            (delivery) => delivery.idempotencyKey,
          ),
        ).size,
      ).toBe(2);
      expectEqual(
        fixture.db.tables.reservationEmailDeliveries
          .map((delivery) => delivery.audience)
          .sort(),
        ["customer", "operator"],
      );
      expect(fixture.customerA.scheduler.runAfterCalls.length).toBe(2);
      for (const call of fixture.customerA.scheduler.runAfterCalls)
        expectEqual(sortedObjectKeys(call.args), ["deliveryId"]);
      expectEqual(exportedArgKeys(sendReservationEmail), ["deliveryId"]);

      await executeAll(fixture);
      await executeAll(fixture);
      const events = capturedEvents(fixture);
      expect(events.length).toBe(2);
      for (const event of events) {
        expectEqual(sortedObjectKeys(event.publicPayload), [
          "audience",
          "mode",
          "reservationId",
          "template",
        ]);
        expect(objectField(event.publicPayload, "reservationId")).toBe(
          reservationId,
        );
        expect(
          /@|users:|subject|summary|html|text|provider/i.test(
            JSON.stringify(event.publicPayload),
          ),
        ).toBe(false);
      }
      expect(
        fixture.db.tables.reservationEmailDeliveries.every(
          (delivery) =>
            delivery.status === "completed" && delivery.eventRecorded === true,
        ),
      ).toBe(true);
    } finally {
      restore();
    }
  });

  test("confirmed, rescheduled, cancelled, and escalated intents dedupe by audience/template/generation", async () => {
    const fixture = customerFixture();
    Object.assign(fixture.db.tables.users[0]!, {
      isAnonymous: false,
      email: "verified@example.com",
      emailVerificationTime: 10,
    });
    const { service, resource } = reservationSetup();
    const statusByKind = {
      "reservation.confirmed": "confirmed",
      "reservation.rescheduled": "rescheduled",
      "reservation.cancelled": "cancelled",
      "reservation.escalated": "escalated",
    } as const;
    for (const [index, kind] of Object.keys(statusByKind).entries()) {
      const reservationId = `reservations:path:${index}`;
      fixture.db.seed("reservations", reservationId, {
        domainKey: domainConfig.domainKey,
        threadId: "user:users:a",
        customerUserId: "users:a",
        reservationNumber: `PATH-${index}`,
        displayName: null,
        serviceKey: service.key,
        serviceLabel: service.label,
        resourceKey: resource.key,
        resourceLabel: resource.label,
        startMs: 100,
        endMs: 200,
        status: statusByKind[kind as keyof typeof statusByKind],
        holdExpiresAtMs: null,
        origin: "customer",
        auditHistory: [{ type: kind }],
        createdAtMs: 1,
        updatedAtMs: 2,
      });
      await scheduleReservationEmail(fixture.customerA as never, {
        kind: kind as keyof typeof statusByKind,
        reservationId: reservationId as never,
      });
      await scheduleReservationEmail(fixture.customerA as never, {
        kind: kind as keyof typeof statusByKind,
        reservationId: reservationId as never,
      });
    }
    expect(fixture.db.tables.reservationEmailDeliveries.length).toBe(8);
    expect(fixture.customerA.scheduler.runAfterCalls.length).toBe(8);
    expect(
      new Set(
        fixture.db.tables.reservationEmailDeliveries.map(
          (row) =>
            `${row.reservationId}:${row.audience}:${row.template}:${row.generation}`,
        ),
      ).size,
    ).toBe(8);
  });

  test("unverified creates and completes only the preserved operator delivery", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const fixture = customerFixture();
      Object.assign(fixture.db.tables.users[0]!, {
        isAnonymous: false,
        email: "unverified@example.com",
        emailVerificationTime: undefined,
      });
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
      await invoke(customerReservations.confirmReservation, fixture.customerA, {
        reservationId: objectField(
          objectField(hold, "publicContext"),
          "reservationId",
        ) as string,
      });
      expect(fixture.db.tables.reservationEmailDeliveries.length).toBe(1);
      expect(fixture.db.tables.reservationEmailDeliveries[0]?.audience).toBe(
        "operator",
      );
      await executeAll(fixture);
      expect(capturedEvents(fixture).length).toBe(1);
      expect(
        objectField(capturedEvents(fixture)[0]?.publicPayload, "audience"),
      ).toBe("operator");
    } finally {
      restore();
    }
  });

  test("deleted-link invalidates the pending customer action without a customer event", async () => {
    const { fixture } = await createConfirmedVerifiedFixture();
    const reservation = fixture.db.tables.reservations[0]!;
    reservation.customerUserId = undefined;
    reservation.threadId = "deleted:PUBLIC-1";

    await executeAll(fixture);
    expect(
      capturedEvents(fixture).filter(
        (event) => objectField(event.publicPayload, "audience") === "customer",
      ).length,
    ).toBe(0);
    const customer = fixture.db.tables.reservationEmailDeliveries.find(
      (delivery) => delivery.audience === "customer",
    );
    expect(customer?.status).toBe("invalidated");
    expect(customer?.eventRecorded).toBe(false);
  });

  test("stale-generation invalidates an old reschedule job without a customer event", async () => {
    const { fixture, reservationId } = await createConfirmedVerifiedFixture();
    const { service, resource } = reservationSetup();
    await invoke(
      customerReservations.rescheduleReservation,
      fixture.customerA,
      {
        reservationId,
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs: futureAllowedStart(6),
      },
    );
    const firstCustomer = fixture.db.tables.reservationEmailDeliveries.find(
      (delivery) =>
        delivery.audience === "customer" &&
        delivery.template === "reservation.rescheduled" &&
        delivery.generation === 1,
    );
    if (!firstCustomer) throw new Error("first_generation_missing");
    await invoke(
      customerReservations.rescheduleReservation,
      fixture.customerA,
      {
        reservationId,
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs: futureAllowedStart(8),
      },
    );

    await executeReservationEmailDelivery(
      actionContext(fixture) as never,
      { deliveryId: firstCustomer._id as never },
      {
        mode: "capture",
        render: async () => ({
          subject: "private",
          summary: "private",
          html: "private",
          text: "private",
        }),
        send: async () => {},
      },
    );
    expect(firstCustomer.status).toBe("invalidated");
    expect(
      capturedEvents(fixture).filter(
        (event) => objectField(event.publicPayload, "audience") === "customer",
      ).length,
    ).toBe(0);
  });

  test("provider request carries the persisted key only in its idempotency header", async () => {
    const originalFetch = globalThis.fetch;
    let capturedIdempotencyHeader = "";
    let capturedBody = "";
    globalThis.fetch = (async (_input, init) => {
      capturedIdempotencyHeader =
        new Headers(init?.headers).get("Idempotency-Key") ?? "";
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: "provider-message" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      await sendEmail({
        to: "private@example.com",
        subject: "private",
        html: "private",
        text: "private",
        idempotencyKey: "stable-private-key",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(capturedIdempotencyHeader).toBe("stable-private-key");
    expect(capturedBody.includes("stable-private-key")).toBe(false);
  });

  test("crash-after-provider-accept retries one stable provider key and records one sent event", async () => {
    const { fixture } = await createConfirmedVerifiedFixture();
    const customer = fixture.db.tables.reservationEmailDeliveries.find(
      (delivery) => delivery.audience === "customer",
    );
    if (!customer) throw new Error("customer_delivery_missing");
    const acceptedKeys = new Set<string>();
    let crash = true;
    const send = async (input: { idempotencyKey: string }) => {
      acceptedKeys.add(input.idempotencyKey);
      if (crash) {
        crash = false;
        throw new Error("crash_after_provider_accept");
      }
    };
    const execute = () =>
      executeReservationEmailDelivery(
        actionContext(fixture) as never,
        { deliveryId: customer._id as never },
        {
          mode: "sent",
          render: async () => ({
            subject: "private",
            summary: "private",
            html: "private",
            text: "private",
          }),
          send,
        },
      );

    try {
      await execute();
      throw new Error("expected_crash");
    } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).toBe(
        "crash_after_provider_accept",
      );
    }
    expect(customer.status).toBe("pending");
    await execute();
    await execute();
    expect(acceptedKeys.size).toBe(1);
    expect(
      capturedEvents(fixture).filter(
        (event) => objectField(event.publicPayload, "audience") === "customer",
      ).length,
    ).toBe(1);
    expect(customer.status).toBe("completed");
    expect(customer.eventRecorded).toBe(true);
  });
});
