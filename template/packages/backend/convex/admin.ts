import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import type {
  AdminCancelResult,
  AdminReservation,
  AdminReservationAction,
  AdminReservationResult,
} from "../src/agent-contract";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  assertOperatorCalendarCrudEnabled,
  cancelOperatorSession,
  createOperatorSession,
  isOperatorSession,
  resolveSlot,
  updateOperatorSession,
} from "./engine/adminBooking";
import {
  cancelCustomerReservation,
  rescheduleCustomerReservation as rescheduleCustomerReservationLifecycle,
} from "./engine/customerReservationLifecycle";
import {
  isLegacyPublicReservationId,
  legacyPublicReservationLookupCap,
  publicReservationId,
} from "./engine/customerReservationPublicId";
import { adminEmailAllowlist, isOperator } from "./engine/identity";
import {
  appendAudit,
  auditEvent,
  publicContextFromReservation,
  serviceByKey,
  timeWindowLabel,
} from "./engine/lifecycle";
import { onSlotFreed } from "./engine/waitlist";
import { scheduleReservationEmail } from "./reservationEmailScheduler";

const actionValidator = v.union(
  v.literal("approveCancel"),
  v.literal("keepReservation"),
);

const slotArgs = {
  serviceKey: v.string(),
  resourceKey: v.string(),
  dateKey: v.string(),
  startTime: v.string(),
};

export const dashboardSnapshot = query({
  args: {},
  handler: async (ctx) => {
    await ensureAdmin(ctx);

    const resources = await ctx.db
      .query("resources")
      .withIndex("by_domain", (q) => q.eq("domainKey", domainConfig.domainKey))
      .collect();
    const reservations = await ctx.db
      .query("reservations")
      .withIndex("by_domain_status_time", (q) =>
        q.eq("domainKey", domainConfig.domainKey),
      )
      .collect();
    const events = await ctx.db
      .query("chatEvents")
      .withIndex("by_domain_time", (q) =>
        q.eq("domainKey", domainConfig.domainKey),
      )
      .order("desc")
      .take(80);

    const activeResources =
      resources.length > 0
        ? resources
            .filter((resource) => resource.active)
            .map((resource) => ({
              key: resource.key,
              label: resource.label,
              kind: resource.kind,
            }))
        : domainConfig.resources;
    const sortedReservations = reservations
      .slice()
      .sort((a, b) => a.startMs - b.startMs)
      .map(toAdminReservation);

    return {
      domain: {
        domainKey: domainConfig.domainKey,
        storeName: domainConfig.storeName,
        storeTimezone: domainConfig.storeTimezone,
        locale: domainConfig.locale,
        adminWidget: domainConfig.adminWidget,
        businessHours: domainConfig.businessHours,
        resources: activeResources,
        services: domainConfig.services,
        policies: domainConfig.policies,
        // The board reads `features.operatorCalendarCrud` to decide whether the
        // create/edit/cancel affordances exist at all. With the flag off the
        // mutations below refuse anyway; this only keeps the UI honest.
        features: domainConfig.features,
      },
      reservations: sortedReservations,
      escalations: sortedReservations.filter(
        (reservation) => reservation.status === "escalated",
      ),
      events: events.map((event) => ({
        id: event._id,
        threadId: event.threadId,
        type: event.type,
        role: event.role,
        agent: event.agent,
        message: event.message,
        createdAtMs: event.createdAtMs,
      })),
      generatedAtMs: Date.now(),
    };
  },
});

