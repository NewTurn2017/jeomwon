import { v } from "convex/values";
import {
  type DomainResource,
  type DomainService,
  domainConfig,
} from "../domain.config";
import type { PublicSlot } from "../src/agent-contract";
import { internal } from "./_generated/api";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import {
  alignToSlot,
  buildSlot,
  firstSearchStart,
  hasCollision,
  isSlotAllowed,
  serviceEndMs,
  slotStepMs,
} from "./engine/availability";
import {
  appendChatEvent,
  cancelCustomerReservation,
  confirmCustomerReservation,
  createCustomerReservationHold,
  ensureThread,
  expireCustomerReservationHold,
  generateUniqueReservationNumber,
  publicResources,
  rescheduleCustomerReservation,
  resolveThreadReservation,
} from "./engine/customerReservationLifecycle";
import { assertThreadAccess } from "./engine/identity";
import {
  auditEvent,
  publicContextFromReservation,
  resourceByKey,
  resourcesForService,
  serviceByKey,
} from "./engine/lifecycle";

const publicSlotValidator = v.object({
  serviceKey: v.string(),
  serviceLabel: v.string(),
  resourceKey: v.string(),
  resourceLabel: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  timeWindow: v.string(),
});

// Every function below is a PUBLIC Convex function whose only scoping is the
// caller-supplied `threadId`. `assertThreadAccess` is what makes that string
// safe to act on once accounts exist: with `features.customerAccounts` on, the
// caller's thread is re-derived from their authenticated identity and the
// argument is compared against it, so passing someone else's thread fails
// instead of working. With the flag off the guard returns immediately and these
// mutations behave byte-for-byte as they did before.
//
// The guard runs FIRST in each handler — before any read or write — so an
// unauthorized caller cannot even provoke a row to be created (`ensureThread`
// inserts on miss).

export const logUserMessage = mutation({
  args: {
    threadId: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await assertThreadAccess(ctx, args.threadId);
    await ensureThread(ctx, args.threadId, "triage");
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: "message.user",
      role: "user",
      agent: "triage",
      message: args.message,
      publicPayload: null,
    });
    return { ok: true };
  },
});

export const logAssistantMessage = mutation({
  args: {
    threadId: v.string(),
    message: v.string(),
    agent: v.union(
      v.literal("triage"),
      v.literal("availability"),
      v.literal("reservation"),
      v.literal("policy"),
      v.literal("escalation"),
    ),
    publicPayload: v.any(),
  },
  handler: async (ctx, args) => {
    await assertThreadAccess(ctx, args.threadId);
    await ensureThread(ctx, args.threadId, args.agent);
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: "message.assistant",
      role: "assistant",
      agent: args.agent,
      message: args.message,
      publicPayload: args.publicPayload,
    });
    return { ok: true };
  },
});

export const recordGuardrail = mutation({
  args: {
    threadId: v.string(),
    guardrail: v.union(
      v.literal("relevance"),
      v.literal("confirmation"),
      v.literal("privacy"),
    ),
    message: v.string(),
    status: v.literal("draft"),
  },
  handler: async (ctx, args) => {
    await assertThreadAccess(ctx, args.threadId);
    const thread = await ensureThread(ctx, args.threadId, "triage");
    const guardrailStatus = {
      ...thread.guardrailStatus,
      [args.guardrail]: "blocked",
    };
    const publicContext = thread.publicContext;
    const guardrailBanner =
      args.guardrail === "relevance" ? domainConfig.copy.guardrailBanner : null;

    await ctx.db.patch(thread._id, {
      activeAgent: args.guardrail === "privacy" ? "triage" : "reservation",
      publicContext,
      guardrailStatus,
      guardrailBanner,
      updatedAtMs: Date.now(),
    });
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: "guardrail.blocked",
      role: "system",
      agent: args.guardrail === "confirmation" ? "reservation" : "triage",
      message: args.message,
      publicPayload: {
        guardrail: args.guardrail,
      },
    });

    return { publicContext, guardrailStatus };
  },
});

