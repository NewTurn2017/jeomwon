import type {
  AdminCancelResult,
  AdminNoShowResult,
  AdminReservationRef,
  AdminReservationResult,
  AdminSessionCreateArgs,
  AdminSessionUpdateArgs,
  CustomerAvailableSlotsArgs,
  CustomerCreateHoldArgs,
  CustomerRescheduleArgs,
  CustomerReservationRef,
  CustomerSnapshot,
  PublicContext,
  PublicSlot,
  PublicThreadState,
} from "./agent-contract";

export const qaBrowserBridgeKey = "__JEOMWON_QA_CANONICAL__" as const;

export type QaManualRouteResponse =
  | { readonly kind: "redirect" }
  | { readonly kind: "response"; readonly status: number };

export function classifyQaManualRouteResponse(response: {
  readonly status: number;
  readonly type: string;
}): QaManualRouteResponse {
  if (
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400)
  ) {
    return { kind: "redirect" };
  }
  return { kind: "response", status: response.status };
}

export type QaCanonicalCall =
  | {
      readonly operation: "snapshot";
      readonly args: Record<string, never>;
    }
  | {
      readonly operation: "availableSlots";
      readonly args: CustomerAvailableSlotsArgs;
    }
  | {
      readonly operation: "createHold";
      readonly args: CustomerCreateHoldArgs;
    }
  | {
      readonly operation: "confirmReservation";
      readonly args: CustomerReservationRef;
    }
  | {
      readonly operation: "cancelReservation";
      readonly args: CustomerReservationRef;
    }
  | {
      readonly operation: "rescheduleReservation";
      readonly args: CustomerRescheduleArgs;
    }
  | {
      readonly operation: "adminCreateSession";
      readonly args: AdminSessionCreateArgs;
    }
  | {
      readonly operation: "adminUpdateSession";
      readonly args: AdminSessionUpdateArgs;
    }
  | {
      readonly operation: "adminDeleteSession";
      readonly args: AdminReservationRef;
    }
  | {
      readonly operation: "adminMarkReservationNoShow";
      readonly args: AdminReservationRef;
    };

export const QA_CANONICAL_OPERATIONS = [
  "snapshot",
  "availableSlots",
  "createHold",
  "confirmReservation",
  "cancelReservation",
  "rescheduleReservation",
  "adminCreateSession",
  "adminUpdateSession",
  "adminDeleteSession",
  "adminMarkReservationNoShow",
] as const;

type QaCanonicalOperation = QaCanonicalCall["operation"];
type ListedCanonicalOperation = (typeof QA_CANONICAL_OPERATIONS)[number];
type CanonicalOperationsAreExact = [
  Exclude<QaCanonicalOperation, ListedCanonicalOperation>,
  Exclude<ListedCanonicalOperation, QaCanonicalOperation>,
] extends [never, never]
  ? true
  : never;

export const QA_CANONICAL_OPERATIONS_ARE_EXACT: CanonicalOperationsAreExact = true;

export const QA_CANONICAL_FAILURE_CODES = [
  "reservation_not_actionable",
  "admin_forbidden",
  "slot_conflict",
  "reservation_not_found",
  "no_show_disabled",
  "auth_required",
  "no_show_future",
  "no_show_wrong_status",
  "no_show_already_marked",
] as const;

export type QaCanonicalFailureCode =
  | (typeof QA_CANONICAL_FAILURE_CODES)[number]
  | "qa_browser_bridge_unavailable"
  | "qa_browser_operation_unavailable"
  | "canonical_call_failed";

export type QaCanonicalCallResult =
  | { readonly kind: "success"; readonly value: unknown }
  | { readonly kind: "failure"; readonly error: QaCanonicalFailureCode };

export type QaPublicStateExpectation =
  | {
      readonly kind: "status";
      readonly status: PublicContext["status"];
    }
  | {
      readonly kind: "messages";
      readonly messages: readonly {
        readonly type: string;
        readonly template?: string;
        readonly reservationId?: string;
      }[];
    };

export function matchesQaPublicState(
  state: PublicThreadState,
  expectation: QaPublicStateExpectation,
): boolean {
  if (expectation.kind === "status") {
    return state.publicContext.status === expectation.status;
  }
  return expectation.messages.every((expected) =>
    state.messages.some((message) => {
      if (message.type !== expected.type) return false;
      const payload = message.publicPayload;
      return (
        (expected.template === undefined ||
          payload?.["template"] === expected.template) &&
        (expected.reservationId === undefined ||
          payload?.["reservationId"] === expected.reservationId)
      );
    }),
  );
}

export type QaBrowserBridgeContract = {
  readonly startPublicStateWait: (
    id: string,
    expectation: QaPublicStateExpectation,
    timeoutMs: number,
  ) => void;
  readonly finishPublicStateWait: (id: string) => Promise<PublicThreadState>;
  readonly cancelPublicStateWait: (id: string) => void;
  readonly snapshot: (args: Record<string, never>) => Promise<CustomerSnapshot>;
  readonly availableSlots: (
    args: CustomerAvailableSlotsArgs,
  ) => Promise<{ slots: PublicSlot[] }>;
  readonly createHold: (
    args: CustomerCreateHoldArgs,
  ) => Promise<{ publicContext: PublicContext; holdExpiresAtMs: number }>;
  readonly confirmReservation: (
    args: CustomerReservationRef,
  ) => Promise<{ publicContext: PublicContext }>;
  readonly cancelReservation: (
    args: CustomerReservationRef,
  ) => Promise<{ publicContext: PublicContext; escalated: boolean }>;
  readonly rescheduleReservation: (
    args: CustomerRescheduleArgs,
  ) => Promise<{ publicContext: PublicContext }>;
  readonly adminCreateSession: (
    args: AdminSessionCreateArgs,
  ) => Promise<AdminReservationResult>;
  readonly adminUpdateSession: (
    args: AdminSessionUpdateArgs,
  ) => Promise<AdminReservationResult>;
  readonly adminDeleteSession: (
    args: AdminReservationRef,
  ) => Promise<AdminCancelResult>;
  readonly adminMarkReservationNoShow: (
    args: AdminReservationRef,
  ) => Promise<AdminNoShowResult>;
};
