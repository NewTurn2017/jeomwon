import { describe, expect, test } from "bun:test";
import * as customerReservations from "../convex/customerReservations";
import { domainConfig } from "../domain.config";
import {
  customerFixture,
  futureAllowedStart,
  setCustomerAccountsFeature,
} from "./customer-reservations-fixture";
import {
  arrayItem,
  arrayLength,
  exportedArgKeys,
  invoke,
  objectField,
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

describe("customer reservation display name", () => {
  test("preserves ownership, thread derivation, and public shapes", async () => {
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
      const publicContext = objectField(hold, "publicContext");
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
      const reservationsA = objectField(snapshotA, "reservations");

      expect(
        JSON.stringify(exportedArgKeys(customerReservations.createHold)),
      ).toBe(JSON.stringify(["serviceKey", "resourceKey", "startMs"]));
      expect(objectField(snapshotA, "threadId")).toBe("user:users:a");
      expect(objectField(snapshotB, "threadId")).toBe("user:users:b");
      expect(arrayLength(reservationsA)).toBe(1);
      expect(arrayLength(objectField(snapshotB, "reservations"))).toBe(0);
      expect(JSON.stringify(sortedObjectKeys(publicContext))).toBe(
        JSON.stringify(
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
        ),
      );
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
    } finally {
      restore();
    }
  });

  test("prefers the explicitly collected username over trusted auth name", async () => {
    const cases = [
      { username: "Owner", name: "OAuth", expected: "Owner" },
      { username: "  ", name: "OAuth", expected: "OAuth" },
      { username: undefined, name: "Trusted", expected: "Trusted" },
      { username: undefined, name: " ", expected: null },
    ] as const;

    const restore = setCustomerAccountsFeature(true);
    try {
      for (const identity of cases) {
        const fixture = customerFixture();
        const user = fixture.db.tables.users.find(
          (candidate) => candidate._id === "users:a",
        );
        if (user === undefined) {
          throw new Error("test_user_missing");
        }
        user.name = identity.name;
        if (identity.username === undefined) {
          delete user.username;
        } else {
          user.username = identity.username;
        }

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

        expect(
          objectField(objectField(hold, "publicContext"), "displayName"),
        ).toBe(identity.expected);
      }
    } finally {
      restore();
    }
  });
});
