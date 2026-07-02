import { v } from "convex/values";
import { domainConfig, getHoldDurationMs } from "../domain.config";
import type { AgentName, PublicSlot } from "../src/agent-contract";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import {
  alignToSlot,
  appendAudit,
  auditEvent,
  buildSlot,
  defaultGuardrailStatus,
  defaultPublicContext,
  firstSearchStart,
  hasCollision,
  isInsideCancelWindow,
  isSlotAllowed,
  publicContextFromReservation,
  resourceByKey,
  resourcesForService,
  serviceByKey,
  serviceEndMs,
  slotStepMs,
} from "./jeomwonLib";
import { scheduleReservationEmail } from "./reservationEmailScheduler";

const publicSlotValidator = v.object({
  serviceKey: v.string(),
  serviceLabel: v.string(),
  resourceKey: v.string(),
  resourceLabel: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  timeWindow: v.string(),
});

export const logUserMessage = mutation({
  args: {
    threadId: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
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
    const resources = await publicResources(ctx);
    const service = serviceByKey(args.serviceKey);
    const resourceCandidates =
      args.resourceKey !== null
        ? [resourceByKey(args.resourceKey, service, resources)]
        : resourcesForService(service, resources);
    const reservations = await ctx.db
      .query("reservations")
      .withIndex("by_domain_status_time", (q) =>
        q.eq("domainKey", domainConfig.domainKey),
      )
      .collect();
    const slots: PublicSlot[] = [];
    const startSearch = firstSearchStart(args.preferredStartMs, service);
    const stepMs = slotStepMs(service);
    const horizonMs = startSearch + 21 * 24 * 60 * 60 * 1000;

    for (
      let cursorMs = startSearch;
      cursorMs < horizonMs && slots.length < Math.max(1, args.count);
      cursorMs += stepMs
    ) {
      const alignedStartMs = alignToSlot(cursorMs, service);
      for (const resource of resourceCandidates) {
        const endMs = serviceEndMs(service, alignedStartMs);
        if (!isSlotAllowed(alignedStartMs, endMs, service)) {
          continue;
        }
        if (hasCollision(reservations, resource.key, alignedStartMs, endMs)) {
          continue;
        }
        slots.push(buildSlot(service, resource, alignedStartMs));
        if (slots.length >= Math.max(1, args.count)) {
          break;
        }
      }
    }

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

export const lookupReservation = mutation({
  args: {
    threadId: v.string(),
    reservationId: v.string(),
  },
  handler: async (ctx, args) => {
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
    const resources = await publicResources(ctx);
    const service = serviceByKey(args.serviceKey);
    const resource = resourceByKey(args.resourceKey, service, resources);
    const reservations = await ctx.db
      .query("reservations")
      .withIndex("by_resource_time", (q) =>
        q
          .eq("domainKey", domainConfig.domainKey)
          .eq("resourceKey", resource.key),
      )
      .collect();

    if (args.endMs !== serviceEndMs(service, args.startMs)) {
      throw new Error("slot_duration_mismatch");
    }

    if (!isSlotAllowed(args.startMs, args.endMs, service)) {
      throw new Error("slot_outside_business_hours");
    }

    if (hasCollision(reservations, resource.key, args.startMs, args.endMs)) {
      throw new Error("slot_conflict");
    }

    const now = Date.now();
    const holdExpiresAtMs = now + getHoldDurationMs();
    const reservationNumber = await generateUniqueReservationNumber(ctx, now);
    const reservationId = await ctx.db.insert("reservations", {
      domainKey: domainConfig.domainKey,
      threadId: args.threadId,
      reservationNumber,
      displayName: args.displayName,
      serviceKey: service.key,
      serviceLabel: service.label,
      resourceKey: resource.key,
      resourceLabel: resource.label,
      startMs: args.startMs,
      endMs: args.endMs,
      status: "held",
      holdExpiresAtMs,
      auditHistory: [
        auditEvent(
          "reservation.held",
          "reservation",
          "Slot hold created.",
          domainConfig.copy.holdCreated,
        ),
      ],
      createdAtMs: now,
      updatedAtMs: now,
    });
    const reservation = await ctx.db.get(reservationId);
    if (!reservation) {
      throw new Error("reservation_insert_failed");
    }

    const publicContext = publicContextFromReservation(reservation);
    const thread = await ensureThread(ctx, args.threadId, "reservation");
    await ctx.db.patch(thread._id, {
      activeAgent: "reservation",
      publicContext,
      guardrailBanner: null,
      suggestedSlots: [],
      updatedAtMs: now,
    });
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: "reservation.held",
      role: "system",
      agent: "reservation",
      message: domainConfig.copy.holdCreated,
      publicPayload: {
        reservationId: publicContext.reservationId,
      },
    });

    // Schedule against the persisted deadline so retries and QA share one clock.
    await ctx.scheduler.runAt(holdExpiresAtMs, internal.agentTools.expireHold, {
      reservationId,
    });

    return { publicContext, holdExpiresAtMs };
  },
});

export const confirmReservation = mutation({
  args: {
    threadId: v.string(),
    reservationId: v.string(),
    confirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const thread = await ensureThread(ctx, args.threadId, "reservation");
    if (!args.confirmed) {
      return { publicContext: thread.publicContext };
    }

    const reservation = await resolveThreadReservation(
      ctx,
      args.threadId,
      args.reservationId,
    );
    if (!reservation) {
      throw new Error("reservation_not_found");
    }

    if (
      reservation.status === "held" &&
      reservation.holdExpiresAtMs !== null &&
      reservation.holdExpiresAtMs <= Date.now()
    ) {
      await expireReservation(ctx, reservation);
      const expired = await ctx.db.get(reservation._id);
      return {
        publicContext: expired
          ? publicContextFromReservation(expired)
          : defaultPublicContext("expired"),
      };
    }

    if (reservation.status !== "held") {
      throw new Error("reservation_not_held");
    }

    await ctx.db.patch(reservation._id, {
      status: "confirmed",
      holdExpiresAtMs: null,
      auditHistory: appendAudit(
        reservation.auditHistory,
        auditEvent(
          "reservation.confirmed",
          "reservation",
          "Customer confirmed the held slot.",
          domainConfig.copy.confirmed,
        ),
      ),
      updatedAtMs: Date.now(),
    });
    const confirmed = await ctx.db.get(reservation._id);
    if (!confirmed) {
      throw new Error("reservation_confirm_failed");
    }

    const publicContext = publicContextFromReservation(confirmed);
    await ctx.db.patch(thread._id, {
      activeAgent: "reservation",
      publicContext,
      guardrailBanner: null,
      suggestedSlots: [],
      updatedAtMs: Date.now(),
    });
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: "reservation.confirmed",
      role: "system",
      agent: "reservation",
      message: domainConfig.copy.confirmed,
      publicPayload: {
        reservationId: publicContext.reservationId,
      },
    });
    await scheduleReservationEmail(ctx, {
      kind: "reservation.confirmed",
      threadId: args.threadId,
      publicContext,
    });

    return { publicContext };
  },
});

