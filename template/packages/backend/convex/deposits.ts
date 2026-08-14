import { getAuthUserId } from "@convex-dev/auth/server";
import type { WebhookEventHandlers } from "@convex-dev/polar";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { action, internalMutation, query } from "./_generated/server";
import { resolveThreadReservation } from "./engine/customerReservationLifecycle";
import {
  customerReservationThreadReadCap,
  publicReservationId,
} from "./engine/customerReservationPublicId";
import { customerThreadId } from "./engine/identity";
import { appendAudit } from "./engine/lifecycle";
import {
  assertCheckoutOrigin,
  assertCheckoutSuccessUrl,
  polarCheckoutConfiguration,
  polarClientFor,
  polarUserInfo,
} from "./subscriptions";

// A reservation deposit is a one-time Polar order, unrelated to the account
// subscription: it uses its own product, carries the reservation on checkout
// metadata, and comes back on the same webhook the subscription already owns.
export const DEPOSIT_RESERVATION_METADATA_KEY = "jeomwonReservationId";
export const DEPOSIT_DOMAIN_METADATA_KEY = "jeomwonDomainKey";

const depositState = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("refunded"),
);

export type DepositState = "pending" | "paid" | "refunded";

// Structural subset of the Polar order payload this seam reads.
export type DepositOrder = {
  readonly id: string;
  readonly status: string;
  readonly amount: number;
  readonly refundedAmount: number;
  readonly currency: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
};

export function depositProductId() {
  return process.env.POLAR_DEPOSIT_PRODUCT_ID?.trim() ?? "";
}

export function isReservationDepositEnabled() {
  return domainConfig.features.polar && depositProductId().length > 0;
}

function requireDepositProductId() {
  if (!domainConfig.features.polar) {
    throw new Error(
      "Polar billing is disabled for this domain (domain.config.features.polar=false); reservation deposits are not available.",
    );
  }
  const productId = depositProductId();
  if (!productId) {
    throw new Error(
      "POLAR_DEPOSIT_PRODUCT_ID is not set; create a one-time Polar product and set it with the setup wizard or convex env set.",
    );
  }
  return productId;
}

export function depositCheckoutMetadata(documentId: string) {
  return {
    [DEPOSIT_RESERVATION_METADATA_KEY]: documentId,
    [DEPOSIT_DOMAIN_METADATA_KEY]: domainConfig.domainKey,
  };
}

// Only orders this deployment started for this domain may move a reservation.
export function depositReservationFromOrder(order: DepositOrder) {
  const documentId = order.metadata[DEPOSIT_RESERVATION_METADATA_KEY];
  const domainKey = order.metadata[DEPOSIT_DOMAIN_METADATA_KEY];
  if (typeof documentId !== "string" || documentId.length === 0) return null;
  if (domainKey !== domainConfig.domainKey) return null;
  return documentId;
}

const PAID_ORDER_STATUSES = new Set(["paid", "partially_refunded"]);

export function depositFromOrder(order: DepositOrder, atMs: number) {
  const amountMinor = Math.max(0, Math.trunc(order.amount));
  const refundedMinor = Math.max(0, Math.trunc(order.refundedAmount));
  // A partial refund still leaves the deposit held, so only a refund that
  // covers the whole order releases it.
  const state: DepositState =
    refundedMinor > 0 && refundedMinor >= amountMinor
      ? "refunded"
      : PAID_ORDER_STATUSES.has(order.status)
        ? "paid"
        : "pending";
  return {
    state,
    orderId: order.id,
    amountMinor,
    refundedMinor,
    currency: order.currency,
    updatedAtMs: atMs,
  };
}

export const startDepositCheckout = action({
  args: {
    reservationId: v.string(),
    origin: v.string(),
    successUrl: v.string(),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const productId = requireDepositProductId();
    const { applicationOrigins } = polarCheckoutConfiguration(
      "reservation deposit checkout",
    );
    const origin = assertCheckoutOrigin(args.origin, applicationOrigins);
    const successUrl = assertCheckoutSuccessUrl(
      args.successUrl,
      applicationOrigins,
    );
    const { documentId } = await ctx.runMutation(claimDepositCheckoutRef, {
      reservationId: args.reservationId,
    });
    const { userId, email } = await polarUserInfo(ctx);
    const { url } = await polarClientFor(
      "reservation deposit checkout",
    ).createCheckoutSession(ctx, {
      productIds: [productId],
      userId,
      email,
      origin,
      successUrl,
      metadata: depositCheckoutMetadata(documentId),
    });
    if (!args.locale) return { url };
    const localized = new URL(url);
    localized.searchParams.set("locale", args.locale);
    return { url: localized.toString() };
  },
});

