// Operator-side calendar CRUD (`features.operatorCalendarCrud`).
//
// An operator session is a reservation row the store owns rather than one a
// customer booked through chat: `displayName` carries the session title, the row
// is inserted straight into `confirmed` so it occupies its slot, and `origin` is
// stamped `"operator"` by the server so later writes can recognize it.
//
// Every write goes through the same availability and lifecycle primitives the
// chat mutations use, so collision, business-hour, blackout, and waitlist
// invariants stay owned by the Convex mutation. This file adds no new table and
// no new engine rule; it composes the existing ones.
//
// Ownership rule: an operator row is identified by `origin === "operator"` and by
// nothing else. `threadId` is a client-supplied string on public, unauthenticated
// chat mutations — anyone can mint one with any prefix — so it is a routing key,
// never an authorization or ownership signal.
import {
  type DomainResource,
  type DomainService,
  domainConfig,
} from "../../domain.config";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { generateUniqueReservationNumber } from "../agentTools";
import {
  calendarParts,
  hasCollision,
  isSlotAllowed,
  serviceEndMs,
} from "./availability";
import {
  appendAudit,
  auditEvent,
  resourceByKey,
  serviceByKey,
  timeWindowLabel,
} from "./lifecycle";
import { onSlotFreed } from "./waitlist";

/** A slot the operator points at: store-timezone wall clock, never a browser clock. */
export type OperatorSlotInput = {
  serviceKey: string;
  resourceKey: string;
  dateKey: string;
  startTime: string;
};

/**
 * An operator session carries a title, which lands in `displayName`.
 *
 * A customer row must NEVER be written with this shape: `displayName` there holds
 * the customer's name, and patching a title over it is a PII loss. Customer rows
 * move through `OperatorSlotInput`, which has no `title` field at all.
 */
export type OperatorSessionInput = OperatorSlotInput & {
  title: string;
};

export type ResolvedSlot = {
  service: DomainService;
  resource: DomainResource;
  startMs: number;
  endMs: number;
};

export function assertOperatorCalendarCrudEnabled() {
  if (!domainConfig.features.operatorCalendarCrud) {
    throw new Error("operator_calendar_crud_disabled");
  }
}

/** The ownership marker. Server-set at insert; never derived from the thread. */
export function isOperatorSession(reservation: Doc<"reservations">) {
  return reservation.origin === "operator";
}

export async function createOperatorSession(
  ctx: MutationCtx,
  input: OperatorSessionInput,
) {
  assertOperatorCalendarCrudEnabled();

  const title = requireTitle(input.title);
  const slot = await resolveSlot(ctx, input, null);
  const now = Date.now();
  const reservationNumber = await generateUniqueReservationNumber(ctx, now);
  const reservationId = await ctx.db.insert("reservations", {
    domainKey: domainConfig.domainKey,
    // Routing key for this row's operator-facing audit trail. Not an identity.
    threadId: operatorThreadId(reservationNumber),
    reservationNumber,
    displayName: title,
    serviceKey: slot.service.key,
    serviceLabel: slot.service.label,
    resourceKey: slot.resource.key,
    resourceLabel: slot.resource.label,
    startMs: slot.startMs,
    endMs: slot.endMs,
    status: "confirmed",
    holdExpiresAtMs: null,
    origin: "operator",
    auditHistory: [
      auditEvent(
        "operator.session_created",
        "reservation",
        "Operator created a calendar session.",
        null,
      ),
    ],
    createdAtMs: now,
    updatedAtMs: now,
  });

  const created = await requireReservation(ctx, reservationId);
  await recordOperatorEvent(ctx, created, "operator.session_created");

  return created;
}

export async function updateOperatorSession(
  ctx: MutationCtx,
  reservation: Doc<"reservations">,
  input: OperatorSessionInput,
) {
  assertOperatorCalendarCrudEnabled();
  assertOperatorSession(reservation);
  assertEditableSession(reservation);

  const title = requireTitle(input.title);
  const slot = await resolveSlot(ctx, input, reservation._id);
  const freedSlot = freedSlotFor(reservation, slot);

  await ctx.db.patch(reservation._id, {
    // Safe here and only here: on an operator session `displayName` IS the title.
    displayName: title,
    serviceKey: slot.service.key,
    serviceLabel: slot.service.label,
    resourceKey: slot.resource.key,
    resourceLabel: slot.resource.label,
    startMs: slot.startMs,
    endMs: slot.endMs,
    auditHistory: appendAudit(
      reservation.auditHistory,
      auditEvent(
        "operator.session_updated",
        "reservation",
        "Operator updated a calendar session.",
        null,
      ),
    ),
    updatedAtMs: Date.now(),
  });

  const updated = await requireReservation(ctx, reservation._id);
  await recordOperatorEvent(ctx, updated, "operator.session_updated");

  // The old window is only free once the row no longer occupies it.
  if (freedSlot) {
    await onSlotFreed(ctx, freedSlot);
  }

  return updated;
}