export const cancelReservation = mutation({
  args: {
    threadId: v.string(),
    reservationId: v.string(),
    requestedAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    const thread = await ensureThread(ctx, args.threadId, "reservation");
    const reservation = await resolveThreadReservation(
      ctx,
      args.threadId,
      args.reservationId,
    );
    if (!reservation) {
      throw new Error("reservation_not_found");
    }

    const escalated = isInsideCancelWindow(
      reservation.startMs,
      args.requestedAtMs,
    );
    const nextStatus = escalated ? "escalated" : "cancelled";
    const message = escalated
      ? domainConfig.copy.cancelEscalated
      : domainConfig.copy.cancelled;

    await ctx.db.patch(reservation._id, {
      status: nextStatus,
      auditHistory: appendAudit(
        reservation.auditHistory,
        auditEvent(
          escalated ? "reservation.escalated" : "reservation.cancelled",
          escalated ? "escalation" : "reservation",
          escalated
            ? "Cancel request was inside the cancel window."
            : "Reservation cancelled.",
          message,
        ),
      ),
      updatedAtMs: Date.now(),
    });
    const updated = await ctx.db.get(reservation._id);
    if (!updated) {
      throw new Error("reservation_cancel_failed");
    }

    const publicContext = publicContextFromReservation(updated);
    await ctx.db.patch(thread._id, {
      activeAgent: escalated ? "escalation" : "reservation",
      publicContext,
      guardrailBanner: null,
      updatedAtMs: Date.now(),
    });
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: escalated ? "escalation.queued" : "reservation.cancelled",
      role: "system",
      agent: escalated ? "escalation" : "reservation",
      message,
      publicPayload: {
        reservationId: publicContext.reservationId,
      },
    });
    await scheduleReservationEmail(ctx, {
      kind: escalated ? "reservation.escalated" : "reservation.cancelled",
      threadId: args.threadId,
      publicContext,
    });

    return { publicContext, escalated };
  },
});

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
    const thread = await ensureThread(ctx, args.threadId, "reservation");
    const reservation = await resolveThreadReservation(
      ctx,
      args.threadId,
      args.reservationId,
    );
    if (!reservation) {
      throw new Error("reservation_not_found");
    }
    if (
      reservation.status !== "confirmed" &&
      reservation.status !== "rescheduled"
    ) {
      throw new Error("reservation_not_reschedulable");
    }
    if (isInsideCancelWindow(reservation.startMs, args.requestedAtMs)) {
      throw new Error("reschedule_window_closed");
    }

    const resources = await publicResources(ctx);
    const service = serviceByKey(args.serviceKey);
    const resource = resourceByKey(args.resourceKey, service, resources);
    const reservations = await ctx.db
      .query("reservations")
      .withIndex("by_resource_time", (q) =>
        q
          .eq("domainKey", domainConfig.domainKey)
          .eq("resourceKey", resource.key),
      )
      .collect();

    if (args.endMs !== serviceEndMs(service, args.startMs)) {
      throw new Error("slot_duration_mismatch");
    }
    if (!isSlotAllowed(args.startMs, args.endMs, service)) {
      throw new Error("slot_outside_business_hours");
    }
    if (
      hasCollision(
        reservations,
        resource.key,
        args.startMs,
        args.endMs,
        reservation._id,
      )
    ) {
      throw new Error("slot_conflict");
    }

    await ctx.db.patch(reservation._id, {
      serviceKey: service.key,
      serviceLabel: service.label,
      resourceKey: resource.key,
      resourceLabel: resource.label,
      startMs: args.startMs,
      endMs: args.endMs,
      status: "rescheduled",
      holdExpiresAtMs: null,
      auditHistory: appendAudit(
        reservation.auditHistory,
        auditEvent(
          "reservation.rescheduled",
          "reservation",
          "Reservation rescheduled by customer request.",
          domainConfig.copy.rescheduled,
        ),
      ),
      updatedAtMs: Date.now(),
    });
    const updated = await ctx.db.get(reservation._id);
    if (!updated) {
      throw new Error("reservation_reschedule_failed");
    }

    const publicContext = publicContextFromReservation(updated);
    await ctx.db.patch(thread._id, {
      activeAgent: "reservation",
      publicContext,
      guardrailBanner: null,
      suggestedSlots: [],
      updatedAtMs: Date.now(),
    });
    await appendChatEvent(ctx, {
      threadId: args.threadId,
      type: "reservation.rescheduled",
      role: "system",
      agent: "reservation",
      message: domainConfig.copy.rescheduled,
      publicPayload: {
        reservationId: publicContext.reservationId,
      },
    });
    await scheduleReservationEmail(ctx, {
      kind: "reservation.rescheduled",
      threadId: args.threadId,
      publicContext,
    });

    return { publicContext };
  },
});

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

    await expireReservation(ctx, reservation);

    return null;
  },
});

