import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { customerThreadId } from "./identity";

export type VerifiedCustomerRecipient = {
  readonly normalizedEmail: string;
  readonly provenance: "users.email";
  readonly verifiedAtMs: number;
  readonly resolvedAtMs: number;
};

const verifiedCustomerRecipientValidator = v.object({
  normalizedEmail: v.string(),
  provenance: v.literal("users.email"),
  verifiedAtMs: v.number(),
  resolvedAtMs: v.number(),
});

/**
 * Private reload boundary for later delivery consumers. The argument contains
 * only the reservation id; callers cannot supply an address, user, thread, or
 * verification claim.
 */
export const getVerifiedCustomerRecipient = internalQuery({
  args: { reservationId: v.id("reservations") },
  returns: v.union(verifiedCustomerRecipientValidator, v.null()),
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) return null;
    return await resolveVerifiedCustomerRecipient(ctx, reservation);
  },
});

/**
 * Resolve delivery eligibility from current private server state.
 *
 * The reservation link is immutable ownership; it is not proof that delivery is
 * currently allowed. Every consumer must reload the linked user and apply the
 * verified-email rule again. `threadId` is checked only for stale/corrupt link
 * detection and never establishes ownership by itself.
 */
export async function resolveVerifiedCustomerRecipient(
  ctx: Pick<QueryCtx, "db">,
  reservation: Pick<
    Doc<"reservations">,
    "origin" | "threadId" | "customerUserId"
  >,
  resolvedAtMs = Date.now(),
): Promise<VerifiedCustomerRecipient | null> {
  if (reservation.origin === "operator" || !reservation.customerUserId) {
    return null;
  }
  if (reservation.threadId !== customerThreadId(reservation.customerUserId)) {
    return null;
  }

  const user = await ctx.db.get(reservation.customerUserId);
  return verifiedRecipientFromUser(user, resolvedAtMs);
}

export function verifiedRecipientFromUser(
  user: Pick<
    Doc<"users">,
    "email" | "emailVerificationTime" | "isAnonymous"
  > | null,
  resolvedAtMs: number,
): VerifiedCustomerRecipient | null {
  if (
    !user ||
    user.isAnonymous === true ||
    user.emailVerificationTime === undefined ||
    !Number.isFinite(user.emailVerificationTime) ||
    !Number.isFinite(resolvedAtMs)
  ) {
    return null;
  }
  const normalizedEmail = user.email?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  return {
    normalizedEmail,
    provenance: "users.email",
    verifiedAtMs: user.emailVerificationTime,
    resolvedAtMs,
  };
}
