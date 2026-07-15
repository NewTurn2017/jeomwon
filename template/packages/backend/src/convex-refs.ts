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
  ChatRequest,
  CustomerAvailableSlotsArgs,
  CustomerCreateHoldArgs,
  CustomerRescheduleArgs,
  CustomerReservationRef,
  CustomerSnapshot,
  DomainPublicSnapshot,
  GuardrailStatus,
  JsonRecord,
  LookupReservationArgs,
  PublicContext,
  PublicSlot,
  PublicThreadState,
  WaitlistArgs,
} from "./agent-contract";

const customerReservationRefs = {
  snapshot: makeFunctionReference<
    "query",
    Record<string, never>,
    CustomerSnapshot
  >("customerReservations:snapshot"),
  availableSlots: makeFunctionReference<
    "query",
    CustomerAvailableSlotsArgs,
    { slots: PublicSlot[] }
  >("customerReservations:availableSlots"),
  createHold: makeFunctionReference<
    "mutation",
    CustomerCreateHoldArgs,
    { publicContext: PublicContext; holdExpiresAtMs: number }
  >("customerReservations:createHold"),
  confirmReservation: makeFunctionReference<
    "mutation",
    CustomerReservationRef,
    { publicContext: PublicContext }
  >("customerReservations:confirmReservation"),
  cancelReservation: makeFunctionReference<
    "mutation",
    CustomerReservationRef,
    { publicContext: PublicContext; escalated: boolean }
  >("customerReservations:cancelReservation"),
  rescheduleReservation: makeFunctionReference<
    "mutation",
    CustomerRescheduleArgs,
    { publicContext: PublicContext }
  >("customerReservations:rescheduleReservation"),
} as const;

export const jeomwonConvex = {
  customerReservations: customerReservationRefs,
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
    // Which surface the signed-in viewer should see. Answers, never throws;
    // reuses the same `isOperator` rule as `ensureAdmin`, decided inside Convex
    // because the operator allowlist lives in the deployment env.
    viewerRole: makeFunctionReference<
      "query",
      Record<string, never>,
      "operator" | "customer"
    >("admin:viewerRole"),
  },
  chat: {
    domainPublicConfig: makeFunctionReference<
      "query",
      Record<string, never>,
      DomainPublicSnapshot
    >("chat:domainPublicConfig"),
    // `threadId` is optional because the server derives it from the authenticated
    // user and only checks the argument. Callers should omit it and MUST call
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
  },
} as const;
