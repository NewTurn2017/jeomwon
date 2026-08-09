import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import { internalMutation } from "./_generated/server";
import { verifiedRecipientFromUser } from "./engine/customerRecipient";
import { customerThreadId } from "./engine/identity";

const legacyReservationBackfillCap = 256;

/**
 * Guarded internal migration for one verified account's legacy reservations.
 *
 * It is deliberately additive and idempotent: only an unowned customer row in
 * the verified user's exact derived thread is linked. Existing links, operator
 * rows, malformed users, and mismatches are never overwritten or guessed.
 */
export const backfillVerifiedCustomerReservationOwners = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!verifiedRecipientFromUser(user, Date.now())) {
      return { scanned: 0, linked: 0, skipped: 0 };
    }

    const threadId = customerThreadId(args.userId);
    const rows = await ctx.db
      .query("reservations")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .take(legacyReservationBackfillCap + 1);
    if (rows.length > legacyReservationBackfillCap) {
      throw new Error("recipient_backfill_limit_exceeded");
    }

    let linked = 0;
    let skipped = 0;
    for (const reservation of rows) {
      if (
        reservation.domainKey !== domainConfig.domainKey ||
        reservation.origin === "operator" ||
        reservation.customerUserId !== undefined
      ) {
        skipped += 1;
        continue;
      }
      await ctx.db.patch(reservation._id, { customerUserId: args.userId });
      linked += 1;
    }

    return { scanned: rows.length, linked, skipped };
  },
});
