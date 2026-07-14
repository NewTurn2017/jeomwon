import { domainConfig } from "../../domain.config";
import type { MutationCtx } from "../_generated/server";
import { scheduleReservationEmail } from "../reservationEmailScheduler";
import {
  appendAudit,
  auditEvent,
  publicContextFromReservation,
} from "./lifecycle";

const waitlistSlotOpenedMessage = "자리가 났어요. 지금 예약 가능합니다.";

export async function onSlotFreed(
  ctx: MutationCtx,
  slot: {
    serviceKey: string;
    resourceKey: string;
    startMs: number;
    endMs: number;
  },
) {
  if (!domainConfig.features.waitlist) {
    return;
  }

  const candidates = await ctx.db
    .query("reservations")
    .withIndex("by_domain_status_time", (q) =>
      q.eq("domainKey", domainConfig.domainKey).eq("status", "waitlisted"),
    )
    .collect();
  const waitlisted = candidates.find(
    (reservation) =>
      reservation.serviceKey === slot.serviceKey &&
      reservation.resourceKey === slot.resourceKey &&
      reservation.startMs < slot.endMs &&
      reservation.endMs > slot.startMs &&
      !reservation.auditHistory.some(
        (event) => event.type === "waitlist.notified",
      ),
  );

  if (!waitlisted) {
    return;
  }

  const publicContext = publicContextFromReservation(waitlisted);
  await ctx.db.insert("chatEvents", {
    domainKey: domainConfig.domainKey,
    threadId: waitlisted.threadId,
    type: "waitlist.slotOpened",
    role: "system",
    agent: "availability",
    message: waitlistSlotOpenedMessage,
    publicPayload: {
      reservationId: publicContext.reservationId,
      serviceKey: slot.serviceKey,
      resourceKey: slot.resourceKey,
      startMs: slot.startMs,
      endMs: slot.endMs,
    },
    createdAtMs: Date.now(),
  });
  await scheduleReservationEmail(ctx, {
    kind: "reservation.waitlist_opened",
    threadId: waitlisted.threadId,
    publicContext,
  });
  await ctx.db.patch(waitlisted._id, {
    auditHistory: appendAudit(
      waitlisted.auditHistory,
      auditEvent(
        "waitlist.notified",
        "availability",
        "Waitlisted customer was notified about an opened slot.",
        waitlistSlotOpenedMessage,
      ),
    ),
    updatedAtMs: Date.now(),
  });
}
