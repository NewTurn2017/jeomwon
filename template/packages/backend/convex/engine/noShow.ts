import { domainConfig } from "../../domain.config";
import type { PublicContext } from "../../src/agent-contract";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  appendAudit,
  auditEvent,
  publicContextFromReservation,
} from "./lifecycle";

export const noShowAuditType = "reservation.no_show" as const;

export function assertNoShowEnabled() {
  if (!domainConfig.features.noShow || domainConfig.copy.noShow === null) {
    throw new Error("no_show_disabled");
  }
}

/**
 * Irreversibly mark one past confirmed reservation as no-show.
 *
 * This feature owns only the reservation/audit transition and the existing
 * thread's public context. A past start frees no future capacity, so this hook
 * deliberately emits no chat event, email intent, scheduler job, or waitlist
 * notification.
 */
export async function markReservationNoShow(
  ctx: MutationCtx,
  reservation: Doc<"reservations">,
): Promise<{
  reservation: Doc<"reservations">;
  publicContext: PublicContext;
  auditType: typeof noShowAuditType;
}> {
  assertNoShowEnabled();

  if (reservation.status === "no_show") {
    throw new Error("no_show_already_marked");
  }
  if (
    reservation.status !== "confirmed" &&
    reservation.status !== "rescheduled"
  ) {
    throw new Error("no_show_wrong_status");
  }

  const now = Date.now();
  if (reservation.startMs > now) {
    throw new Error("no_show_future");
  }

  await ctx.db.patch(reservation._id, {
    status: "no_show",
    holdExpiresAtMs: null,
    auditHistory: appendAudit(
      reservation.auditHistory,
      auditEvent(
        noShowAuditType,
        "operator",
        "Operator marked the reservation as no-show.",
        domainConfig.copy.noShow,
      ),
    ),
    updatedAtMs: now,
  });

  const updated = await ctx.db.get(reservation._id);
  if (!updated) {
    throw new Error("reservation_update_failed");
  }
  const publicContext = publicContextFromReservation(updated);
  const thread = await ctx.db
    .query("chatThreads")
    .withIndex("by_thread", (query) =>
      query.eq("threadId", reservation.threadId),
    )
    .unique();
  if (thread) {
    await ctx.db.patch(thread._id, {
      activeAgent: "reservation",
      publicContext,
      guardrailBanner: null,
      updatedAtMs: now,
    });
  }

  return { reservation: updated, publicContext, auditType: noShowAuditType };
}
