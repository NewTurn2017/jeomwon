import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import type {
  AdminCancelResult,
  AdminReservation,
  AdminReservationAction,
  AdminReservationResult,
  CustomerReservation,
  CustomerSnapshot,
} from "../src/agent-contract";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
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
  adminEmailAllowlist,
  assertCustomerAccountsEnabled,
  customerThreadId,
  isOperator,
} from "./engine/identity";
import {
  appendAudit,
  auditEvent,
  publicContextFromReservation,
  publicDomainSnapshot,
  serviceByKey,
  timeWindowLabel,
} from "./engine/lifecycle";
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
 * There is a customer on the other end, so this rides the chat path's existing
 * notification chain — `agentTools:rescheduleReservation` writes the chat event,
 * schedules the reservation mail, and resyncs `chatThreads.publicContext` — rather
 * than reimplementing any of it. It also keeps `policies.cancelWindowHours` where
 * it belongs: that mutation rejects a move inside the window, and this one does
 * not get to override it.
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

    await ctx.runMutation(api.agentTools.rescheduleReservation, {
      threadId: reservation.threadId,
      reservationId: customerReservationRef(reservation),
      serviceKey: slot.service.key,
      resourceKey: slot.resource.key,
      startMs: slot.startMs,
      endMs: slot.endMs,
      requestedAtMs: Date.now(),
    });

    const updated = await appendOperatorAudit(
      ctx,
      reservation._id,
      "operator.customer_rescheduled",
      "Operator rescheduled a customer reservation from the board.",
    );

    return { reservation: toAdminReservation(updated) };
  },
});

/**
 * "Delete" from the board is a `cancelled` status transition, never a row
 * deletion: the audit history survives and `onSlotFreed` gets to hand the window
 * to the waitlist.
 *
 * An operator session is cancelled silently — there is no customer to tell. A
 * customer row rides `agentTools:cancelReservation`, which owns the cancel-window
 * rule: inside `policies.cancelWindowHours` it escalates instead of cancelling,
 * and the operator finishes the job through `resolveEscalation`.
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

    const result = await ctx.runMutation(api.agentTools.cancelReservation, {
      threadId: reservation.threadId,
      reservationId: customerReservationRef(reservation),
      requestedAtMs: Date.now(),
    });
    const updated = await appendOperatorAudit(
      ctx,
      reservation._id,
      "operator.customer_cancelled",
      "Operator cancelled a customer reservation from the board.",
    );

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

// The chat mutations resolve a row by its public number, falling back to a legacy
// Convex id for rows minted before numbers existed. Hand them whichever this row
// actually has.
function customerReservationRef(reservation: Doc<"reservations">) {
  return reservation.reservationNumber ?? reservation._id;
}

// Records that the operator, not the customer, initiated the change. The chat
// mutation has already written its own audit entry and notified the customer;
// this only marks who pulled the lever.
async function appendOperatorAudit(
  ctx: MutationCtx,
  reservationId: Id<"reservations">,
  type: string,
  summary: string,
) {
  const current = await ctx.db.get(reservationId);
  if (!current) {
    throw new Error("reservation_not_found");
  }

  await ctx.db.patch(reservationId, {
    auditHistory: appendAudit(
      current.auditHistory,
      auditEvent(type, "reservation", summary, null),
    ),
    updatedAtMs: Date.now(),
  });

  const updated = await ctx.db.get(reservationId);
  if (!updated) {
    throw new Error("reservation_not_found");
  }

  return updated;
}

/**
 * Operator guard. Conditionally fail-closed.
 *
 * The rule itself now lives in `engine/identity.isOperator`, because the chat
 * boundary needs the same question answered without throwing: `admin:*` reaches
 * the chat mutations through `ctx.runMutation`, carrying the OPERATOR's identity
 * into a CUSTOMER's thread, and the thread guard there has to recognize them.
 * Two copies of an authorization rule are two chances to drift, so there is one.
 *
 * - Allowlist set: the signed-in user's email must be on it. An account with no
 *   email (the dev anonymous provider) can never match, which is intended.
 * - Allowlist empty, `customerAccounts` false: accept any signed-in user. Only
 *   operators can sign in to such a deployment, so presence is still proof of
 *   role. This is the pre-allowlist behavior, kept exactly so existing generated
 *   apps do not lock their operators out on upgrade.
 * - Allowlist empty, `customerAccounts` true: deny. Customers can sign in to this
 *   deployment, so "any signed-in user is an operator" would hand every customer
 *   the dashboard. There is no safe default here, so refuse to guess.
 */
