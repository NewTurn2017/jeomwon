import { v } from "convex/values";
import { domainConfig } from "../domain.config";
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
 * `threadId` is OPTIONAL, and that is the whole security fix. With
 * `features.customerAccounts` on, the thread is derived from the authenticated
 * user inside Convex and a mismatched argument is rejected — so this public query
 * can no longer be turned into "read any customer's transcript" by passing their
 * thread string, which `admin:dashboardSnapshot` hands out to operator surfaces.
 * With the flag off, `threadId` is still required and still trusted: an anonymous
 * random-UUID thread is its own bearer secret, exactly as before.
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
    // The event window is flag-gated so the nine anonymous packs are untouched.
    //
    // Flag OFF: oldest-80, exactly as before this file changed. Anonymous threads
    // are short-lived, so pinning the window to the start of the conversation is
    // fine and — more to the point — must stay identical.
    //
    // Flag ON: newest-80. A per-account thread is PERMANENT, so oldest-80 would
    // freeze the customer's view once the thread crosses 80 events and they would
    // never see a new message again. `take` keeps the first n rows it walks, so
    // newest-first + reverse gives the most recent 80 in reading order.
    const eventsQuery = ctx.db
      .query("chatEvents")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId));
    const recentEvents = domainConfig.features.customerAccounts
      ? (await eventsQuery.order("desc").take(80)).reverse()
      : await eventsQuery.order("asc").take(80);
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
        // The customer's full list is `admin:customerSnapshot`, which is scoped by
        // the authenticated user rather than by this single slot.
        reservationCard: publicContext,
        guardrailBanner,
      },
    };
  },
});