async function ensureThread(
  ctx: MutationCtx,
  threadId: string,
  activeAgent: AgentName,
) {
  const existing = await ctx.db
    .query("chatThreads")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      activeAgent,
      updatedAtMs: Date.now(),
    });
    return {
      ...existing,
      activeAgent,
    };
  }

  const now = Date.now();
  const id = await ctx.db.insert("chatThreads", {
    domainKey: domainConfig.domainKey,
    threadId,
    activeAgent,
    publicContext: defaultPublicContext(),
    guardrailStatus: defaultGuardrailStatus(),
    guardrailBanner: null,
    suggestedSlots: [],
    createdAtMs: now,
    updatedAtMs: now,
  });
  const inserted = await ctx.db.get(id);
  if (!inserted) {
    throw new Error("thread_insert_failed");
  }
  return inserted;
}

async function publicResources(ctx: QueryCtx | MutationCtx) {
  const rows = await ctx.db
    .query("resources")
    .withIndex("by_domain", (q) => q.eq("domainKey", domainConfig.domainKey))
    .collect();
  const activeRows = rows
    .filter((row) => row.active)
    .map((row) => ({
      key: row.key,
      label: row.label,
      kind: row.kind,
    }));

  return activeRows.length > 0 ? activeRows : domainConfig.resources;
}

