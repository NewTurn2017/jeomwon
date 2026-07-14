import {
  type DomainResource,
  type DomainService,
  domainConfig,
  getHoldDurationMs,
} from "../../domain.config";
import type {
  AgentName,
  ReservationAuditActor,
} from "../../src/agent-contract";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { scheduleReservationEmail } from "../reservationEmailScheduler";
import { hasCollision, isSlotAllowed, serviceEndMs } from "./availability";
import {
  customerReservationThreadReadCap,
  isLegacyPublicReservationId,
  publicReservationId,
} from "./customerReservationPublicId";
import {
  appendAudit,
  auditEvent,
  collisionActiveStatuses,
  defaultGuardrailStatus,
  defaultPublicContext,
  isActiveReservation,
  publicContextFromReservation,
  resourceReservationsOverlapping,
} from "./lifecycle";
import { isInsideCancelWindow } from "./policy";
import { onSlotFreed } from "./waitlist";

type CreateHoldInput = {
  actor?: ReservationLifecycleActor;
  threadId: string;
  displayName: string | null;
  serviceKey: string;
  resourceKey: string;
  startMs: number;
};

type ReservationActionInput = {
  actor?: ReservationLifecycleActor;
  threadId: string;
  reservationId: string;
};

export type ReservationLifecycleActor = "customer" | "operator";

type RescheduleInput = ReservationActionInput & {
  serviceKey: string;
  resourceKey: string;
  startMs: number;
};

