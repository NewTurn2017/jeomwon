import type { ReservationEmailKind } from "@jeomwon/email/reservation";
import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import type { PublicContext } from "../src/agent-contract";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { reservationEmailModeValidator } from "./email/validators";
import { resolveVerifiedCustomerRecipient } from "./engine/customerRecipient";
import { publicReservationId } from "./engine/customerReservationPublicId";
import { publicContextFromReservation } from "./engine/lifecycle";

const deliveryIdValidator = v.id("reservationEmailDeliveries");
const customerTemplates = new Set<ReservationEmailKind>([
  "reservation.confirmed",
  "reservation.rescheduled",
  "reservation.cancelled",
  "reservation.escalated",
]);

export async function scheduleReservationEmail(
  ctx: MutationCtx,
  input: {
    readonly kind: ReservationEmailKind;
    readonly reservationId: Id<"reservations">;
  },
) {
  if (!domainConfig.features.email) return [];
  const reservation = await ctx.db.get(input.reservationId);
  if (!reservation || reservation.domainKey !== domainConfig.domainKey)
    return [];

  const generation = deliveryGeneration(reservation, input.kind);
  if (generation < 1) return [];

  const deliveryIds: Id<"reservationEmailDeliveries">[] = [];
  const operatorEmail = domainConfig.notificationEmail.trim();
  if (operatorEmail) {
    const operatorId = await createDeliveryIntent(ctx, {
      reservationId: reservation._id,
      audience: "operator",
      template: input.kind,
      generation,
    });
    if (operatorId) deliveryIds.push(operatorId);
  }

  if (
    customerTemplates.has(input.kind) &&
    (await resolveVerifiedCustomerRecipient(ctx, reservation))
  ) {
    const customerId = await createDeliveryIntent(ctx, {
      reservationId: reservation._id,
      audience: "customer",
      template: input.kind,
      generation,
    });
    if (customerId) deliveryIds.push(customerId);
  }

  return deliveryIds;
}

export const prepareReservationEmailDelivery = internalQuery({
  args: { deliveryId: deliveryIdValidator },
  handler: async (ctx, args): Promise<PreparedDelivery> => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (delivery?.status !== "pending") return { state: "noop" };
    return await preparePendingDelivery(ctx, delivery);
  },
});

export const invalidateReservationEmailDelivery = internalMutation({
  args: { deliveryId: deliveryIdValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (delivery?.status !== "pending") return null;
    await ctx.db.patch(delivery._id, {
      status: "invalidated",
      invalidatedReason: "delivery_not_current",
      invalidatedAtMs: Date.now(),
      updatedAtMs: Date.now(),
    });
    return null;
  },
});

export const completeReservationEmailDelivery = internalMutation({
  args: {
    deliveryId: deliveryIdValidator,
    mode: reservationEmailModeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (delivery?.status !== "pending") return null;
    const prepared = await preparePendingDelivery(ctx, delivery);
    if (prepared.state !== "ready") {
      await ctx.db.patch(delivery._id, {
        status: "invalidated",
        invalidatedReason: "delivery_not_current",
        invalidatedAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      return null;
    }

    const now = Date.now();
    await ctx.db.insert("chatEvents", {
      domainKey: domainConfig.domainKey,
      threadId: prepared.threadId,
      type: args.mode === "capture" ? "email.captured" : "email.sent",
      role: "system",
      agent: agentForKind(delivery.template),
      message:
        args.mode === "capture"
          ? "Reservation email captured."
          : "Reservation email sent.",
      publicPayload: {
        audience: delivery.audience,
        template: delivery.template,
        mode: args.mode,
        reservationId: prepared.publicReservationId,
      },
      createdAtMs: now,
    });
    await ctx.db.patch(delivery._id, {
      status: "completed",
      mode: args.mode,
      eventRecorded: true,
      completedAtMs: now,
      updatedAtMs: now,
    });
    return null;
  },
});

async function createDeliveryIntent(
  ctx: MutationCtx,
  input: {
    reservationId: Id<"reservations">;
    audience: "operator" | "customer";
    template: ReservationEmailKind;
    generation: number;
  },
) {
  const existing = await ctx.db
    .query("reservationEmailDeliveries")
    .withIndex("by_reservation_audience_template_generation", (q) =>
      q
        .eq("reservationId", input.reservationId)
        .eq("audience", input.audience)
        .eq("template", input.template)
        .eq("generation", input.generation),
    )
    .unique();
  if (existing) return null;

  const now = Date.now();
  const deliveryId = await ctx.db.insert("reservationEmailDeliveries", {
    ...input,
    status: "pending",
    idempotencyKey: `reservation-email:${crypto.randomUUID()}`,
    eventRecorded: false,
    createdAtMs: now,
    updatedAtMs: now,
  });
  await ctx.scheduler.runAfter(
    0,
    internal.email.reservationActions.sendReservationEmail,
    { deliveryId },
  );
  return deliveryId;
}

async function preparePendingDelivery(
  ctx: Pick<QueryCtx, "db">,
  delivery: Doc<"reservationEmailDeliveries">,
): Promise<PreparedDelivery> {
  if (!domainConfig.features.email) return { state: "invalid" };
  const reservation = await ctx.db.get(delivery.reservationId);
  if (
    !reservation ||
    reservation.domainKey !== domainConfig.domainKey ||
    deliveryGeneration(reservation, delivery.template) !==
      delivery.generation ||
    !templateMatchesStatus(delivery.template, reservation.status)
  ) {
    return { state: "invalid" };
  }

  const recipient =
    delivery.audience === "operator"
      ? domainConfig.notificationEmail.trim()
      : (await resolveVerifiedCustomerRecipient(ctx, reservation))
          ?.normalizedEmail;
  if (!recipient) return { state: "invalid" };

  return {
    state: "ready",
    audience: delivery.audience,
    template: delivery.template,
    recipient,
    idempotencyKey: delivery.idempotencyKey,
    threadId: reservation.threadId,
    publicReservationId: publicReservationId(reservation),
    publicContext: publicContextFromReservation(reservation),
  };
}

type PreparedDelivery =
  | { readonly state: "noop" }
  | { readonly state: "invalid" }
  | {
      readonly state: "ready";
      readonly audience: "operator" | "customer";
      readonly template: ReservationEmailKind;
      readonly recipient: string;
      readonly idempotencyKey: string;
      readonly threadId: string;
      readonly publicReservationId: string;
      readonly publicContext: PublicContext;
    };

function deliveryGeneration(
  reservation: Doc<"reservations">,
  template: ReservationEmailKind,
) {
  const auditType =
    template === "reservation.waitlist_opened" ? "waitlist.notified" : template;
  return reservation.auditHistory.filter((event) => event.type === auditType)
    .length;
}

function templateMatchesStatus(
  template: ReservationEmailKind,
  status: Doc<"reservations">["status"],
) {
  switch (template) {
    case "reservation.confirmed":
      return status === "confirmed";
    case "reservation.rescheduled":
      return status === "rescheduled";
    case "reservation.cancelled":
      return status === "cancelled";
    case "reservation.escalated":
      return status === "escalated";
    case "reservation.waitlist_opened":
      return status === "waitlisted";
  }
}

function agentForKind(kind: ReservationEmailKind) {
  return kind === "reservation.escalated"
    ? ("escalation" as const)
    : ("reservation" as const);
}