async function appendChatEvent(
  ctx: MutationCtx,
  event: {
    threadId: string;
    type: string;
    role: "user" | "assistant" | "system";
    agent: AgentName;
    message: string;
    publicPayload: unknown;
  },
) {
  await ctx.db.insert("chatEvents", {
    domainKey: domainConfig.domainKey,
    threadId: event.threadId,
    type: event.type,
    role: event.role,
    agent: event.agent,
    message: event.message,
    publicPayload: event.publicPayload,
    createdAtMs: Date.now(),
  });
}

async function expireReservation(
  ctx: MutationCtx,
  reservation: Doc<"reservations">,
) {
  await ctx.db.patch(reservation._id, {
    status: "expired",
    holdExpiresAtMs: null,
    auditHistory: appendAudit(
      reservation.auditHistory,
      auditEvent(
        "reservation.expired",
        "reservation",
        "Hold expired before customer confirmation.",
        domainConfig.copy.holdExpired,
      ),
    ),
    updatedAtMs: Date.now(),
  });
  const updated = await ctx.db.get(reservation._id);
  if (!updated) {
    return;
  }
  const thread = await ctx.db
    .query("chatThreads")
    .withIndex("by_thread", (q) => q.eq("threadId", reservation.threadId))
    .unique();
  if (thread) {
    await ctx.db.patch(thread._id, {
      activeAgent: "availability",
      publicContext: publicContextFromReservation(updated),
      suggestedSlots: [],
      updatedAtMs: Date.now(),
    });
  }
  await appendChatEvent(ctx, {
    threadId: reservation.threadId,
    type: "reservation.expired",
    role: "system",
    agent: "reservation",
    message: domainConfig.copy.holdExpired,
    publicPayload: {
      reservationId: publicContextFromReservation(updated).reservationId,
    },
  });
}

async function resolveThreadReservation(
  ctx: MutationCtx,
  threadId: string,
  reservationId: string,
) {
  const normalized = normalizeReservationNumber(reservationId);
  const byNumber = await ctx.db
    .query("reservations")
    .withIndex("by_domain_reservation_number", (q) =>
      q
        .eq("domainKey", domainConfig.domainKey)
        .eq("reservationNumber", normalized),
    )
    .unique();
  const reservation =
    byNumber ??
    (isLegacyConvexReservationId(reservationId)
      ? await ctx.db.get(reservationId as Id<"reservations">)
      : null);

  if (
    !reservation ||
    reservation.domainKey !== domainConfig.domainKey ||
    reservation.threadId !== threadId
  ) {
    return null;
  }

  return reservation;
}

async function generateUniqueReservationNumber(
  ctx: MutationCtx,
  createdAtMs: number,
) {
  const prefix = reservationNumberPrefix();
  const datePart = reservationNumberDatePart(createdAtMs);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `${prefix}-${datePart}-${randomSuffix(6)}`;
    const existing = await ctx.db
      .query("reservations")
      .withIndex("by_domain_reservation_number", (q) =>
        q
          .eq("domainKey", domainConfig.domainKey)
          .eq("reservationNumber", candidate),
      )
      .unique();
    if (!existing) {
      return candidate;
    }
  }

  throw new Error("reservation_number_generation_failed");
}

function reservationNumberPrefix() {
  const words = domainConfig.domainKey
    .toUpperCase()
    .split(/[^A-Z0-9]+/g)
    .filter(Boolean);
  const initials = words.map((word) => word[0]).join("");
  const compact =
    initials || domainConfig.domainKey.replace(/[^A-Za-z0-9]/g, "");
  return compact.toUpperCase().slice(0, 4).padEnd(2, "X");
}

function reservationNumberDatePart(timestampMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: domainConfig.storeTimezone,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestampMs);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "00";

  return `${part("year")}${part("month")}${part("day")}`;
}

function randomSuffix(length: number) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const values = new Uint8Array(length);
  if (globalThis.crypto) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * 256);
    }
  }

  return [...values].map((value) => alphabet[value % alphabet.length]).join("");
}

function normalizeReservationNumber(value: string) {
  return value.trim().toUpperCase();
}

function isLegacyConvexReservationId(value: string) {
  return /^[a-z0-9]{20,}$/.test(value);
}