export async function createCustomerReservationHold(
  ctx: MutationCtx,
  input: CreateHoldInput,
) {
  const now = Date.now();
  const resources = await publicResources(ctx);
  const service = strictServiceByKey(input.serviceKey);
  const resource = strictResourceByKey(input.resourceKey, service, resources);
  const endMs = serviceEndMs(service, input.startMs);

  if (input.startMs <= now) {
    throw new Error("slot_in_past");
  }
  if (!isSlotAllowed(input.startMs, endMs, service)) {
    throw new Error("slot_outside_business_hours");
  }

  const overlapRead = await resourceReservationsOverlapping(
    ctx,
    resource.key,
    collisionActiveStatuses,
    input.startMs,
    endMs,
  );
  if (
    overlapRead.truncated ||
    hasCollision(overlapRead.reservations, resource.key, input.startMs, endMs)
  ) {
    throw new Error("slot_conflict");
  }

  const holdExpiresAtMs = now + getHoldDurationMs();
  const reservationNumber = await generateUniqueReservationNumber(ctx, now);
  const reservationId = await ctx.db.insert("reservations", {
    domainKey: domainConfig.domainKey,
    threadId: input.threadId,
    reservationNumber,
    displayName: input.displayName,
    serviceKey: service.key,
    serviceLabel: service.label,
    resourceKey: resource.key,
    resourceLabel: resource.label,
    startMs: input.startMs,
    endMs,
    status: "held",
    holdExpiresAtMs,
    origin: "customer",
    auditHistory: [
      auditEvent(
        "reservation.held",
        reservationAuditActor(input.actor),
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
  const thread = await ensureThread(ctx, input.threadId, "reservation");
  await ctx.db.patch(thread._id, {
    activeAgent: "reservation",
    publicContext,
    guardrailBanner: null,
    suggestedSlots: [],
    updatedAtMs: now,
  });
  await appendChatEvent(ctx, {
    threadId: input.threadId,
    type: "reservation.held",
    role: "system",
    agent: "reservation",
    message: domainConfig.copy.holdCreated,
    publicPayload: { reservationId: publicContext.reservationId },
  });
  await ctx.scheduler.runAt(holdExpiresAtMs, internal.agentTools.expireHold, {
    reservationId,
  });

  return { publicContext, holdExpiresAtMs };
}

export async function confirmCustomerReservation(
  ctx: MutationCtx,
  input: ReservationActionInput,
) {
  const now = Date.now();
  const reservation = await requireThreadReservation(ctx, input);
  if (
    reservation.status !== "held" ||
    reservation.holdExpiresAtMs === null ||
    reservation.holdExpiresAtMs <= now
  ) {
    throw new Error("reservation_not_actionable");
  }

  const thread = await ensureThread(ctx, input.threadId, "reservation");
  await ctx.db.patch(reservation._id, {
    status: "confirmed",
    holdExpiresAtMs: null,
    auditHistory: appendAudit(
      reservation.auditHistory,
      auditEvent(
        "reservation.confirmed",
        reservationAuditActor(input.actor),
        "Customer confirmed the held slot.",
        domainConfig.copy.confirmed,
      ),
    ),
    updatedAtMs: now,
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
    updatedAtMs: now,
  });
  await appendChatEvent(ctx, {
    threadId: input.threadId,
    type: "reservation.confirmed",
    role: "system",
    agent: "reservation",
    message: domainConfig.copy.confirmed,
    publicPayload: { reservationId: publicContext.reservationId },
  });
  await scheduleReservationEmail(ctx, {
    kind: "reservation.confirmed",
    threadId: input.threadId,
    publicContext,
  });

  return { publicContext };
}

export async function cancelCustomerReservation(
  ctx: MutationCtx,
  input: ReservationActionInput,
) {
  const now = Date.now();
  const reservation = await requireThreadReservation(ctx, input);
  if (
    reservation.status !== "held" &&
    reservation.status !== "confirmed" &&
    reservation.status !== "rescheduled"
  ) {
    throw new Error("reservation_not_actionable");
  }
  if (
    reservation.status === "held" &&
    (reservation.holdExpiresAtMs === null || reservation.holdExpiresAtMs <= now)
  ) {
    throw new Error("reservation_not_actionable");
  }

  const freesActiveSlot = isActiveReservation(reservation);
  const escalated =
    reservation.status !== "held" &&
    isInsideCancelWindow(reservation.startMs, now);
  const nextStatus = escalated ? "escalated" : "cancelled";
  const message = escalated
    ? domainConfig.copy.cancelEscalated
    : domainConfig.copy.cancelled;
  const thread = await ensureThread(
    ctx,
    input.threadId,
    escalated ? "escalation" : "reservation",
  );

  await ctx.db.patch(reservation._id, {
    status: nextStatus,
    holdExpiresAtMs: null,
    auditHistory: appendAudit(
      reservation.auditHistory,
      auditEvent(
        escalated ? "reservation.escalated" : "reservation.cancelled",
        cancelAuditActor(input.actor, escalated),
        escalated
          ? "Cancel request was inside the cancel window."
          : "Reservation cancelled.",
        message,
      ),
    ),
    updatedAtMs: now,
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
    updatedAtMs: now,
  });
  await appendChatEvent(ctx, {
    threadId: input.threadId,
    type: escalated ? "escalation.queued" : "reservation.cancelled",
    role: "system",
    agent: escalated ? "escalation" : "reservation",
    message,
    publicPayload: { reservationId: publicContext.reservationId },
  });
  await scheduleReservationEmail(ctx, {
    kind: escalated ? "reservation.escalated" : "reservation.cancelled",
    threadId: input.threadId,
    publicContext,
  });
  if (freesActiveSlot && !escalated) {
    await onSlotFreed(ctx, {
      serviceKey: reservation.serviceKey,
      resourceKey: reservation.resourceKey,
      startMs: reservation.startMs,
      endMs: reservation.endMs,
    });
  }

  return { publicContext, escalated };
}

export async function rescheduleCustomerReservation(
  ctx: MutationCtx,
  input: RescheduleInput,
) {
  const now = Date.now();
  const reservation = await requireThreadReservation(ctx, input);
  if (
    reservation.status !== "confirmed" &&
    reservation.status !== "rescheduled"
  ) {
    throw new Error("reservation_not_actionable");
  }
  if (isInsideCancelWindow(reservation.startMs, now)) {
    throw new Error("reservation_not_actionable");
  }
  if (
    input.serviceKey === reservation.serviceKey &&
    input.resourceKey === reservation.resourceKey &&
    input.startMs === reservation.startMs
  ) {
    throw new Error("reservation_not_actionable");
  }

  const resources = await publicResources(ctx);
  const service = strictServiceByKey(input.serviceKey);
  const resource = strictResourceByKey(input.resourceKey, service, resources);
  const endMs = serviceEndMs(service, input.startMs);
  if (input.startMs <= now) {
    throw new Error("slot_in_past");
  }
  if (!isSlotAllowed(input.startMs, endMs, service)) {
    throw new Error("slot_outside_business_hours");
  }

  const overlapRead = await resourceReservationsOverlapping(
    ctx,
    resource.key,
    collisionActiveStatuses,
    input.startMs,
    endMs,
  );
  if (
    overlapRead.truncated ||
    hasCollision(
      overlapRead.reservations,
      resource.key,
      input.startMs,
      endMs,
      reservation._id,
    )
  ) {
    throw new Error("slot_conflict");
  }

  const freedSlot = {
    serviceKey: reservation.serviceKey,
    resourceKey: reservation.resourceKey,
    startMs: reservation.startMs,
    endMs: reservation.endMs,
  };
  const thread = await ensureThread(ctx, input.threadId, "reservation");
  await ctx.db.patch(reservation._id, {
    serviceKey: service.key,
    serviceLabel: service.label,
    resourceKey: resource.key,
    resourceLabel: resource.label,
    startMs: input.startMs,
    endMs,
    status: "rescheduled",
    holdExpiresAtMs: null,
    auditHistory: appendAudit(
      reservation.auditHistory,
      auditEvent(
        "reservation.rescheduled",
        reservationAuditActor(input.actor),
        "Reservation rescheduled by customer request.",
        domainConfig.copy.rescheduled,
      ),
    ),
    updatedAtMs: now,
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
    updatedAtMs: now,
  });
  await appendChatEvent(ctx, {
    threadId: input.threadId,
    type: "reservation.rescheduled",
    role: "system",
    agent: "reservation",
    message: domainConfig.copy.rescheduled,
    publicPayload: { reservationId: publicContext.reservationId },
  });
  await scheduleReservationEmail(ctx, {
    kind: "reservation.rescheduled",
    threadId: input.threadId,
    publicContext,
  });
  await onSlotFreed(ctx, freedSlot);

  return { publicContext };
}

export async function expireCustomerReservationHold(
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
  await onSlotFreed(ctx, {
    serviceKey: reservation.serviceKey,
    resourceKey: reservation.resourceKey,
    startMs: reservation.startMs,
    endMs: reservation.endMs,
  });
}

export async function ensureThread(
  ctx: MutationCtx,
  threadId: string,
  activeAgent: AgentName,
) {
  const existing = await ctx.db
    .query("chatThreads")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { activeAgent, updatedAtMs: Date.now() });
    return { ...existing, activeAgent };
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

export async function publicResources(ctx: QueryCtx | MutationCtx) {
  const rows = await ctx.db
    .query("resources")
    .withIndex("by_domain", (q) => q.eq("domainKey", domainConfig.domainKey))
    .collect();
  const activeRows = rows
    .filter((row) => row.active)
    .map((row) => ({ key: row.key, label: row.label, kind: row.kind }));
  return activeRows.length > 0 ? activeRows : domainConfig.resources;
}

export async function appendChatEvent(
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

export async function resolveThreadReservation(
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
    (isLegacyPublicReservationId(normalized)
      ? await resolveLegacyPublicReservation(ctx, threadId, normalized)
      : isLegacyConvexReservationId(reservationId)
        ? await ctx.db.get(reservationId as Id<"reservations">)
        : null);
  if (
    !reservation ||
    reservation.domainKey !== domainConfig.domainKey ||
    reservation.threadId !== threadId ||
    reservation.origin === "operator"
  ) {
    return null;
  }
  return reservation;
}

async function resolveLegacyPublicReservation(
  ctx: MutationCtx,
  threadId: string,
  reservationId: string,
) {
  const rows = await ctx.db
    .query("reservations")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .take(customerReservationThreadReadCap + 1);
  if (rows.length > customerReservationThreadReadCap) {
    return null;
  }
  const matches = rows.filter(
    (row) =>
      row.domainKey === domainConfig.domainKey &&
      row.origin !== "operator" &&
      publicReservationId(row) === reservationId,
  );
  return matches.length === 1 ? matches[0] : null;
}

export async function generateUniqueReservationNumber(
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

function strictServiceByKey(serviceKey: string) {
  const service = domainConfig.services.find(
    (candidate) => candidate.key === serviceKey,
  );
  if (!service) {
    throw new Error("service_not_found");
  }
  return service;
}

function strictResourceByKey(
  resourceKey: string,
  service: DomainService,
  resources: DomainResource[],
) {
  const resource = resources.find(
    (candidate) =>
      candidate.key === resourceKey && candidate.kind === service.resourceKind,
  );
  if (!resource) {
    throw new Error("resource_not_found");
  }
  return resource;
}

async function requireThreadReservation(
  ctx: MutationCtx,
  input: ReservationActionInput,
) {
  const reservation = await resolveThreadReservation(
    ctx,
    input.threadId,
    input.reservationId,
  );
  if (!reservation) {
    throw new Error("reservation_not_found");
  }
  return reservation;
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

function reservationAuditActor(
  actor: ReservationLifecycleActor | undefined,
): ReservationAuditActor {
  return actor === "operator" ? "operator" : "reservation";
}

function cancelAuditActor(
  actor: ReservationLifecycleActor | undefined,
  escalated: boolean,
): ReservationAuditActor {
  if (actor === "operator") {
    return "operator";
  }
  return escalated ? "escalation" : "reservation";
}
