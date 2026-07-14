import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const reservationStatus = v.union(
  v.literal("draft"),
  v.literal("eligible"),
  v.literal("held"),
  v.literal("confirmed"),
  v.literal("rescheduled"),
  v.literal("waitlisted"),
  v.literal("cancelled"),
  v.literal("expired"),
  v.literal("denied"),
  v.literal("escalated"),
);

const resourceKind = v.union(
  v.literal("person"),
  v.literal("seat"),
  v.literal("room"),
  v.literal("unit"),
);

const agentName = v.union(
  v.literal("triage"),
  v.literal("availability"),
  v.literal("reservation"),
  v.literal("policy"),
  v.literal("escalation"),
);

const reservationAuditActor = v.union(
  v.literal("triage"),
  v.literal("availability"),
  v.literal("reservation"),
  v.literal("policy"),
  v.literal("escalation"),
  v.literal("operator"),
);

const publicContext = v.object({
  displayName: v.union(v.string(), v.null()),
  reservationId: v.union(v.string(), v.null()),
  serviceLabel: v.union(v.string(), v.null()),
  resourceLabel: v.union(v.string(), v.null()),
  timeWindow: v.union(v.string(), v.null()),
  status: reservationStatus,
  policySummary: v.string(),
  nextStep: v.string(),
});

const publicSlot = v.object({
  serviceKey: v.string(),
  serviceLabel: v.string(),
  resourceKey: v.string(),
  resourceLabel: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  timeWindow: v.string(),
});

const guardrailStatus = v.object({
  relevance: v.union(v.literal("clear"), v.literal("blocked")),
  confirmation: v.union(v.literal("clear"), v.literal("blocked")),
  privacy: v.union(v.literal("clear"), v.literal("blocked")),
});

export default defineSchema({
  ...authTables,
  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // custom fields
    username: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
  }).index("email", ["email"]),
  resources: defineTable({
    domainKey: v.string(),
    key: v.string(),
    label: v.string(),
    kind: resourceKind,
    active: v.boolean(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index("by_domain", ["domainKey"])
    .index("by_domain_key", ["domainKey", "key"])
    .index("by_domain_kind", ["domainKey", "kind"]),
  reservations: defineTable({
    domainKey: v.string(),
    threadId: v.string(),
    reservationNumber: v.optional(v.string()),
    displayName: v.union(v.string(), v.null()),
    serviceKey: v.string(),
    serviceLabel: v.string(),
    resourceKey: v.string(),
    resourceLabel: v.string(),
    startMs: v.number(),
    endMs: v.number(),
    status: reservationStatus,
    holdExpiresAtMs: v.union(v.number(), v.null()),
    // Who created this reservation. Server-set inside mutations only, never from
    // client args. Optional so rows written before this field — and every pack
    // that does not use customer accounts — stay valid without a backfill.
    origin: v.optional(v.union(v.literal("operator"), v.literal("customer"))),
    auditHistory: v.array(
      v.object({
        atMs: v.number(),
        type: v.string(),
        actor: reservationAuditActor,
        summary: v.string(),
        publicMessage: v.union(v.string(), v.null()),
      }),
    ),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  })
    .index("by_domain_status_time", ["domainKey", "status", "startMs"])
    .index("by_domain_reservation_number", ["domainKey", "reservationNumber"])
    .index("by_thread", ["threadId"])
    .index("by_resource_time", ["domainKey", "resourceKey", "startMs"])
    .index("by_resource_status_end", [
      "domainKey",
      "resourceKey",
      "status",
      "endMs",
    ]),
  chatThreads: defineTable({
    domainKey: v.string(),
    threadId: v.string(),
    activeAgent: agentName,
    publicContext,
    guardrailStatus,
    guardrailBanner: v.union(v.string(), v.null()),
    suggestedSlots: v.array(publicSlot),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  }).index("by_thread", ["threadId"]),
  chatEvents: defineTable({
    domainKey: v.string(),
    threadId: v.string(),
    type: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
    ),
    agent: agentName,
    message: v.string(),
    publicPayload: v.any(),
    createdAtMs: v.number(),
  })
    .index("by_thread", ["threadId", "createdAtMs"])
    .index("by_domain_time", ["domainKey", "createdAtMs"]),
});
