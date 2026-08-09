import type {
  AdminCancelResult,
  AdminCustomerRescheduleArgs,
  AdminReservationRef,
  AdminReservationResult,
  AdminSessionCreateArgs,
  AdminSessionUpdateArgs,
} from "@jeomwon/backend/src/agent-contract";

export const operatorCalendarErrorCodes = [
  "operator_crud_disabled",
  "admin_forbidden",
  "slot_unavailable",
  "outside_business_hours",
  "invalid_session",
  "reservation_not_found",
] as const;

export type OperatorCalendarErrorCode =
  (typeof operatorCalendarErrorCodes)[number];

export type OperatorCalendarState = {
  readonly pending: boolean;
  readonly error: OperatorCalendarErrorCode | null;
};

export type OperatorCalendarGateway = {
  readonly createSession: (
    args: AdminSessionCreateArgs,
  ) => Promise<AdminReservationResult>;
  readonly updateSession: (
    args: AdminSessionUpdateArgs,
  ) => Promise<AdminReservationResult>;
  readonly rescheduleCustomerReservation: (
    args: AdminCustomerRescheduleArgs,
  ) => Promise<AdminReservationResult>;
  readonly deleteSession: (
    args: AdminReservationRef,
  ) => Promise<AdminCancelResult>;
};

export type OperatorCalendarController = {
  readonly getSnapshot: () => OperatorCalendarState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly clearError: () => void;
  readonly create: (args: AdminSessionCreateArgs) => Promise<void>;
  readonly updateOperator: (args: AdminSessionUpdateArgs) => Promise<void>;
  readonly rescheduleCustomer: (
    args: AdminCustomerRescheduleArgs,
  ) => Promise<void>;
  readonly cancel: (args: AdminReservationRef) => Promise<void>;
};

const initialState: OperatorCalendarState = { pending: false, error: null };

export function createOperatorCalendarController(
  gateway: OperatorCalendarGateway,
): OperatorCalendarController {
  let state = initialState;
  let inFlight: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function setState(next: OperatorCalendarState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function run(request: () => Promise<unknown>) {
    if (inFlight) return inFlight;

    setState({ pending: true, error: null });
    inFlight = request()
      .then(() => {
        setState(initialState);
      })
      .catch((error: unknown) => {
        setState({ pending: false, error: mapOperatorCalendarError(error) });
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clearError() {
      if (state.error) setState(initialState);
    },
    create: (args) => run(() => gateway.createSession(args)),
    updateOperator: (args) => run(() => gateway.updateSession(args)),
    rescheduleCustomer: (args) =>
      run(() => gateway.rescheduleCustomerReservation(args)),
    cancel: (args) => run(() => gateway.deleteSession(args)),
  };
}

export function mapOperatorCalendarError(
  caught: unknown,
): OperatorCalendarErrorCode {
  const message = caught instanceof Error ? caught.message : String(caught);
  const code = operatorCalendarErrorCodes.find((candidate) =>
    message.includes(candidate),
  );
  if (code) return code;

  if (message.includes("operator_calendar_crud_disabled")) {
    return "operator_crud_disabled";
  }
  if (
    message.includes("admin_auth_required") ||
    message.includes("admin_not_configured")
  ) {
    return "admin_forbidden";
  }
  if (message.includes("slot_conflict")) return "slot_unavailable";
  if (message.includes("slot_outside_business_hours")) {
    return "outside_business_hours";
  }
  if (message.includes("reservation_not_found")) {
    return "reservation_not_found";
  }
  return "invalid_session";
}