export const resolveEscalation = mutation({
  args: {
    reservationId: v.string(),
    action: actionValidator,
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);

    const reservation = await findReservationByNumber(ctx, args.reservationId);
    if (!reservation) {
      throw new Error("reservation_not_found");
    }
    if (reservation.status !== "escalated") {
      throw new Error("reservation_not_escalated");
    }

    const decision = decisionForAction(args.action);
    await ctx.db.patch(reservation._id, {
      status: decision.status,
      holdExpiresAtMs: null,
      auditHistory: appendAudit(
        reservation.auditHistory,
        auditEvent(
          decision.auditType,
          "escalation",
          decision.summary,
          decision.publicMessage,
        ),
      ),
      updatedAtMs: Date.now(),
    });

    const updated = await ctx.db.get(reservation._id);
    if (!updated) {
      throw new Error("reservation_update_failed");
    }

    const thread = await ctx.db
      .query("chatThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", updated.threadId))
      .unique();
    if (thread) {
      await ctx.db.patch(thread._id, {
        activeAgent: decision.activeAgent,
        publicContext: publicContextFromReservation(updated),
        guardrailBanner: null,
        updatedAtMs: Date.now(),
      });
    }

    await ctx.db.insert("chatEvents", {
      domainKey: domainConfig.domainKey,
      threadId: updated.threadId,
      type: decision.auditType,
      role: "system",
      agent: "escalation",
      message: decision.publicMessage,
      publicPayload: {
        reservationId: publicContextFromReservation(updated).reservationId,
        action: args.action,
      },
      createdAtMs: Date.now(),
    });
    await scheduleReservationEmail(ctx, {
      kind: decision.emailKind,
      threadId: updated.threadId,
      publicContext: publicContextFromReservation(updated),
    });
    if (args.action === "approveCancel") {
      await onSlotFreed(ctx, {
        serviceKey: updated.serviceKey,
        resourceKey: updated.resourceKey,
        startMs: updated.startMs,
        endMs: updated.endMs,
      });
    }

    return {
      reservation: toAdminReservation(updated),
      action: args.action,
    };
  },
});

// --- Operator calendar CRUD (features.operatorCalendarCrud) ------------------
//
// Every mutation below is gated twice: `ensureAdmin` proves who is asking, and
// `assertOperatorCalendarCrudEnabled` proves the pack asked for this feature. A
// pack with the flag off behaves exactly as it did before these mutations
// existed — they throw before touching the database.
//
// The return types are annotated rather than inferred: this module both defines
// Convex functions and reads `api`, and an inferred return type would make the
// generated `api` type depend on itself.

export const createSession = mutation({
  args: {
    title: v.string(),
    ...slotArgs,
  },
  handler: async (ctx, args): Promise<AdminReservationResult> => {
    await ensureAdmin(ctx);
    assertOperatorCalendarCrudEnabled();

    const created = await createOperatorSession(ctx, args);

    return { reservation: toAdminReservation(created) };
  },
});

/**
 * Edit an OPERATOR session. Carries `title`, so it is only ever allowed to run
 * against a row the server itself stamped `origin: "operator"`. A customer row
 * is rejected here and must go through `rescheduleCustomerReservation`, which has
 * no `title` to overwrite the customer's name with.
 */
export const updateSession = mutation({
  args: {
    reservationId: v.string(),
    title: v.string(),
    ...slotArgs,
  },
  handler: async (ctx, args): Promise<AdminReservationResult> => {
    await ensureAdmin(ctx);
    assertOperatorCalendarCrudEnabled();

    const reservation = await requireReservationByNumber(
      ctx,
      args.reservationId,
    );
    if (!isOperatorSession(reservation)) {
      throw new Error("not_an_operator_session");
    }

    const updated = await updateOperatorSession(ctx, reservation, args);

    return { reservation: toAdminReservation(updated) };
  },
});

/**
 * Move a CUSTOMER's reservation from the operator board.
 *
 * There is a customer on the other end, so this calls the same deep lifecycle
 * helper as the canonical customer mutation with an explicit operator actor.
 * The helper owns chat events, email, thread sync, and the cancel-window rule.
 */
