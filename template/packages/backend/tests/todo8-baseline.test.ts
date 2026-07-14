import { expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import { jeomwonConvex } from "../src/convex-refs";

test("Todo 7 preserves the legacy agent and admin public references before canonical cutover", () => {
  // Given
  const legacyWrites = [
    jeomwonConvex.agentTools.createHold,
    jeomwonConvex.agentTools.confirmReservation,
    jeomwonConvex.agentTools.cancelReservation,
    jeomwonConvex.agentTools.rescheduleReservation,
  ];
  const adminWrites = [
    jeomwonConvex.admin.rescheduleCustomerReservation,
    jeomwonConvex.admin.deleteSession,
  ];

  // When
  const legacyNames = legacyWrites.map(getFunctionName);
  const adminNames = adminWrites.map(getFunctionName);

  // Then
  expect(JSON.stringify(legacyNames)).toBe(
    JSON.stringify([
      "agentTools:createHold",
      "agentTools:confirmReservation",
      "agentTools:cancelReservation",
      "agentTools:rescheduleReservation",
    ]),
  );
  expect(JSON.stringify(adminNames)).toBe(
    JSON.stringify([
      "admin:rescheduleCustomerReservation",
      "admin:deleteSession",
    ]),
  );
});
