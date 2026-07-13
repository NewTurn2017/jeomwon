import { makeFunctionReference } from "convex/server";
import type {
  AdminCancelResult,
  AdminCustomerRescheduleArgs,
  AdminDashboardSnapshot,
  AdminReservation,
  AdminReservationAction,
  AdminReservationRef,
  AdminReservationResult,
  AdminSessionCreateArgs,
  AdminSessionUpdateArgs,
  AvailabilitySearchArgs,
  CancelArgs,
  ChatRequest,
  ConfirmArgs,
  CustomerSnapshot,
  DomainPublicSnapshot,
  GuardrailStatus,
  HoldArgs,
  JsonRecord,
  LookupReservationArgs,
  PublicContext,
  PublicSlot,
  PublicThreadState,
  RescheduleArgs,
  WaitlistArgs,
} from "./agent-contract";

export const jeomwonConvex = {
  admin: {
    dashboardSnapshot: makeFunctionReference<
      "query",
      Record<string, never>,
      AdminDashboardSnapshot
    >("admin:dashboardSnapshot"),
    resolveEscalation: makeFunctionReference<
      "mutation",
      { reservationId: string; action: AdminReservationAction },
      { reservation: AdminReservation; action: AdminReservationAction }
    >("admin:resolveEscalation"),
    // Operator calendar CRUD. Available only when
    // `features.operatorCalendarCrud` is on; the mutations throw otherwise.
    createSession: makeFunctionReference<
      "mutation",
      AdminSessionCreateArgs,
      AdminReservationResult
    >("admin:createSession"),
    updateSession: makeFunctionReference<
      "mutation",
      AdminSessionUpdateArgs,
      AdminReservationResult
    >("admin:updateSession"),
    // Note the missing `title`: editing a customer's row must not touch their
    // `displayName`.
    rescheduleCustomerReservation: makeFunctionReference<
      "mutation",
      AdminCustomerRescheduleArgs,
      AdminReservationResult
    >("admin:rescheduleCustomerReservation"),
    deleteSession: makeFunctionReference<
      "mutation",
      AdminReservationRef,
      AdminCancelResult
    >("admin:deleteSession"),
    // A CUSTOMER-facing query that happens to live in admin.ts, next to the
    // `ensureCustomer` guard it depends on. It takes no arguments: the thread is
    // derived from the caller's token, so there is nothing to forge. Requires
    // `features.customerAccounts`.
    customerSnapshot: makeFunctionReference<
      "query",
      Record<string, never>,
      CustomerSnapshot
    >("admin:customerSnapshot"),
  },
  chat: {
    domainPublicConfig: makeFunctionReference<
      "query",
      Record<string, never>,
      DomainPublicSnapshot
    >("chat:domainPublicConfig"),
    // `threadId` is optional because with `features.customerAccounts` on the
    // server derives it from the authenticated user and only *checks* the
    // argument. Callers on that path should omit it entirely — and MUST call
    // `ConvexHttpClient#setAuth(token)`, or Convex sees no identity and this
    // throws `auth_required`.
    publicState: makeFunctionReference<
      "query",
      { threadId?: string },
      PublicThreadState
    >("chat:publicState"),
  },
  agentTools: {
    logUserMessage: makeFunctionReference<
      "mutation",
      ChatRequest,
      { ok: true }
    >("agentTools:logUserMessage"),
    logAssistantMessage: makeFunctionReference<
      "mutation",
      {
        threadId: string;
        message: string;
        agent: string;
        publicPayload: JsonRecord | null;
      },
      { ok: true }
    >("agentTools:logAssistantMessage"),
    recordGuardrail: makeFunctionReference<
      "mutation",
      {
        threadId: string;
        guardrail: keyof GuardrailStatus;
        message: string;
        status: "draft";
      },
      { publicContext: PublicContext; guardrailStatus: GuardrailStatus }
    >("agentTools:recordGuardrail"),
    searchAvailability: makeFunctionReference<
      "query",
      AvailabilitySearchArgs,
      { slots: PublicSlot[] }
    >("agentTools:searchAvailability"),
    recordAvailability: makeFunctionReference<
      "mutation",
      {
        threadId: string;
        slots: PublicSlot[];
        serviceLabel: string | null;
        reservationId: string | null;
      },
      { publicContext: PublicContext }
    >("agentTools:recordAvailability"),
    joinWaitlist: makeFunctionReference<
      "mutation",
      WaitlistArgs,
      { publicContext: PublicContext }
    >("agentTools:joinWaitlist"),
    lookupReservation: makeFunctionReference<
      "mutation",
      LookupReservationArgs,
      { publicContext: PublicContext }
    >("agentTools:lookupReservation"),
    createHold: makeFunctionReference<
      "mutation",
      HoldArgs,
      { publicContext: PublicContext; holdExpiresAtMs: number }
    >("agentTools:createHold"),
    confirmReservation: makeFunctionReference<
      "mutation",
      ConfirmArgs,
      { publicContext: PublicContext }
    >("agentTools:confirmReservation"),
    cancelReservation: makeFunctionReference<
      "mutation",
      CancelArgs,
      { publicContext: PublicContext; escalated: boolean }
    >("agentTools:cancelReservation"),
    rescheduleReservation: makeFunctionReference<
      "mutation",
      RescheduleArgs,
      { publicContext: PublicContext }
    >("agentTools:rescheduleReservation"),
  },
} as const;