export const rescheduleCustomerReservation = mutation({
  args: {
    reservationId: v.string(),
    ...slotArgs,
  },
  handler: async (ctx, args): Promise<AdminReservationResult> => {
    await ensureAdmin(ctx);
    assertOperatorCalendarCrudEnabled();

    const reservation = await requireReservationByNumber(
      ctx,
      args.reservationId,
    );
    if (isOperatorSession(reservation)) {
      throw new Error("not_a_customer_reservation");
    }

    // Server-side wall-clock conversion and the same collision, business-hour,
    // and resource-kind checks the operator sessions get.
    const slot = await resolveSlot(ctx, args, reservation._id);

    await rescheduleCustomerReservationLifecycle(ctx, {
      actor: "operator",
      threadId: reservation.threadId,
      reservationId: customerReservationRef(reservation),
      serviceKey: slot.service.key,
      resourceKey: slot.resource.key,
      startMs: slot.startMs,
    });
    const updated = await requireReservationByNumber(ctx, args.reservationId);

    return { reservation: toAdminReservation(updated) };
  },
});

/**
 * "Delete" from the board is a `cancelled` status transition, never a row
 * deletion: the audit history survives and `onSlotFreed` gets to hand the window
 * to the waitlist.
 *
 * An operator session is cancelled silently — there is no customer to tell. A
 * customer row rides the shared deep lifecycle helper. Inside
 * `policies.cancelWindowHours` it escalates instead of cancelling, and the
 * operator finishes the job through `resolveEscalation`.
 */
export const deleteSession = mutation({
  args: {
    reservationId: v.string(),
  },
  handler: async (ctx, args): Promise<AdminCancelResult> => {
    await ensureAdmin(ctx);
    assertOperatorCalendarCrudEnabled();

    const reservation = await requireReservationByNumber(
      ctx,
      args.reservationId,
    );

    if (isOperatorSession(reservation)) {
      const cancelled = await cancelOperatorSession(ctx, reservation);

      return { reservation: toAdminReservation(cancelled), escalated: false };
    }

    if (reservation.status === "cancelled") {
      throw new Error("reservation_already_cancelled");
    }

    const result = await cancelCustomerReservation(ctx, {
      actor: "operator",
      threadId: reservation.threadId,
      reservationId: customerReservationRef(reservation),
    });
    const updated = await requireReservationByNumber(ctx, args.reservationId);

    return {
      reservation: toAdminReservation(updated),
      escalated: result.escalated,
    };
  },
});

async function requireReservationByNumber(ctx: MutationCtx, value: string) {
  const reservation = await findReservationByNumber(ctx, value);
  if (!reservation) {
    throw new Error("reservation_not_found");
  }

  return reservation;
}

// Admin and customer surfaces hand the deep lifecycle the same public id. A
// no-number row therefore never requires its raw Convex document id to cross a
// public boundary.
function customerReservationRef(reservation: Doc<"reservations">) {
  return publicReservationId(reservation);
}

/**
 * Operator guard. Always fail-closed.
 *
 * The rule itself lives in `engine/identity.isOperator`, shared with viewerRole
 * so the displayed surface and mutation authorization cannot drift.
 *
 * - Missing allowlist: `admin_not_configured` on every feature configuration.
 * - Anonymous, missing-email, and non-matching identities: `admin_forbidden`.
 * - Only a normalized exact non-anonymous email match is accepted.
 */
async function ensureAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("admin_auth_required");
  }

  if (adminEmailAllowlist().length === 0) {
    throw new Error("admin_not_configured");
  }

  if (!(await isOperator(ctx, userId))) {
    throw new Error("admin_forbidden");
  }

  return userId;
}

/**
 * Which surface should the dashboard render for the signed-in viewer?
 *
 * Reuses `isOperator` — the exact rule `ensureAdmin` enforces — so the UI branch
 * can never disagree with what the backend will actually authorize. It answers,
 * never throws: a customer is a valid viewer, not a forbidden one, so throwing
 * here (the way `dashboardSnapshot` does) would turn the customer's own calendar
 * into an error page. The role is decided INSIDE Convex because the operator
 * allowlist lives in the Convex deployment env; the Next process cannot evaluate
 * it from `getUser` alone.
 *
 * A signed-in caller is required (the dashboard layout already redirects anons),
 * but an absent identity resolves to `"customer"` — the surface that leaks
 * nothing — rather than guessing operator.
 */
