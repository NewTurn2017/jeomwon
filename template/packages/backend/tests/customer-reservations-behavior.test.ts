import { describe, expect, test } from "bun:test";
import * as agentTools from "../convex/agentTools";
import * as customerReservations from "../convex/customerReservations";
import { domainConfig } from "../domain.config";
import {
  customerFixture,
  futureAllowedStart,
  setCustomerAccountsFeature,
} from "./customer-reservations-fixture";
import {
  exportedArgKeys,
  invoke,
  rejectExtraArgs,
  rejectionMessage,
} from "./customer-reservations-test-harness";

const handlers = [
  ["snapshot", customerReservations.snapshot, []],
  [
    "availableSlots",
    customerReservations.availableSlots,
    ["serviceKey", "resourceKey", "preferredStartMs", "count"],
  ],
  [
    "createHold",
    customerReservations.createHold,
    ["serviceKey", "resourceKey", "startMs"],
  ],
  [
    "confirmReservation",
    customerReservations.confirmReservation,
    ["reservationId"],
  ],
  [
    "cancelReservation",
    customerReservations.cancelReservation,
    ["reservationId"],
  ],
  [
    "rescheduleReservation",
    customerReservations.rescheduleReservation,
    ["reservationId", "serviceKey", "resourceKey", "startMs"],
  ],
] as const;

function canonicalArgs(name: (typeof handlers)[number][0]) {
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
  const startMs = futureAllowedStart(4);
  switch (name) {
    case "snapshot":
      return {};
    case "availableSlots":
      return {
        serviceKey: service.key,
        resourceKey: resource.key,
        preferredStartMs: startMs,
        count: 2,
      };
    case "createHold":
      return { serviceKey: service.key, resourceKey: resource.key, startMs };
    case "confirmReservation":
    case "cancelReservation":
      return { reservationId: "GAXX-000000-AAAAAA" };
    case "rescheduleReservation":
      return {
        reservationId: "GAXX-000000-AAAAAA",
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs,
      };
  }
}

describe("canonical customer reservation boundary", () => {
  test("feature-on rejects every deprecated reservation adapter before auth, database, or scheduler work", async () => {
    // Given
    const fixture = customerFixture();
    const restore = setCustomerAccountsFeature(true);
    const startMs = futureAllowedStart(4);
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const legacyInvocations = [
      [
        agentTools.createHold,
        {
          threadId: "attacker-controlled-thread",
          displayName: "Forged Customer Name",
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs,
          endMs: startMs + 1,
        },
      ],
      [
        agentTools.confirmReservation,
        {
          threadId: "attacker-controlled-thread",
          reservationId: "GAXX-000000-AAAAAA",
          confirmed: false,
        },
      ],
      [
        agentTools.cancelReservation,
        {
          threadId: "attacker-controlled-thread",
          reservationId: "GAXX-000000-AAAAAA",
          requestedAtMs: 0,
        },
      ],
      [
        agentTools.rescheduleReservation,
        {
          threadId: "attacker-controlled-thread",
          reservationId: "GAXX-000000-AAAAAA",
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs,
          endMs: startMs + 1,
          requestedAtMs: 0,
        },
      ],
    ] as const;

    try {
      // When
      const errors: string[] = [];
      for (const [registered, args] of legacyInvocations) {
        errors.push(
          await rejectionMessage(invoke(registered, fixture.unauth, args)),
        );
      }

      // Then
      expect(JSON.stringify(errors)).toBe(
        JSON.stringify([
          "legacy_reservation_adapter_disabled",
          "legacy_reservation_adapter_disabled",
          "legacy_reservation_adapter_disabled",
          "legacy_reservation_adapter_disabled",
        ]),
      );
      expect(JSON.stringify(fixture.db.operations)).toBe(
        JSON.stringify({ queries: 0, gets: 0, inserts: 0, patches: 0 }),
      );
      expect(fixture.unauth.scheduler.runAtCalls.length).toBe(0);
      expect(fixture.unauth.scheduler.runAfterCalls.length).toBe(0);
    } finally {
      restore();
    }
  });

  test("exports exact validators and rejects forged server-owned fields", () => {
    // Given
    const forbiddenFields = [
      "threadId",
      "endMs",
      "requestedAtMs",
      "displayName",
      "role",
      "origin",
    ];

    for (const [name, registered, expectedKeys] of handlers) {
      // When
      const keys = exportedArgKeys(registered);

      // Then
      expect(JSON.stringify(keys)).toBe(JSON.stringify(expectedKeys));
      for (const field of forbiddenFields) {
        let message = "";
        try {
          rejectExtraArgs(registered, {
            ...canonicalArgs(name),
            [field]: field === "threadId" ? "user:users:b" : "forged",
          });
        } catch (error) {
          if (!(error instanceof Error)) {
            throw error;
          }
          message = error.message;
        }
        expect(message).toBe(`extra_arg:${field}`);
      }
    }
  });

  test("all six public handlers reject an unauthenticated caller first", async () => {
    // Given
    const fixture = customerFixture();
    const restore = setCustomerAccountsFeature(true);

    try {
      for (const [name, registered] of handlers) {
        // When
        const invocation = invoke(
          registered,
          fixture.unauth,
          canonicalArgs(name),
        );

        // Then
        expect(await rejectionMessage(invocation)).toBe("auth_required");
      }
    } finally {
      restore();
    }
  });

  test("feature-off rejects all six operations before database or scheduler work", async () => {
    // Given
    const fixture = customerFixture();
    const restore = setCustomerAccountsFeature(false);

    try {
      for (const [name, registered] of handlers) {
        // When
        const error = await rejectionMessage(
          invoke(registered, fixture.customerA, canonicalArgs(name)),
        );

        // Then
        expect(error).toBe("customer_accounts_disabled");
      }
      expect(JSON.stringify(fixture.db.operations)).toBe(
        JSON.stringify({ queries: 0, gets: 0, inserts: 0, patches: 0 }),
      );
      expect(fixture.customerA.scheduler.runAtCalls.length).toBe(0);
      expect(fixture.customerA.scheduler.runAfterCalls.length).toBe(0);
    } finally {
      restore();
    }
  });
});
