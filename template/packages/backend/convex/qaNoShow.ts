import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { publicContextFromReservation } from "./engine/lifecycle";
import { markReservationNoShow } from "./engine/noShow";

const fixtureNumbers = {
  positive: "QA-260811-NOSHOW",
  future: "QA-260811-FUTURE",
  ineligible: "QA-260811-INELIG",
} as const;

function assertQaEnabled() {
  if (process.env.JEOMWON_QA_RESET !== "1")
    throw new Error("qa_reset_disabled");
}

export const prepareFixtures = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    assertQaEnabled();
    if (!domainConfig.features.noShow) throw new Error("no_show_disabled");
    const now = Date.now();
    const before = await sideEffectCounts(ctx);
    const accountBillingBefore = await accountBillingState(ctx);
    const service = domainConfig.services[0];
    const resource = domainConfig.resources[0];
    if (!service || !resource) throw new Error("qa_no_show_domain_invalid");
    const common = {
      domainKey: domainConfig.domainKey,
      threadId: args.threadId,
      displayName: "QA No-show",
      serviceKey: service.key,
      serviceLabel: service.label,
      resourceKey: resource.key,
      resourceLabel: resource.label,
      holdExpiresAtMs: null,
      origin: "customer" as const,
      auditHistory: [],
      createdAtMs: now - 120_000,
      updatedAtMs: now - 120_000,
    };
    const positiveId = await ctx.db.insert("reservations", {
      ...common,
      reservationNumber: fixtureNumbers.positive,
      startMs: now - 60_000,
      endMs: now - 30_000,
      status: "confirmed",
    });
    await ctx.db.insert("reservations", {
      ...common,
      reservationNumber: fixtureNumbers.future,
      startMs: now + 60_000,
      endMs: now + 90_000,
      status: "confirmed",
    });
    await ctx.db.insert("reservations", {
      ...common,
      reservationNumber: fixtureNumbers.ineligible,
      startMs: now - 60_000,
      endMs: now - 30_000,
      status: "cancelled",
    });
    const positive = await ctx.db.get(positiveId);
    if (!positive) throw new Error("qa_no_show_fixture_missing");
    await ctx.db.insert("chatThreads", {
      domainKey: domainConfig.domainKey,
      threadId: args.threadId,
      activeAgent: "reservation",
      publicContext: publicContextFromReservation(positive),
      guardrailStatus: {
        relevance: "clear",
        confirmation: "clear",
        privacy: "clear",
      },
      guardrailBanner: null,
      suggestedSlots: [],
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { fixtureNumbers, before, accountBillingBefore };
  },
});

export const markFixture = mutation({
  args: { reservationId: v.string() },
  handler: async (ctx, args) => {
    assertQaEnabled();
    if ((await ctx.auth.getUserIdentity()) === null)
      throw new Error("auth_required");
    if (
      args.reservationId !== fixtureNumbers.positive &&
      args.reservationId !== fixtureNumbers.future &&
      args.reservationId !== fixtureNumbers.ineligible
    ) {
      throw new Error("qa_no_show_fixture_forbidden");
    }
    const reservation = await findFixture(ctx, args.reservationId);
    return await markReservationNoShow(ctx, reservation);
  },
});

export const inspectAccountBillingState = internalQuery({
  args: {},
  handler: async (ctx) => {
    assertQaEnabled();
    return await accountBillingState(ctx);
  },
});

export const inspectFixtures = internalQuery({
  args: {},
  handler: async (ctx) => {
    assertQaEnabled();
    const rows = await Promise.all(
      Object.entries(fixtureNumbers).map(async ([key, number]) => {
        const reservation = await findFixture(ctx, number);
        return {
          key,
          reservationNumber: number,
          status: reservation.status,
          auditTypes: reservation.auditHistory.map((event) => event.type),
        };
      }),
    );
    const positive = await findFixture(ctx, fixtureNumbers.positive);
    const threads = await ctx.db
      .query("chatThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", positive.threadId))
      .collect();
    return {
      rows,
      publicContexts: threads.map((thread) => thread.publicContext),
      sideEffects: await sideEffectCounts(ctx),
      accountBillingState: await accountBillingState(ctx),
    };
  },
});

type DatabaseCtx = Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">;

async function sideEffectCounts(ctx: DatabaseCtx) {
  const reservations = await ctx.db.query("reservations").collect();
  return {
    reservationEmailDeliveries: (
      await ctx.db.query("reservationEmailDeliveries").collect()
    ).length,
    waitlistReservations: reservations.filter(
      (row: Doc<"reservations">) => row.status === "waitlisted",
    ).length,
    chatEvents: (await ctx.db.query("chatEvents").collect()).length,
  };
}

async function accountBillingState(ctx: DatabaseCtx) {
  const jobs = await ctx.db.query("accountDeletionJobs").collect();
  const phases = {
    requested: 0,
    subscription_done: 0,
    storage_done: 0,
    records_redacted: 0,
    auth_deleted: 0,
  };
  let subscriptionCompleted = 0;
  for (const job of jobs) {
    phases[job.phase] += 1;
    if (job.subscriptionCompleted) subscriptionCompleted += 1;
  }
  return {
    source: "accountDeletionJobs.phase+subscriptionCompleted",
    rowCount: jobs.length,
    subscriptionCompleted,
    subscriptionPending: jobs.length - subscriptionCompleted,
    phases,
  } as const;
}

async function findFixture(
  ctx: DatabaseCtx,
  reservationNumber: string,
): Promise<Doc<"reservations">> {
  const row = await ctx.db
    .query("reservations")
    .withIndex("by_domain_reservation_number", (q) =>
      q
        .eq("domainKey", domainConfig.domainKey)
        .eq("reservationNumber", reservationNumber),
    )
    .unique();
  if (!row) throw new Error("qa_no_show_fixture_missing");
  return row;
}
