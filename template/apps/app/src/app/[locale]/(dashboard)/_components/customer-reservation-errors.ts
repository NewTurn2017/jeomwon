export type CustomerReservationErrorCode =
  | "action_failed"
  | "collision"
  | "hold_expired"
  | "malformed_hold_result"
  | "reservation_not_actionable"
  | "resource_not_found"
  | "service_not_found";

export function normalizeCustomerReservationError(
  error: unknown,
): CustomerReservationErrorCode {
  if (!(error instanceof Error)) return "action_failed";
  const message = error.message;
  if (
    message.includes("reservation_collision") ||
    message.includes("slot_not_available") ||
    message.includes("slot_conflict")
  ) {
    return "collision";
  }
  if (message.includes("hold_expired")) return "hold_expired";
  if (message.includes("reservation_not_actionable")) {
    return "reservation_not_actionable";
  }
  if (message.includes("service_not_found")) return "service_not_found";
  if (message.includes("resource_not_found")) return "resource_not_found";
  if (message.includes("malformed_hold_result")) {
    return "malformed_hold_result";
  }
  return "action_failed";
}
