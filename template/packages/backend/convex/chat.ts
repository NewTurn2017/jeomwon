import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveCustomerThreadId } from "./engine/identity";
import {
  defaultGuardrailStatus,
  defaultPublicContext,
  publicDomainSnapshot,
} from "./engine/lifecycle";

export const domainPublicConfig = query({
  args: {},
  handler: async () => publicDomainSnapshot(),
});

/**
 * The customer's view of their own conversation.
 *
 * `threadId` is optional because the thread is derived from the authenticated
 * user inside Convex. A mismatched argument is rejected, so this public query
 * cannot read another customer's transcript by accepting a caller-owned key.
 */
export const publicState = query({
  args: {
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const threadId = await resolveCustomerThreadId(ctx, args.threadId);

    const thread = await ctx.db
      .query("chatThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();
    // A per-account thread is permanent, so oldest-80 would
    // freeze the customer's view once the thread crosses 80 events and they would
    // never see a new message again. `take` keeps the first n rows it walks, so
    // newest-first + reverse gives the most recent 80 in reading order.
    const recentEvents = (
      await ctx.db
        .query("chatEvents")
        .withIndex("by_thread", (q) => q.eq("threadId", threadId))
        .order("desc")
        .take(80)
    ).reverse();
    const publicContext = thread?.publicContext ?? defaultPublicContext();
    const guardrailBanner = thread?.guardrailBanner ?? null;

    return {
      domain: publicDomainSnapshot(),
      threadId,
      activeAgent: thread?.activeAgent ?? "triage",
      publicContext,
      guardrailStatus: thread?.guardrailStatus ?? defaultGuardrailStatus(),
      guardrailBanner,
      suggestedSlots: thread?.suggestedSlots ?? [],
      messages: recentEvents.map((event) => ({
        id: event._id,
        type: event.type,
        role: event.role,
        agent: event.agent,
        message: event.message,
        createdAtMs: event.createdAtMs,
        publicPayload: event.publicPayload ?? null,
      })),
      widgets: {
        // One thread carries ONE `publicContext`, and every booking overwrites
        // it, so on a permanent per-account thread this card is the conversation's
        // CURRENT focus — the reservation last touched — not "my reservations".
        // The customer's full list is `customerReservations:snapshot`, which is
        // scoped by the authenticated user rather than by this single slot.
        reservationCard: publicContext,
        guardrailBanner,
      },
    };
  },
});