// Ownership is decided here, never from the browser: the caller may only pay a
// deposit for a live reservation on their own customer thread.
export const claimDepositCheckout = internalMutation({
  args: { reservationId: v.string() },
  handler: async (ctx, args): Promise<{ documentId: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("auth_required");
    const reservation = await resolveThreadReservation(
      ctx,
      customerThreadId(userId),
      args.reservationId,
      userId,
    );
    if (!reservation) throw new Error("deposit_reservation_not_found");
    if (
      reservation.status === "cancelled" ||
      reservation.status === "expired" ||
      reservation.status === "denied"
    ) {
      throw new Error("deposit_reservation_not_payable");
    }
    return { documentId: reservation._id };
  },
});

export const recordDepositOrder = internalMutation({
  args: {
    documentId: v.string(),
    state: depositState,
    orderId: v.string(),
    amountMinor: v.number(),
    refundedMinor: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args): Promise<{ recorded: boolean }> => {
    const reservation = await readReservation(ctx, args.documentId);
    if (!reservation || reservation.domainKey !== domainConfig.domainKey) {
      return { recorded: false };
    }
    const current = reservation.deposit;
    if (
      current?.orderId === args.orderId &&
      current.state === args.state &&
      current.refundedMinor === args.refundedMinor
    ) {
      return { recorded: false };
    }

    const atMs = Date.now();
    await ctx.db.patch(reservation._id, {
      deposit: {
        state: args.state,
        orderId: args.orderId,
        amountMinor: args.amountMinor,
        refundedMinor: args.refundedMinor,
        currency: args.currency,
        updatedAtMs: atMs,
      },
      auditHistory: appendAudit(reservation.auditHistory, {
        atMs,
        type: `deposit.${args.state}`,
        actor: "reservation",
        summary: `Deposit ${args.state} (order ${args.orderId})`,
        publicMessage: null,
      }),
      updatedAtMs: atMs,
    });
    return { recorded: true };
  },
});

export const depositSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("auth_required");
    const rows = await ctx.db
      .query("reservations")
      .withIndex("by_thread", (index) =>
        index.eq("threadId", customerThreadId(userId)),
      )
      .take(customerReservationThreadReadCap + 1);
    if (rows.length > customerReservationThreadReadCap) {
      throw new Error("customer_snapshot_limit_exceeded");
    }
    return {
      enabled: isReservationDepositEnabled(),
      deposits: rows
        .filter(
          (reservation) =>
            reservation.domainKey === domainConfig.domainKey &&
            reservation.deposit !== undefined &&
            (reservation.customerUserId === undefined ||
              reservation.customerUserId === userId),
        )
        .map((reservation) => ({
          reservationId: publicReservationId(reservation),
          ...reservation.deposit,
        })),
    };
  },
});

// The generated api is written by `convex dev`, so the webhook and the action
// address their own module the same way the app's shared refs do.
const claimDepositCheckoutRef = makeFunctionReference<
  "mutation",
  { reservationId: string },
  { documentId: string }
>("deposits:claimDepositCheckout");

const recordDepositOrderRef = makeFunctionReference<
  "mutation",
  {
    documentId: string;
    state: DepositState;
    orderId: string;
    amountMinor: number;
    refundedMinor: number;
    currency: string;
  },
  { recorded: boolean }
>("deposits:recordDepositOrder");

export const depositWebhookEvents: WebhookEventHandlers = {
  "order.created": async (ctx, event) => {
    await applyDepositOrder(ctx, event);
  },
  "order.refunded": async (ctx, event) => {
    await applyDepositOrder(ctx, event);
  },
};

type DepositWebhookCtx = Parameters<
  NonNullable<WebhookEventHandlers["order.created"]>
>[0];

// The Polar SDK declares every webhook discriminant as optional, so the
// component hands handlers an unnarrowable payload. The order fields this seam
// needs are therefore read defensively instead of asserted.
export function depositOrderFromWebhook(event: unknown): DepositOrder | null {
  const data = isRecord(event) ? event.data : undefined;
  if (!isRecord(data) || !isRecord(data.metadata)) return null;
  const { id, status, currency, amount, refundedAmount } = data;
  if (
    typeof id !== "string" ||
    typeof status !== "string" ||
    typeof currency !== "string" ||
    typeof amount !== "number" ||
    typeof refundedAmount !== "number"
  ) {
    return null;
  }
  return {
    id,
    status,
    currency,
    amount,
    refundedAmount,
    metadata: data.metadata as DepositOrder["metadata"],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function applyDepositOrder(ctx: DepositWebhookCtx, event: unknown) {
  const order = depositOrderFromWebhook(event);
  if (!order) return;
  const documentId = depositReservationFromOrder(order);
  if (!documentId) return;
  const deposit = depositFromOrder(order, Date.now());
  await ctx.runMutation(recordDepositOrderRef, {
    documentId,
    state: deposit.state,
    orderId: deposit.orderId,
    amountMinor: deposit.amountMinor,
    refundedMinor: deposit.refundedMinor,
    currency: deposit.currency,
  });
}

// A webhook can name any document id, so an id that no longer parses or no
// longer exists is a no-op rather than a thrown webhook.
async function readReservation(ctx: MutationCtx, documentId: string) {
  try {
    return await ctx.db.get(documentId as Id<"reservations">);
  } catch {
    return null;
  }
}
