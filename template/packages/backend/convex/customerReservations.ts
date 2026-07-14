import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import type {
  CustomerReservation,
  CustomerSnapshot,
} from "../src/agent-contract";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { customerAvailableSlots } from "./engine/customerAvailability";
import {
  cancelCustomerReservation,
  confirmCustomerReservation,
  createCustomerReservationHold,
  rescheduleCustomerReservation,
} from "./engine/customerReservationLifecycle";
import {
  customerReservationThreadReadCap,
  publicReservationId,
} from "./engine/customerReservationPublicId";
import {
  assertCustomerAccountsEnabled,
  customerThreadId,
} from "./engine/identity";
import {
  publicDomainSnapshot,
  serviceByKey,
  timeWindowLabel,
} from "./engine/lifecycle";

export const snapshot = query({
  args: {},
  handler: async (ctx): Promise<CustomerSnapshot> => {
    const { userId } = await ensureCustomer(ctx);
    const threadId = customerThreadId(userId);
    const rows = await ctx.db
      .query("reservations")
      .withIndex("by_thread", (index) => index.eq("threadId", threadId))
      .take(customerReservationThreadReadCap + 1);
    if (rows.length > customerReservationThreadReadCap) {
      throw new Error("customer_snapshot_limit_exceeded");
    }

    return {
      domain: publicDomainSnapshot(),
      threadId,
      reservations: rows
        .filter(
          (reservation) =>
            reservation.domainKey === domainConfig.domainKey &&
            reservation.origin !== "operator",
        )
        .sort((left, right) => left.startMs - right.startMs)
        .map(toCustomerReservation),
      generatedAtMs: Date.now(),
    };
  },
});

export const availableSlots = query({
  args: {
    serviceKey: v.string(),
    resourceKey: v.union(v.string(), v.null()),
    preferredStartMs: v.union(v.number(), v.null()),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCustomer(ctx);
    customerThreadId(userId);
    return await customerAvailableSlots(ctx, args);
  },
});

export const createHold = mutation({
  args: {
    serviceKey: v.string(),
    resourceKey: v.string(),
    startMs: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await ensureCustomer(ctx);
    return await createCustomerReservationHold(ctx, {
      actor: "customer",
      threadId: customerThreadId(userId),
      displayName: customerDisplayName(user),
      ...args,
    });
  },
});

export const confirmReservation = mutation({
  args: { reservationId: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await ensureCustomer(ctx);
    return await confirmCustomerReservation(ctx, {
      actor: "customer",
      threadId: customerThreadId(userId),
      reservationId: args.reservationId,
    });
  },
});

export const cancelReservation = mutation({
  args: { reservationId: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await ensureCustomer(ctx);
    return await cancelCustomerReservation(ctx, {
      actor: "customer",
      threadId: customerThreadId(userId),
      reservationId: args.reservationId,
    });
  },
});

export const rescheduleReservation = mutation({
  args: {
    reservationId: v.string(),
    serviceKey: v.string(),
    resourceKey: v.string(),
    startMs: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await ensureCustomer(ctx);
    return await rescheduleCustomerReservation(ctx, {
      actor: "customer",
      threadId: customerThreadId(userId),
      ...args,
    });
  },
});

export async function ensureCustomer(ctx: QueryCtx | MutationCtx) {
  assertCustomerAccountsEnabled();
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("auth_required");
  }
  const user = await ctx.db.get(userId);
  if (user === null) {
    throw new Error("auth_required");
  }
  return { userId, user };
}

function customerDisplayName(user: Doc<"users">): string | null {
  const displayName = user.name?.trim() || user.username?.trim();
  return displayName === undefined || displayName.length === 0
    ? null
    : displayName;
}

function toCustomerReservation(
  reservation: Doc<"reservations">,
): CustomerReservation {
  return {
    id: publicReservationId(reservation),
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
