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

/**
 * Who created a reservation row. Server-set inside the mutation that inserts it,
 * never taken from client args, and the only ownership signal the operator board
 * may trust. Rows written before this field exists read as `null`; they are chat
 * rows, so they are treated exactly like `"customer"`.
 */
export type ReservationOrigin = "operator" | "customer";

export type AdminDomainSnapshot = Pick<
  DomainConfig,
  | "domainKey"
  | "storeName"
  | "storeTimezone"
  | "locale"
  | "adminWidget"
  | "businessHours"
  | "policies"
  | "features"
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
  origin: ReservationOrigin | null;
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

/**
 * Customer accounts (`features.customerAccounts`).
 *
 * ── Where the authenticated identity must enter Convex ───────────────────────
 * With the flag ON, `chat:publicState` and every `agentTools:*` mutation derive
 * the caller's thread from `getAuthUserId(ctx)` and reject a `threadId` that is
 * not theirs. Convex learns who the caller is ONLY from the auth token on the
 * request. So the chat path must forward the customer's token:
 *
 *   ConvexHttpClient#setAuth(token)   <- required
 *
 * The agent toolbox builds its `ConvexHttpClient` from a URL alone and never
 * calls `setAuth`. Until a token is forwarded, a flags-ON deployment gets
 * `auth_required` from every chat mutation. That is deliberate: the boundary
 * fails CLOSED. Do NOT "fix" it by relaxing the guard — the guard IS the feature.
 */
export type CustomerReservation = {
  id: string;
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
  createdAtMs: number;
  updatedAtMs: number;
};

/**
 * What a signed-in customer may see. Structurally incapable of carrying
 * `auditHistory`, `internalContext`, escalations, or another customer's rows —
 * which is why this is its own type and not a reuse of `AdminDashboardSnapshot`.
 *
 * This is also the answer to the single-`publicContext` limitation: one thread
 * stores ONE `publicContext` and each booking overwrites it, so the chat
 * reservation card shows the conversation's current focus. A customer with
 * several reservations reads THIS for the full list.
 */
export type CustomerSnapshot = {
  domain: DomainPublicSnapshot;
  threadId: string;
  reservations: CustomerReservation[];
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

export type WaitlistArgs = {
  threadId: string;
  serviceKey: string | null;
  resourceKey: string | null;
  preferredStartMs: number | null;
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

/**
 * Operator calendar CRUD (`features.operatorCalendarCrud`).
 *
 * The slot is a store-timezone wall clock (`YYYY-MM-DD` + `HH:MM`), never a
 * timestamp read off the operator's browser: the Convex mutation converts it
 * against `domainConfig.storeTimezone`.
 */
export type AdminSlotArgs = {
  serviceKey: string;
  resourceKey: string;
  dateKey: string;
  startTime: string;
};

/** Creating/updating an operator session. `title` lands in `displayName`. */
export type AdminSessionCreateArgs = AdminSlotArgs & {
  title: string;
};

export type AdminSessionUpdateArgs = AdminSessionCreateArgs & {
  reservationId: string;
};

/**
 * Editing a CUSTOMER's reservation from the board. Deliberately a different shape
 * from `AdminSessionUpdateArgs`: it carries no `title`, because on a customer row
 * `displayName` is the customer's name and writing a session title over it would
 * destroy their PII.
 */
export type AdminCustomerRescheduleArgs = AdminSlotArgs & {
  reservationId: string;
};

export type AdminReservationRef = {
  reservationId: string;
};

export type AdminReservationResult = {
  reservation: AdminReservation;
};

/**
 * `escalated` is true when the cancel landed inside `policies.cancelWindowHours`.
 * The window stays owned by the Convex mutation, so an operator cancel inside it
 * queues an escalation for `admin:resolveEscalation` instead of bypassing it.
 */
export type AdminCancelResult = {
  reservation: AdminReservation;
  escalated: boolean;
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