async function ensureAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("admin_auth_required");
  }

  if (
    adminEmailAllowlist().length === 0 &&
    domainConfig.features.customerAccounts
  ) {
    throw new Error("admin_not_configured");
  }

  if (!(await isOperator(ctx, userId))) {
    throw new Error("admin_forbidden");
  }

  return userId;
}

/**
 * A customer's view of their OWN reservations (`features.customerAccounts`).
 *
 * Takes no arguments, and that is the point: there is no `threadId` to forge,
 * because the thread is derived from the authenticated user inside Convex. The
 * only way to read another customer's rows through this query is to be them.
 *
 * The return type is `CustomerSnapshot`, deliberately NOT `AdminDashboardSnapshot`.
 * Reusing the admin type to "make it compile" would structurally re-introduce
 * `auditHistory`, `internalContext`, other customers' rows, and the escalation
 * queue onto a customer surface — the exact leak apps/app/README.md's
 * PublicContext/InternalContext rule forbids. `toCustomerReservation` below cannot
 * carry those fields because the type has nowhere to put them.
 */
export const customerSnapshot = query({
  args: {},
  handler: async (ctx): Promise<CustomerSnapshot> => {
    assertCustomerAccountsEnabled();
    const { userId } = await ensureCustomer(ctx);
    const threadId = customerThreadId(userId);

    const rows = await ctx.db
      .query("reservations")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    const reservations = rows
      .filter(
        (reservation) =>
          reservation.domainKey === domainConfig.domainKey &&
          // Belt and braces: an operator session can never land on a customer's
          // derived thread, but if one ever did it is the store's row, not theirs.
          reservation.origin !== "operator",
      )
      .sort((a, b) => a.startMs - b.startMs)
      .map(toCustomerReservation);

    return {
      domain: publicDomainSnapshot(),
      threadId,
      reservations,
      generatedAtMs: Date.now(),
    };
  },
});

// The customer-safe projection. No `auditHistory` (operator reasoning), no
// `internalContext` (memos, risk signals, cost basis), no `threadId` per row.
function toCustomerReservation(
  reservation: Doc<"reservations">,
): CustomerReservation {
  return {
    id:
      reservation.reservationNumber ??
      legacyDisplayReservationNumber(reservation),
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
    createdAtMs: reservation.createdAtMs,
    updatedAtMs: reservation.updatedAtMs,
  };
}

/**
 * Customer guard. Asserts a signed-in user and nothing more — it does not consult
 * the operator allowlist. Customer-scoped reads scope themselves by the returned
 * `userId`; that ownership check is the authorization, and it is the caller's job.
 * Never authorize a customer by `threadId`: a thread id is a routing key that
 * anyone can hold, not proof of who is asking.
 */
export async function ensureCustomer(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("auth_required");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("auth_required");
  }

  return { userId, user };
}

function toAdminReservation(
  reservation: Doc<"reservations">,
): AdminReservation {
  const latestAudit =
    reservation.auditHistory[reservation.auditHistory.length - 1];

  return {
    id:
      reservation.reservationNumber ??
      legacyDisplayReservationNumber(reservation),
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
  const reservation = await ctx.db
    .query("reservations")
    .withIndex("by_domain_reservation_number", (q) =>
      q
        .eq("domainKey", domainConfig.domainKey)
        .eq("reservationNumber", value.trim().toUpperCase()),
    )
    .unique();

  return reservation?.domainKey === domainConfig.domainKey ? reservation : null;
}

function legacyDisplayReservationNumber(reservation: Doc<"reservations">) {
  return `UNASSIGNED-${reservation.createdAtMs.toString(36).toUpperCase()}`;
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
