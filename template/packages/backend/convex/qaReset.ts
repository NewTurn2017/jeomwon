import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import { internalMutation } from "./_generated/server";

export const resetDomain = internalMutation({
  args: {
    domainKey: v.string(),
  },
  returns: v.object({
    domainKey: v.string(),
    reservations: v.number(),
    chatThreads: v.number(),
    chatEvents: v.number(),
  }),
  handler: async (ctx, args) => {
    // Dev-only QA reset guard. Never set JEOMWON_QA_RESET in production.
    if (process.env.JEOMWON_QA_RESET !== "1") {
      throw new Error(
        "qa_reset_disabled: set Convex deployment env JEOMWON_QA_RESET=1 only on a dev deployment",
      );
    }

    if (args.domainKey !== domainConfig.domainKey) {
      throw new Error(
        `qa_reset_domain_mismatch: expected ${domainConfig.domainKey}`,
      );
    }

    const reservations = await ctx.db
      .query("reservations")
      .withIndex("by_domain_status_time", (q) =>
        q.eq("domainKey", args.domainKey),
      )
      .collect();
    for (const reservation of reservations) {
      await ctx.db.delete(reservation._id);
    }

    const chatThreads = (await ctx.db.query("chatThreads").collect()).filter(
      (thread) => thread.domainKey === args.domainKey,
    );
    for (const thread of chatThreads) {
      await ctx.db.delete(thread._id);
    }

    const chatEvents = await ctx.db
      .query("chatEvents")
      .withIndex("by_domain_time", (q) => q.eq("domainKey", args.domainKey))
      .collect();
    for (const event of chatEvents) {
      await ctx.db.delete(event._id);
    }

    return {
      domainKey: args.domainKey,
      reservations: reservations.length,
      chatThreads: chatThreads.length,
      chatEvents: chatEvents.length,
    };
  },
});
