import { describe, expect, test } from "bun:test";
import { normalizeCustomerReservationError } from "./customer-reservation-errors";

describe("customer reservation error boundary", () => {
  test("Given backend and malformed result errors When normalized Then only customer-safe recovery codes remain", () => {
    const cases = [
      ["reservation_collision", "collision"],
      ["slot_conflict", "collision"],
      ["slot_not_available", "collision"],
      ["hold_expired", "hold_expired"],
      ["reservation_not_actionable", "reservation_not_actionable"],
      ["service_not_found", "service_not_found"],
      ["resource_not_found", "resource_not_found"],
      ["malformed_hold_result", "malformed_hold_result"],
    ] as const;

    for (const [message, expected] of cases) {
      expect(normalizeCustomerReservationError(new Error(message))).toBe(
        expected,
      );
    }
  });

  test("Given an unknown thrown value When normalized Then no internal detail is exposed", () => {
    expect(normalizeCustomerReservationError({ secret: "internal" })).toBe(
      "action_failed",
    );
    expect(
      normalizeCustomerReservationError(new Error("database secret")),
    ).toBe("action_failed");
  });
});