/**
 * Cancel, not delete: the row survives as `cancelled` so the audit history stays
 * readable and `onSlotFreed` can hand the window to the waitlist.
 */
export async function cancelOperatorSession(
  ctx: MutationCtx,
  reservation: Doc<"reservations">,
) {
  assertOperatorCalendarCrudEnabled();
  assertOperatorSession(reservation);

  // Dedupe at the feature boundary: a second delete must not re-audit or re-run
  // the waitlist hook for a window that is already free.
  if (reservation.status === "cancelled") {
    throw new Error("session_already_cancelled");
  }

  await ctx.db.patch(reservation._id, {
    status: "cancelled",
    holdExpiresAtMs: null,
    auditHistory: appendAudit(
      reservation.auditHistory,
      auditEvent(
        "operator.session_cancelled",
        "reservation",
        "Operator cancelled a calendar session.",
        null,
      ),
    ),
    updatedAtMs: Date.now(),
  });

  const cancelled = await requireReservation(ctx, reservation._id);
  await recordOperatorEvent(ctx, cancelled, "operator.session_cancelled");
  await onSlotFreed(ctx, {
    serviceKey: cancelled.serviceKey,
    resourceKey: cancelled.resourceKey,
    startMs: cancelled.startMs,
    endMs: cancelled.endMs,
  });

  return cancelled;
}

/**
 * Turn an operator-supplied wall clock into a validated slot.
 *
 * Shared by the operator-session writes and by the admin edit of a customer row,
 * which is why it takes the title-less `OperatorSlotInput`.
 */
export async function resolveSlot(
  ctx: MutationCtx,
  input: OperatorSlotInput,
  excludeReservationId: Id<"reservations"> | null,
): Promise<ResolvedSlot> {
  const service = serviceByKey(input.serviceKey);
  if (service.key !== input.serviceKey) {
    throw new Error("unknown_service");
  }

  const resources = await activeResources(ctx);
  const resource = resourceByKey(input.resourceKey, service, resources);
  if (resource.key !== input.resourceKey) {
    throw new Error("unknown_resource");
  }
  // The engine matches services to resources by kind. Without this check the
  // operator could park a `person` service on a `room`, and every later
  // availability search would disagree with the board.
  if (resource.kind !== service.resourceKind) {
    throw new Error("resource_kind_mismatch");
  }

  const startMs = wallClockToMs(input.dateKey, input.startTime);
  const endMs = serviceEndMs(service, startMs);

  if (!isSlotAllowed(startMs, endMs, service)) {
    throw new Error("slot_outside_business_hours");
  }

  const reservations = await ctx.db
    .query("reservations")
    .withIndex("by_resource_time", (q) =>
      q.eq("domainKey", domainConfig.domainKey).eq("resourceKey", resource.key),
    )
    .collect();
  if (
    hasCollision(
      reservations,
      resource.key,
      startMs,
      endMs,
      excludeReservationId,
    )
  ) {
    throw new Error("slot_conflict");
  }

  return { service, resource, startMs, endMs };
}

/**
 * Store-timezone wall time to an instant. The UI sends `YYYY-MM-DD` + `HH:MM`;
 * the conversion happens here, on the server, against `domainConfig.storeTimezone`.
 * This is the inverse of the engine's `calendarParts`, which it reuses.
 */
