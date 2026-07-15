import { expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import { jeomwonConvex } from "../src/convex-refs";

test("PR4 exposes canonical customer writes and no legacy agent write references", () => {
  // Given
  const writeNames = [
    "createHold",
    "confirmReservation",
    "cancelReservation",
    "rescheduleReservation",
  ] as const;
  const customerWrites = [
    jeomwonConvex.customerReservations.createHold,
    jeomwonConvex.customerReservations.confirmReservation,
    jeomwonConvex.customerReservations.cancelReservation,
    jeomwonConvex.customerReservations.rescheduleReservation,
  ];
  const adminWrites = [
    jeomwonConvex.admin.rescheduleCustomerReservation,
    jeomwonConvex.admin.deleteSession,
  ];

  // When
  const customerNames = customerWrites.map(getFunctionName);
  const adminNames = adminWrites.map(getFunctionName);

  // Then
  for (const name of writeNames) {
    expect(name in jeomwonConvex.agentTools).toBe(false);
  }
  expect(JSON.stringify(customerNames)).toBe(
    JSON.stringify([
      "customerReservations:createHold",
      "customerReservations:confirmReservation",
      "customerReservations:cancelReservation",
      "customerReservations:rescheduleReservation",
    ]),
  );
  expect(JSON.stringify(adminNames)).toBe(
    JSON.stringify([
      "admin:rescheduleCustomerReservation",
      "admin:deleteSession",
    ]),
  );
});