export const searchAvailability = query({
  args: {
    threadId: v.string(),
    serviceKey: v.union(v.string(), v.null()),
    resourceKey: v.union(v.string(), v.null()),
    preferredStartMs: v.union(v.number(), v.null()),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    await assertThreadAccess(ctx, args.threadId);
    const resources = await publicResources(ctx);
    const service = serviceByKey(args.serviceKey);
    const resourceCandidates =
      args.resourceKey !== null
        ? [resourceByKey(args.resourceKey, service, resources)]
        : resourcesForService(service, resources);
    const slots = await findAvailableSlots(ctx, {
      service,
      resourceCandidates,
      preferredStartMs: args.preferredStartMs,
      count: args.count,
    });

    return { slots };
  },
});

export const recordAvailability = mutation({
  args: {
    threadId: v.string(),
    slots: v.array(publicSlotValidator),
    serviceLabel: v.union(v.string(), v.null()),
    reservationId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await assertThreadAccess(ctx, args.threadId);
    const thread = await ensureThread(ctx, args.threadId, "availability");
    const publicContext = {
      ...thread.publicContext,
      reservationId: args.reservationId,
      serviceLabel: args.serviceLabel,
      status: args.slots.length > 0 ? "eligible" : "waitlisted",
      nextStep:
        args.slots.length > 0
          ? domainConfig.copy.nextStepAvailability
          : "운영자 확인 가능한 대기 요청으로 접수할 수 있습니다.",
    } as const;
    await ctx.db.patch(thread._id, {
      activeAgent: "availability",
      publicContext,
      guardrailBanner: null,
      suggestedSlots: args.slots,
      updatedAtMs: Date.now(),
    });
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: "availability.presented",
      role: "system",
      agent: "availability",
      message: domainConfig.copy.availabilityIntro,
      publicPayload: {
        slotCount: args.slots.length,
      },
    });

    return { publicContext };
  },
});

export const joinWaitlist = mutation({
  args: {
    threadId: v.string(),
    serviceKey: v.union(v.string(), v.null()),
    resourceKey: v.union(v.string(), v.null()),
    preferredStartMs: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    await assertThreadAccess(ctx, args.threadId);
    if (!domainConfig.features.waitlist) {
      throw new Error("waitlist_disabled");
    }

    const resources = await publicResources(ctx);
    const service = strictServiceByKey(args.serviceKey);
    const resource = strictResourceByKey(args.resourceKey, service, resources);
    const resourceCandidates =
      args.resourceKey !== null
        ? [resource]
        : resourcesForService(service, resources);
    const now = Date.now();
    const startMs = firstSearchStart(args.preferredStartMs, service);
    const endMs = serviceEndMs(service, startMs);
    const existing = await ctx.db
      .query("reservations")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect()
      .then((reservations) =>
        reservations.find(
          (reservation) =>
            reservation.domainKey === domainConfig.domainKey &&
            reservation.status === "waitlisted" &&
            reservation.serviceKey === service.key &&
            reservation.resourceKey === resource.key,
        ),
      );
    if (existing) {
      const publicContext = {
        ...publicContextFromReservation(existing),
        nextStep: "운영자 확인 가능한 대기 요청으로 접수할 수 있습니다.",
      };
      const thread = await ensureThread(ctx, args.threadId, "availability");
      await ctx.db.patch(thread._id, {
        activeAgent: "availability",
        publicContext,
        guardrailBanner: null,
        suggestedSlots: [],
        updatedAtMs: now,
      });
      return { publicContext };
    }

    const availableSlots = await findAvailableSlots(ctx, {
      service,
      resourceCandidates,
      preferredStartMs: args.preferredStartMs,
      count: 1,
    });
    if (availableSlots.length > 0) {
      throw new Error("waitlist_availability_exists");
    }

    const reservationNumber = await generateUniqueReservationNumber(ctx, now);
    const reservationId = await ctx.db.insert("reservations", {
      domainKey: domainConfig.domainKey,
      threadId: args.threadId,
      reservationNumber,
      displayName: null,
      serviceKey: service.key,
      serviceLabel: service.label,
      resourceKey: resource.key,
      resourceLabel: resource.label,
      startMs,
      endMs,
      status: "waitlisted",
      holdExpiresAtMs: null,
      // Server-set, never from client args. The operator board reads `origin` —
      // and nothing else — to tell its own sessions from a customer's row.
      origin: "customer",
      auditHistory: [
        auditEvent(
          "waitlist.joined",
          "availability",
          "Customer joined the waitlist.",
          "운영자 확인 가능한 대기 요청으로 접수할 수 있습니다.",
        ),
      ],
      createdAtMs: now,
      updatedAtMs: now,
    });
    const reservation = await ctx.db.get(reservationId);
    if (!reservation) {
      throw new Error("waitlist_insert_failed");
    }

    const publicContext = {
      ...publicContextFromReservation(reservation),
      nextStep: "운영자 확인 가능한 대기 요청으로 접수할 수 있습니다.",
    };
    const thread = await ensureThread(ctx, args.threadId, "availability");
    await ctx.db.patch(thread._id, {
      activeAgent: "availability",
      publicContext,
      guardrailBanner: null,
      suggestedSlots: [],
      updatedAtMs: now,
    });
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: "waitlist.joined",
      role: "system",
      agent: "availability",
      message: "Waitlist request recorded.",
      publicPayload: {
        reservationId: publicContext.reservationId,
      },
    });

    return { publicContext };
  },
});