export function wallClockToMs(dateKey: string, startTime: string) {
  const date = parseDateKey(dateKey);
  const clock = parseClock(startTime);
  const naiveUtcMs = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    clock.hour,
    clock.minute,
  );

  // The offset depends on the instant and the instant depends on the offset:
  // guess with the naive-UTC offset, then settle once. One extra pass is enough
  // for every real zone, including one that changes offset that same day.
  const settledMs =
    naiveUtcMs - storeOffsetMs(naiveUtcMs - storeOffsetMs(naiveUtcMs));

  // A wall time a DST jump skipped has no instant. Reject it instead of silently
  // booking the neighbouring hour.
  const parts = calendarParts(settledMs);
  if (
    parts.dateKey !== dateKey ||
    parts.minutesSinceMidnight !== clock.minutesSinceMidnight
  ) {
    throw new Error("invalid_slot_time");
  }

  return settledMs;
}

function assertOperatorSession(reservation: Doc<"reservations">) {
  if (!isOperatorSession(reservation)) {
    throw new Error("not_an_operator_session");
  }
}

// A cancelled (or expired/denied) row is history. Editing it would resurrect a
// freed window without ever re-running the transition that freed it.
function assertEditableSession(reservation: Doc<"reservations">) {
  if (
    reservation.status !== "confirmed" &&
    reservation.status !== "rescheduled"
  ) {
    throw new Error("session_not_editable");
  }
}

function requireTitle(rawTitle: string) {
  const title = rawTitle.trim();
  if (title.length === 0) {
    throw new Error("session_title_required");
  }

  return title;
}

function freedSlotFor(reservation: Doc<"reservations">, slot: ResolvedSlot) {
  const moved =
    reservation.startMs !== slot.startMs ||
    reservation.endMs !== slot.endMs ||
    reservation.resourceKey !== slot.resource.key;

  if (!moved) {
    return null;
  }

  return {
    serviceKey: reservation.serviceKey,
    resourceKey: reservation.resourceKey,
    startMs: reservation.startMs,
    endMs: reservation.endMs,
  };
}

function operatorThreadId(reservationNumber: string) {
  return `operator:${reservationNumber}`;
}

async function activeResources(ctx: MutationCtx): Promise<DomainResource[]> {
  const rows = await ctx.db
    .query("resources")
    .withIndex("by_domain", (q) => q.eq("domainKey", domainConfig.domainKey))
    .collect();
  const seeded = rows
    .filter((row) => row.active)
    .map((row) => ({ key: row.key, label: row.label, kind: row.kind }));

  return seeded.length > 0 ? seeded : [...domainConfig.resources];
}

async function requireReservation(ctx: MutationCtx, id: Id<"reservations">) {
  const reservation = await ctx.db.get(id);
  if (!reservation) {
    throw new Error("reservation_write_failed");
  }

  return reservation;
}

/**
 * Operator-facing audit event. There is no customer on the other end of an
 * operator session, so nothing is notified and no copy is invented: the message
 * is the row's own labels, which the domain pack already owns.
 */
async function recordOperatorEvent(
  ctx: MutationCtx,
  reservation: Doc<"reservations">,
  type: string,
) {
  const service = serviceByKey(reservation.serviceKey);

  await ctx.db.insert("chatEvents", {
    domainKey: domainConfig.domainKey,
    threadId: reservation.threadId,
    type,
    role: "system",
    agent: "reservation",
    message: [
      reservation.displayName ?? reservation.serviceLabel,
      reservation.resourceLabel,
      timeWindowLabel(reservation.startMs, reservation.endMs, service),
    ].join(" · "),
    publicPayload: {
      reservationId: reservation.reservationNumber ?? null,
    },
    createdAtMs: Date.now(),
  });
}

function storeOffsetMs(utcMs: number) {
  const parts = calendarParts(utcMs);
  const date = parseDateKey(parts.dateKey);
  const wallAsUtcMs =
    Date.UTC(date.year, date.month - 1, date.day) +
    parts.minutesSinceMidnight * 60 * 1000;

  return wallAsUtcMs - utcMs;
}

function parseDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("invalid_slot_time");
  }

  return {
    year: Number.parseInt(dateKey.slice(0, 4), 10),
    month: Number.parseInt(dateKey.slice(5, 7), 10),
    day: Number.parseInt(dateKey.slice(8, 10), 10),
  };
}

function parseClock(startTime: string) {
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    throw new Error("invalid_slot_time");
  }

  const hour = Number.parseInt(startTime.slice(0, 2), 10);
  const minute = Number.parseInt(startTime.slice(3, 5), 10);
  if (hour > 23 || minute > 59) {
    throw new Error("invalid_slot_time");
  }

  return { hour, minute, minutesSinceMidnight: hour * 60 + minute };
}
