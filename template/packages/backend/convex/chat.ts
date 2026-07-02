import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  defaultGuardrailStatus,
  defaultPublicContext,
  publicDomainSnapshot,
} from "./jeomwonLib";

export const domainPublicConfig = query({
  args: {},
  handler: async () => publicDomainSnapshot(),
});

export const publicState = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("chatThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .unique();
    const events = await ctx.db
      .query("chatEvents")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(80);
    const publicContext = thread?.publicContext ?? defaultPublicContext();
    const guardrailBanner = thread?.guardrailBanner ?? null;

    return {
      domain: publicDomainSnapshot(),
      threadId: args.threadId,
      activeAgent: thread?.activeAgent ?? "triage",
      publicContext,
      guardrailStatus: thread?.guardrailStatus ?? defaultGuardrailStatus(),
      guardrailBanner,
      suggestedSlots: thread?.suggestedSlots ?? [],
      messages: events.map((event) => ({
        id: event._id,
        type: event.type,
        role: event.role,
        agent: event.agent,
        message: event.message,
        createdAtMs: event.createdAtMs,
        publicPayload: event.publicPayload ?? null,
      })),
      widgets: {
        reservationCard: publicContext,
        guardrailBanner,
      },
    };
  },
});
