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
} from "./jeomwonLib";
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

async function ensureAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("admin_auth_required");
  }

  return userId;
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
