import { makeFunctionReference } from "convex/server";
import type {
  AdminDashboardSnapshot,
  AdminReservation,
  AdminReservationAction,
  AvailabilitySearchArgs,
  CancelArgs,
  ChatRequest,
  ConfirmArgs,
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
  },
  chat: {
    domainPublicConfig: makeFunctionReference<
      "query",
      Record<string, never>,
      DomainPublicSnapshot
    >("chat:domainPublicConfig"),
    publicState: makeFunctionReference<
      "query",
      { threadId: string },
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