export const lookupReservation = mutation({
  args: {
    threadId: v.string(),
    reservationId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertThreadAccess(ctx, args.threadId);
    const thread = await ensureThread(ctx, args.threadId, "reservation");
    const reservation = await resolveThreadReservation(
      ctx,
      args.threadId,
      args.reservationId,
    );
    if (!reservation) {
      throw new Error("reservation_not_found");
    }

    const publicContext = publicContextFromReservation(reservation);
    await ctx.db.patch(thread._id, {
      activeAgent: "reservation",
      publicContext,
      guardrailBanner: null,
      suggestedSlots: [],
      updatedAtMs: Date.now(),
    });
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: "reservation.lookup",
      role: "system",
      agent: "reservation",
      message: "Reservation lookup completed.",
      publicPayload: {
        reservationId: publicContext.reservationId,
      },
    });

    return { publicContext };
  },
});

/**
 * @deprecated Compatibility adapter for `features.customerAccounts=false`.
 * Authenticated chat and direct UI use `customerReservations:*`; remove in PR4.
 */
export const createHold = mutation({
  args: {
    threadId: v.string(),
    displayName: v.union(v.string(), v.null()),
    serviceKey: v.string(),
    resourceKey: v.string(),
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertLegacyReservationAdapterEnabled();
    await assertThreadAccess(ctx, args.threadId);
    return await createCustomerReservationHold(ctx, {
      threadId: args.threadId,
      displayName: args.displayName,
      serviceKey: args.serviceKey,
      resourceKey: args.resourceKey,
      startMs: args.startMs,
    });
  },
});

/** @deprecated Compatibility adapter for the PR4 legacy-web removal. */
export const confirmReservation = mutation({
  args: {
    threadId: v.string(),
    reservationId: v.string(),
    confirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    assertLegacyReservationAdapterEnabled();
    await assertThreadAccess(ctx, args.threadId);
    if (!args.confirmed) {
      const thread = await ensureThread(ctx, args.threadId, "reservation");
      return { publicContext: thread.publicContext };
    }
    return await confirmCustomerReservation(ctx, {
      threadId: args.threadId,
      reservationId: args.reservationId,
    });
  },
});