export const viewerRole = query({
  args: {},
  handler: async (ctx): Promise<"operator" | "customer"> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return "customer";
    }

    return (await isOperator(ctx, userId)) ? "operator" : "customer";
  },
});

function toAdminReservation(
  reservation: Doc<"reservations">,
): AdminReservation {
  const latestAudit =
    reservation.auditHistory[reservation.auditHistory.length - 1];

  return {
    id: publicReservationId(reservation),
    threadId: reservation.threadId,
    // The board's ownership signal. `threadId` above is routing only: it is a
    // client-supplied string on public chat mutations, so anyone could mint one
    // with any prefix. Never branch on it to decide what an operator may edit.
    origin: reservation.origin ?? null,
    displayName: reservation.displayName,
    serviceKey: reservation.serviceKey,
    serviceLabel: reservation.serviceLabel,
    resourceKey: reservation.resourceKey,
    resourceLabel: reservation.resourceLabel,
    startMs: reservation.startMs,
    endMs: reservation.endMs,
    timeWindow: timeWindowLabel(
      reservation.startMs,
      reservation.endMs,
      serviceByKey(reservation.serviceKey),
    ),
    status: reservation.status,
    holdExpiresAtMs: reservation.holdExpiresAtMs,
    auditHistory: reservation.auditHistory,
    internalContext: {
      operatorMemo: latestAudit?.summary ?? null,
      privateDecision:
        reservation.status === "escalated"
          ? "Cancellation request requires operator review."
          : null,
      riskSignals: riskSignalsForReservation(reservation),
      costBasisCents: null,
    },
    createdAtMs: reservation.createdAtMs,
    updatedAtMs: reservation.updatedAtMs,
  };
}

async function findReservationByNumber(
  ctx: QueryCtx | MutationCtx,
  value: string,
) {
  const normalized = value.trim().toUpperCase();
  const byNumber = await ctx.db
    .query("reservations")
    .withIndex("by_domain_reservation_number", (q) =>
      q
        .eq("domainKey", domainConfig.domainKey)
        .eq("reservationNumber", normalized),
    )
    .unique();
  if (byNumber?.domainKey === domainConfig.domainKey) {
    return byNumber;
  }
  if (!isLegacyPublicReservationId(normalized)) {
    return null;
  }

  // Legacy rows predate a stored public lookup key. Keep this compatibility
  // scan finite and reject the whole lookup when the sentinel proves the domain
  // set is incomplete; a partial scan must never select the wrong row.
  const rows = await ctx.db
    .query("reservations")
    .withIndex("by_domain_reservation_number", (q) =>
      q
        .eq("domainKey", domainConfig.domainKey)
        .eq("reservationNumber", undefined),
    )
    .take(legacyPublicReservationLookupCap + 1);
  if (rows.length > legacyPublicReservationLookupCap) {
    return null;
  }
  const matches = rows.filter(
    (reservation) => publicReservationId(reservation) === normalized,
  );
  return matches.length === 1 ? matches[0] : null;
}

function riskSignalsForReservation(reservation: Doc<"reservations">) {
  const signals: string[] = [];

  if (reservation.status === "escalated") {
    signals.push("cancel_window");
  }
  if (
    reservation.status === "held" &&
    reservation.holdExpiresAtMs !== null &&
    reservation.holdExpiresAtMs <= Date.now()
  ) {
    signals.push("hold_expired");
  }

  return signals;
}

function decisionForAction(action: AdminReservationAction) {
  if (action === "approveCancel") {
    return {
      status: "cancelled" as const,
      activeAgent: "reservation" as const,
      auditType: "reservation.cancel_approved",
      summary: "Operator approved the escalated cancellation.",
      publicMessage: domainConfig.copy.cancelled,
      emailKind: "reservation.cancelled" as const,
    };
  }

  return {
    status: "confirmed" as const,
    activeAgent: "reservation" as const,
    auditType: "reservation.cancel_denied",
    summary: "Operator kept the reservation after escalation review.",
    publicMessage: "운영자 확인 결과 예약이 유지되었습니다.",
    emailKind: "reservation.confirmed" as const,
  };
}
