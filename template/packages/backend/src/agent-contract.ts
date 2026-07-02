import type {
  DomainConfig,
  DomainResource,
  DomainService,
} from "../domain.config";

export const reservationStatuses = [
  "draft",
  "eligible",
  "held",
  "confirmed",
  "rescheduled",
  "waitlisted",
  "cancelled",
  "expired",
  "denied",
  "escalated",
] as const;

export type ReservationStatus = (typeof reservationStatuses)[number];

export type AgentName =
  | "triage"
  | "availability"
  | "reservation"
  | "policy"
  | "escalation";

export type GuardrailStatus = {
  relevance: "clear" | "blocked";
  confirmation: "clear" | "blocked";
  privacy: "clear" | "blocked";
};

export type PublicContext = {
  displayName: string | null;
  reservationId: string | null;
  serviceLabel: string | null;
  resourceLabel: string | null;
  timeWindow: string | null;
  status: ReservationStatus;
  policySummary: string;
  nextStep: string;
};

export type InternalContext = {
  operatorMemo: string | null;
  privateDecision: string | null;
  riskSignals: string[];
  costBasisCents: number | null;
};

export type PublicSlot = {
  serviceKey: string;
  serviceLabel: string;
  resourceKey: string;
  resourceLabel: string;
  startMs: number;
  endMs: number;
  timeWindow: string;
};

export type PublicChatEvent = {
  id: string;
  type: string;
  role: "user" | "assistant" | "system";
  agent: AgentName;
  message: string;
  createdAtMs: number;
  publicPayload: JsonRecord | null;
};

export type DomainPublicSnapshot = Pick<
  DomainConfig,
  | "domainKey"
  | "storeName"
  | "storeTimezone"
  | "locale"
  | "adminWidget"
  | "features"
  | "copy"
> & {
  resources: DomainResource[];
  services: DomainService[];
};

export type AdminReservationAction = "approveCancel" | "keepReservation";

export type AdminDomainSnapshot = Pick<
  DomainConfig,
  | "domainKey"
  | "storeName"
  | "storeTimezone"
  | "locale"
  | "adminWidget"
  | "businessHours"
  | "policies"
> & {
  resources: DomainResource[];
  services: DomainService[];
};

export type AdminAuditEvent = {
  atMs: number;
  type: string;
  actor: AgentName;
  summary: string;
  publicMessage: string | null;
};

export type AdminReservation = {
  id: string;
  threadId: string;
  displayName: string | null;
  serviceKey: string;
  serviceLabel: string;
  resourceKey: string;
  resourceLabel: string;
  startMs: number;
  endMs: number;
  timeWindow: string;
  status: ReservationStatus;
  holdExpiresAtMs: number | null;
  auditHistory: AdminAuditEvent[];
  internalContext: InternalContext;
  createdAtMs: number;
  updatedAtMs: number;
};

export type AdminChatEvent = {
  id: string;
  threadId: string;
  type: string;
  role: "user" | "assistant" | "system";
  agent: AgentName;
  message: string;
  createdAtMs: number;
};

export type AdminDashboardSnapshot = {
  domain: AdminDomainSnapshot;
  reservations: AdminReservation[];
  escalations: AdminReservation[];
  events: AdminChatEvent[];
  generatedAtMs: number;
};

export type PublicThreadState = {
  domain: DomainPublicSnapshot;
  threadId: string;
  activeAgent: AgentName;
  publicContext: PublicContext;
  guardrailStatus: GuardrailStatus;
  guardrailBanner: string | null;
  suggestedSlots: PublicSlot[];
  messages: PublicChatEvent[];
  widgets: {
    reservationCard: PublicContext;
    guardrailBanner: string | null;
  };
};

export type ChatRequest = {
  threadId: string;
  message: string;
};

export type ChatTurnResult = {
  threadId: string;
  reply: string;
  activeAgent: AgentName;
  publicContext: PublicContext;
  guardrailStatus: GuardrailStatus;
  state: PublicThreadState;
};

export type AvailabilitySearchArgs = {
  threadId: string;
  serviceKey: string | null;
  resourceKey: string | null;
  preferredStartMs: number | null;
  count: number;
};

export type HoldArgs = {
  threadId: string;
  displayName: string | null;
  serviceKey: string;
  resourceKey: string;
  startMs: number;
  endMs: number;
};

export type ConfirmArgs = {
  threadId: string;
  reservationId: string;
  confirmed: boolean;
};

export type LookupReservationArgs = {
  threadId: string;
  reservationId: string;
};

export type CancelArgs = {
  threadId: string;
  reservationId: string;
  requestedAtMs: number;
};

export type RescheduleArgs = {
  threadId: string;
  reservationId: string;
  serviceKey: string;
  resourceKey: string;
  startMs: number;
  endMs: number;
  requestedAtMs: number;
};

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | JsonRecord;

export type JsonRecord = {
  [key: string]: JsonValue;
};

export function createDefaultGuardrailStatus(): GuardrailStatus {
  return {
    relevance: "clear",
    confirmation: "clear",
    privacy: "clear",
  };
}
