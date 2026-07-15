import { describe, expect, test } from "bun:test";
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
});