/** @deprecated Compatibility adapter for the PR4 legacy-web removal. */
export const cancelReservation = mutation({
  args: {
    threadId: v.string(),
    reservationId: v.string(),
    requestedAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertLegacyReservationAdapterEnabled();
    await assertThreadAccess(ctx, args.threadId);
    return await cancelCustomerReservation(ctx, {
      threadId: args.threadId,
      reservationId: args.reservationId,
    });
  },
});

/** @deprecated Compatibility adapter for the PR4 legacy-web removal. */
export const rescheduleReservation = mutation({
  args: {
    threadId: v.string(),
    reservationId: v.string(),
    serviceKey: v.string(),
    resourceKey: v.string(),
    startMs: v.number(),
    endMs: v.number(),
    requestedAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertLegacyReservationAdapterEnabled();
    await assertThreadAccess(ctx, args.threadId);
    return await rescheduleCustomerReservation(ctx, {
      threadId: args.threadId,
      reservationId: args.reservationId,
      serviceKey: args.serviceKey,
      resourceKey: args.resourceKey,
      startMs: args.startMs,
    });
  },
});

function assertLegacyReservationAdapterEnabled() {
  if (domainConfig.features.customerAccounts) {
    throw new Error("legacy_reservation_adapter_disabled");
  }
}

export const expireHold = internalMutation({
  args: {
    reservationId: v.id("reservations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (
      reservation?.status !== "held" ||
      reservation.holdExpiresAtMs === null
    ) {
      return null;
    }

    const remainingMs = reservation.holdExpiresAtMs - Date.now();
    if (remainingMs > 0) {
      await ctx.scheduler.runAfter(
        remainingMs,
        internal.agentTools.expireHold,
        { reservationId: args.reservationId },
      );
      return null;
    }

    await expireCustomerReservationHold(ctx, reservation);

    return null;
  },
});

async function findAvailableSlots(
  ctx: QueryCtx | MutationCtx,
  input: {
    service: DomainService;
    resourceCandidates: DomainResource[];
    preferredStartMs: number | null;
    count: number;
  },
) {
  const reservations = await ctx.db
    .query("reservations")
    .withIndex("by_domain_status_time", (q) =>
      q.eq("domainKey", domainConfig.domainKey),
    )
    .collect();
  const slots: PublicSlot[] = [];
  const startSearch = firstSearchStart(input.preferredStartMs, input.service);
  const stepMs = slotStepMs(input.service);
  const horizonMs = startSearch + 21 * 24 * 60 * 60 * 1000;

  for (
    let cursorMs = startSearch;
    cursorMs < horizonMs && slots.length < Math.max(1, input.count);
    cursorMs += stepMs
  ) {
    const alignedStartMs = alignToSlot(cursorMs, input.service);
    for (const resource of input.resourceCandidates) {
      const endMs = serviceEndMs(input.service, alignedStartMs);
      if (!isSlotAllowed(alignedStartMs, endMs, input.service)) {
        continue;
      }
      if (hasCollision(reservations, resource.key, alignedStartMs, endMs)) {
        continue;
      }
      slots.push(buildSlot(input.service, resource, alignedStartMs));
      if (slots.length >= Math.max(1, input.count)) {
        break;
      }
    }
  }

  return slots;
}

function strictServiceByKey(serviceKey: string | null) {
  if (serviceKey === null) {
    return serviceByKey(null);
  }

  const service = domainConfig.services.find(
    (candidate) => candidate.key === serviceKey,
  );
  if (!service) {
    throw new Error("service_not_found");
  }
  return service;
}

function strictResourceByKey(
  resourceKey: string | null,
  service: DomainService,
  seededResources: DomainResource[],
) {
  if (resourceKey === null) {
    return resourceByKey(null, service, seededResources);
  }

  const resource =
    seededResources.find(
      (candidate) =>
        candidate.key === resourceKey &&
        candidate.kind === service.resourceKind,
    ) ??
    domainConfig.resources.find(
      (candidate) =>
        candidate.key === resourceKey &&
        candidate.kind === service.resourceKind,
    );
  if (!resource) {
    throw new Error("resource_not_found");
  }
  return resource;
}
