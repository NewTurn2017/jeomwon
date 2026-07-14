import { describe, expect, test } from "bun:test";
import type {
  CustomerReservation,
  ReservationStatus,
} from "@jeomwon/backend/src/agent-contract";
import {
  compatibleResourceKey,
  isHistoryStatus,
  reservationActions,
} from "./customer-reservation-controller";
import { customerDomainFixture } from "./customer-reservation-test-fixture";

const NOW_MS = Date.UTC(2026, 6, 15, 0, 0);

function reservation(
  status: ReservationStatus,
  holdExpiresAtMs: number | null = null,
): CustomerReservation {
  return {
    id: `reservation-${status}`,
    displayName: null,
    serviceKey: "consultation",
    serviceLabel: "Consultation",
    resourceKey: "room-a",
    resourceLabel: "Room A",
    startMs: NOW_MS + 3_600_000,
    endMs: NOW_MS + 7_200_000,
    timeWindow: "01:00–02:00",
    status,
    holdExpiresAtMs,
    createdAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
  };
}

describe("customer reservation action matrix", () => {
  test("Given a live hold When actions are resolved Then confirm and cancel are offered", () => {
    const actions = reservationActions(
      reservation("held", NOW_MS + 60_000),
      NOW_MS,
    );

    expect(actions).toEqual(["confirm", "cancel"]);
  });

  test("Given an expired hold When actions are resolved Then no backend-rejected action is offered", () => {
    const actions = reservationActions(reservation("held", NOW_MS - 1), NOW_MS);

    expect(actions).toEqual([]);
    expect(reservationActions(reservation("held", null), NOW_MS)).toEqual([]);
  });

  test("Given confirmed and rescheduled rows When actions are resolved Then edit and cancel are offered", () => {
    expect(reservationActions(reservation("confirmed"), NOW_MS)).toEqual([
      "edit",
      "cancel",
    ]);
    expect(reservationActions(reservation("rescheduled"), NOW_MS)).toEqual([
      "edit",
      "cancel",
    ]);
  });

  test("Given terminal rows When history is classified Then they have no actions", () => {
    const terminal: readonly ReservationStatus[] = [
      "cancelled",
      "expired",
      "denied",
    ];

    for (const status of terminal) {
      expect(isHistoryStatus(status)).toBe(true);
      expect(reservationActions(reservation(status), NOW_MS)).toEqual([]);
    }
  });

  test("Given an escalated row pending operator resolution When classified Then it stays active with no customer actions", () => {
    expect(isHistoryStatus("escalated")).toBe(false);
    expect(reservationActions(reservation("escalated"), NOW_MS)).toEqual([]);
  });
});

describe("customer reservation booking compatibility", () => {
  test("Given a selected person When service changes to a room service Then the incompatible selection resets", () => {
    const domain = {
      ...customerDomainFixture,
      services: [
        ...customerDomainFixture.services,
        {
          key: "room-rental",
          label: "상담실 예약",
          durationMinutes: 30,
          resourceKind: "room" as const,
        },
      ],
    };

    expect(compatibleResourceKey(domain, "room-rental", "advisor-a")).toBe(
      null,
    );
    expect(compatibleResourceKey(domain, "room-rental", "room-a")).toBe(
      "room-a",
    );
  });
});
