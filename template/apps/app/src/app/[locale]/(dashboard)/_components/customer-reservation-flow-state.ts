import type { CustomerReservationFlowState } from "./customer-reservation-flow-contract";

export function createIdleFlowState(
  dialog: CustomerReservationFlowState["dialog"],
): CustomerReservationFlowState {
  return {
    dialog,
    pending: false,
    error: null,
    notice: null,
  };
}
