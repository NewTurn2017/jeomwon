import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import type { AdminReservationAction } from "../src/agent-contract";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  appendAudit,
  auditEvent,
  publicContextFromReservation,
  serviceByKey,
  timeWindowLabel,
} from "./engine/lifecycle";
import { scheduleReservationEmail } from "./reservationEmailScheduler";

const actionValidator = v.union(
  v.literal("approveCancel"),
  v.literal("keepReservation"),
);

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

// The operator allowlist lives in the Convex deployment env, not in the pack:
// who staffs the desk is a deployment fact, not a domain fact.
//
// Read INSIDE the guard, unlike auth.ts, which reads AUTH_DEV_ANONYMOUS once at
// module scope. auth.ts can: its value only shapes the provider list at import
// time, so re-reading it would change nothing. An authorization decision must
// not be frozen into a module that a warm isolate can keep alive — reading per
// call means `npx convex env set JEOMWON_ADMIN_EMAILS ...` binds on the next
// call instead of racing the module cache. The `process.env.X` idiom is the same.
function adminEmailAllowlist() {
  const raw = process.env.JEOMWON_ADMIN_EMAILS ?? "";

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Operator guard. Conditionally fail-closed.
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

  const allowlist = adminEmailAllowlist();
  if (allowlist.length === 0) {
    if (domainConfig.features.customerAccounts) {
      throw new Error("admin_not_configured");
    }

    return userId;
  }

  const user = await ctx.db.get(userId);
  const email = user?.email?.trim().toLowerCase();
  if (!email || !allowlist.includes(email)) {
    throw new Error("admin_forbidden");
  }

  return userId;
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

function toAdminReservation(reservation: Doc<"reservations">) {
  const latestAudit =
    reservation.auditHistory[reservation.auditHistory.length - 1];

  return {
    id:
      reservation.reservationNumber ??
      legacyDisplayReservationNumber(reservation),
    threadId: reservation.threadId,
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
