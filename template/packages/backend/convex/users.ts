import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  query,
} from "./_generated/server";
import { publicReservationId } from "./engine/customerReservationPublicId";
import { customerThreadId } from "./engine/identity";
import { polar } from "./subscriptions";
import { username } from "./utils/validators";

const deletionBatchSize = 128;
const deletionLeaseMs = 60_000;

const deletionErrorCode = v.union(
  v.literal("account_deletion_external_failed"),
  v.literal("account_deletion_storage_failed"),
  v.literal("account_deletion_retryable"),
  v.literal("account_deletion_finalization_failed"),
);

export type AccountDeletionErrorCode =
  | "account_deletion_in_progress"
  | "account_deletion_external_failed"
  | "account_deletion_storage_failed"
  | "account_deletion_retryable"
  | "account_deletion_finalization_failed";

function stableError(code: AccountDeletionErrorCode): Error {
  return new Error(code);
}

export const getUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const user = await ctx.db.get(userId);
    if (!user) return;
    const subscription = await polar.getCurrentSubscription(ctx, {
      userId: user._id,
    });
    const deletionJob = await ctx.db
      .query("accountDeletionJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      ...user,
      name: user.username || user.name,
      subscription,
      accountDeletion: deletionJob
        ? deletionPresentation(deletionJob, Date.now())
        : null,
      avatarUrl: user.imageId
        ? await ctx.storage.getUrl(user.imageId)
        : undefined,
    };
  },
});

export const getAccountDeletionStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const job = await ctx.db
      .query("accountDeletionJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!job) return null;
    return deletionPresentation(job, Date.now());
  },
});

export const updateUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const validatedUsername = username.safeParse(args.username);
    if (!validatedUsername.success)
      throw new Error(validatedUsername.error.message);
    await ctx.db.patch(userId, { username: validatedUsername.data });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("User not found");
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateUserImage = mutation({
  args: { imageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    await ctx.db.patch(userId, { imageId: args.imageId });
  },
});

export const removeUserImage = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    await ctx.db.patch(userId, { imageId: undefined, image: undefined });
  },
});

export const requestAccountDeletion = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.string(),
    attemptToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.attemptToken.trim().length === 0)
      throw stableError("account_deletion_finalization_failed");
    const user = await ctx.db.get(args.userId);
    if (!user) throw stableError("account_deletion_finalization_failed");
    const existing = await ctx.db
      .query("accountDeletionJobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      validateDeletionJob(existing);
      if (
        existing.threadId !== args.threadId ||
        (!existing.errorCode &&
          (existing.leaseExpiresAtMs ??
            existing.updatedAtMs + deletionLeaseMs) > args.nowMs)
      ) {
        throw stableError("account_deletion_in_progress");
      }
      const resumed = {
        attemptToken: args.attemptToken,
        errorCode: undefined,
        leaseExpiresAtMs: args.nowMs + deletionLeaseMs,
        updatedAtMs: args.nowMs,
      };
      await ctx.db.patch(existing._id, resumed);
      return { ...existing, ...resumed };
    }
    const jobId = await ctx.db.insert("accountDeletionJobs", {
      userId: args.userId,
      threadId: args.threadId,
      attemptToken: args.attemptToken,
      phase: "requested",
      reservationCursor: 0,
      chatEventCursor: 0,
      subscriptionCompleted: false,
      storageCompleted: false,
      leaseExpiresAtMs: args.nowMs + deletionLeaseMs,
      requestedAtMs: args.nowMs,
      updatedAtMs: args.nowMs,
    });
    return await ctx.db.get(jobId);
  },
});

export const getAccountDeletionSnapshot = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("accountDeletionJobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique(),
});

export const markSubscriptionDone = internalMutation({
  args: {
    userId: v.id("users"),
    attemptToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ownedJob(ctx, args.userId, args.attemptToken);
    if (job.phase !== "requested") return job;
    await ctx.db.patch(job._id, {
      phase: "subscription_done",
      subscriptionCompleted: true,
      errorCode: undefined,
      updatedAtMs: args.nowMs,
    });
    return {
      ...job,
      phase: "subscription_done" as const,
      subscriptionCompleted: true,
      errorCode: undefined,
      updatedAtMs: args.nowMs,
    };
  },
});

export const deleteAvatarAndMarkStorageDone = internalMutation({
  args: {
    userId: v.id("users"),
    attemptToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ownedJob(ctx, args.userId, args.attemptToken);
    if (job.phase !== "subscription_done") return job;
    const user = await ctx.db.get(args.userId);
    if (!user) throw stableError("account_deletion_finalization_failed");
    if (user.imageId) await ctx.storage.delete(user.imageId);
    await ctx.db.patch(user._id, { imageId: undefined, image: undefined });
    await ctx.db.patch(job._id, {
      phase: "storage_done",
      storageCompleted: true,
      errorCode: undefined,
      updatedAtMs: args.nowMs,
    });
    return {
      ...job,
      phase: "storage_done" as const,
      storageCompleted: true,
      errorCode: undefined,
      updatedAtMs: args.nowMs,
    };
  },
});

export const redactAccountRecordsBatch = internalMutation({
  args: {
    userId: v.id("users"),
    attemptToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ownedJob(ctx, args.userId, args.attemptToken);
    if (job.phase !== "storage_done") return job;

    const linked = await ctx.db
      .query("reservations")
      .withIndex("by_customer_user", (q) => q.eq("customerUserId", args.userId))
      .order("asc")
      .take(deletionBatchSize);
    const legacy = await ctx.db
      .query("reservations")
      .withIndex("by_thread", (q) => q.eq("threadId", job.threadId))
      .order("asc")
      .take(deletionBatchSize);
    const reservationBatch = [
      ...new Map([...linked, ...legacy].map((row) => [row._id, row])).values(),
    ].slice(0, deletionBatchSize);
    for (const reservation of reservationBatch) {
      const pendingDeliveries = await ctx.db
        .query("reservationEmailDeliveries")
        .withIndex("by_reservation", (q) =>
          q.eq("reservationId", reservation._id),
        )
        .collect();
      for (const delivery of pendingDeliveries) {
        if (delivery.status !== "pending") continue;
        await ctx.db.patch(delivery._id, {
          status: "invalidated",
          invalidatedReason: "account_deleted",
          invalidatedAtMs: args.nowMs,
          updatedAtMs: args.nowMs,
        });
      }
      await ctx.db.patch(reservation._id, {
        displayName: null,
        customerUserId: undefined,
        threadId: `deleted:${publicReservationId(reservation)}`,
      });
    }

    const eventBatch = await ctx.db
      .query("chatEvents")
      .withIndex("by_thread", (q) => q.eq("threadId", job.threadId))
      .order("asc")
      .take(deletionBatchSize);
    for (const event of eventBatch) await ctx.db.delete(event._id);

    const threadBatch =
      reservationBatch.length === 0 && eventBatch.length === 0
        ? await ctx.db
            .query("chatThreads")
            .withIndex("by_thread", (q) => q.eq("threadId", job.threadId))
            .take(deletionBatchSize)
        : [];
    for (const thread of threadBatch) await ctx.db.delete(thread._id);

    const reservationCursor = job.reservationCursor + reservationBatch.length;
    const chatEventCursor = job.chatEventCursor + eventBatch.length;
    const done =
      reservationBatch.length === 0 &&
      eventBatch.length === 0 &&
      threadBatch.length < deletionBatchSize;
    const patch = {
      reservationCursor,
      chatEventCursor,
      phase: done ? ("records_redacted" as const) : ("storage_done" as const),
      errorCode: undefined,
      updatedAtMs: args.nowMs,
    };
    await ctx.db.patch(job._id, patch);
    return { ...job, ...patch };
  },
});

export const deleteAccountAuth = internalMutation({
  args: {
    userId: v.id("users"),
    attemptToken: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ownedJob(ctx, args.userId, args.attemptToken);
    if (job.phase !== "records_redacted") return job;
    const user = await ctx.db.get(args.userId);
    if (!user) throw stableError("account_deletion_finalization_failed");
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) await ctx.db.delete(code._id);
    }
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of refreshTokens) await ctx.db.delete(token._id);
    }
    for (const session of sessions) await ctx.db.delete(session._id);
    for (const session of sessions) {
      const verifiers = await ctx.db.query("authVerifiers").collect();
      for (const verifier of verifiers)
        if (verifier.sessionId === session._id)
          await ctx.db.delete(verifier._id);
    }
    for (const account of accounts) await ctx.db.delete(account._id);
    const identifiers = [user.email, user.phone]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    for (const identifier of new Set(identifiers)) {
      const limits = await ctx.db
        .query("authRateLimits")
        .withIndex("identifier", (q) => q.eq("identifier", identifier))
        .collect();
      for (const limit of limits) await ctx.db.delete(limit._id);
    }
    const patch = {
      phase: "auth_deleted" as const,
      errorCode: undefined,
      updatedAtMs: args.nowMs,
    };
    await ctx.db.patch(job._id, patch);
    return { ...job, ...patch };
  },
});

export const finalizeAccountDeletion = internalMutation({
  args: { userId: v.id("users"), attemptToken: v.string() },
  handler: async (ctx, args) => {
    const job = await ownedJob(ctx, args.userId, args.attemptToken);
    if (job.phase !== "auth_deleted")
      throw stableError("account_deletion_finalization_failed");
    const user = await ctx.db.get(args.userId);
    if (!user) throw stableError("account_deletion_finalization_failed");
    await ctx.db.delete(user._id);
    await ctx.db.delete(job._id);
    return { phase: "complete" as const };
  },
});

export const recordAccountDeletionFailure = internalMutation({
  args: {
    userId: v.id("users"),
    attemptToken: v.string(),
    code: deletionErrorCode,
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ownedJob(ctx, args.userId, args.attemptToken);
    if (!failureCodeMatchesPhase(args.code, job.phase))
      throw stableError("account_deletion_finalization_failed");
    await ctx.db.patch(job._id, {
      errorCode: args.code,
      leaseExpiresAtMs: undefined,
      updatedAtMs: args.nowMs,
    });
    return {
      ...job,
      errorCode: args.code,
      leaseExpiresAtMs: undefined,
      updatedAtMs: args.nowMs,
    };
  },
});

export const deleteCurrentUserAccount = action({
  args: {},
  handler: async (ctx): Promise<{ status: "complete" }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw stableError("account_deletion_finalization_failed");
    const user = await ctx.runQuery(api.users.getUser);
    if (!user) throw stableError("account_deletion_finalization_failed");
    const nowMs = Date.now();
    let job = await ctx.runMutation(internal.users.requestAccountDeletion, {
      userId,
      threadId: customerThreadId(userId),
      attemptToken: crypto.randomUUID(),
      nowMs,
    });
    if (!job?.attemptToken)
      throw stableError("account_deletion_finalization_failed");
    const attemptToken = job.attemptToken;

    if (job.phase === "requested") {
      try {
        if (user.subscription) {
          await ctx.runAction(api.subscriptions.cancelCurrentSubscription, {
            revokeImmediately: true,
          });
        }
        job = await ctx.runMutation(internal.users.markSubscriptionDone, {
          userId,
          attemptToken,
          nowMs: Date.now(),
        });
      } catch {
        await recordFailure(
          ctx,
          userId,
          attemptToken,
          "account_deletion_external_failed",
        );
        throw stableError("account_deletion_external_failed");
      }
    }
    if (job.phase === "subscription_done") {
      try {
        job = await ctx.runMutation(
          internal.users.deleteAvatarAndMarkStorageDone,
          { userId, attemptToken, nowMs: Date.now() },
        );
      } catch {
        await recordFailure(
          ctx,
          userId,
          attemptToken,
          "account_deletion_storage_failed",
        );
        throw stableError("account_deletion_storage_failed");
      }
    }
    try {
      for (
        let batch = 0;
        job.phase === "storage_done" && batch < 64;
        batch += 1
      ) {
        job = await ctx.runMutation(internal.users.redactAccountRecordsBatch, {
          userId,
          attemptToken,
          nowMs: Date.now(),
        });
      }
      if (job.phase === "storage_done")
        throw stableError("account_deletion_retryable");
      if (job.phase === "records_redacted") {
        job = await ctx.runMutation(internal.users.deleteAccountAuth, {
          userId,
          attemptToken,
          nowMs: Date.now(),
        });
      }
    } catch {
      await recordFailure(
        ctx,
        userId,
        attemptToken,
        "account_deletion_retryable",
      );
      throw stableError("account_deletion_retryable");
    }
    if (job.phase !== "auth_deleted") {
      await recordFailure(
        ctx,
        userId,
        attemptToken,
        "account_deletion_finalization_failed",
      );
      throw stableError("account_deletion_finalization_failed");
    }
    try {
      await ctx.runMutation(internal.users.finalizeAccountDeletion, {
        userId,
        attemptToken,
      });
      return { status: "complete" };
    } catch {
      await recordFailure(
        ctx,
        userId,
        attemptToken,
        "account_deletion_finalization_failed",
      );
      throw stableError("account_deletion_finalization_failed");
    }
  },
});

function deletionPresentation(job: Doc<"accountDeletionJobs">, nowMs: number) {
  const leaseExpired =
    (job.leaseExpiresAtMs ?? job.updatedAtMs + deletionLeaseMs) <= nowMs;
  return {
    phase: job.phase,
    status:
      job.errorCode || leaseExpired
        ? ("retryable" as const)
        : ("pending" as const),
    errorCode:
      job.errorCode ??
      (leaseExpired ? "account_deletion_retryable" : undefined),
  };
}

function validateDeletionJob(job: Doc<"accountDeletionJobs">) {
  const flagsByPhase = {
    requested: [false, false],
    subscription_done: [true, false],
    storage_done: [true, true],
    records_redacted: [true, true],
    auth_deleted: [true, true],
  } as const;
  const [subscriptionCompleted, storageCompleted] = flagsByPhase[job.phase];
  const cursorsValid =
    Number.isSafeInteger(job.reservationCursor) &&
    job.reservationCursor >= 0 &&
    Number.isSafeInteger(job.chatEventCursor) &&
    job.chatEventCursor >= 0;
  const timestampsValid =
    Number.isFinite(job.requestedAtMs) &&
    Number.isFinite(job.updatedAtMs) &&
    job.requestedAtMs <= job.updatedAtMs &&
    (job.leaseExpiresAtMs === undefined ||
      Number.isFinite(job.leaseExpiresAtMs));
  const errorPhaseValid =
    job.errorCode === undefined ||
    failureCodeMatchesPhase(job.errorCode, job.phase);
  if (
    job.subscriptionCompleted !== subscriptionCompleted ||
    job.storageCompleted !== storageCompleted ||
    !cursorsValid ||
    !timestampsValid ||
    !errorPhaseValid
  ) {
    throw stableError("account_deletion_finalization_failed");
  }
}

function failureCodeMatchesPhase(
  code: Exclude<AccountDeletionErrorCode, "account_deletion_in_progress">,
  phase: Doc<"accountDeletionJobs">["phase"],
) {
  return (
    code === "account_deletion_finalization_failed" ||
    (code === "account_deletion_external_failed" && phase === "requested") ||
    (code === "account_deletion_storage_failed" &&
      phase === "subscription_done") ||
    (code === "account_deletion_retryable" &&
      (phase === "storage_done" || phase === "records_redacted"))
  );
}

async function ownedJob(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
  attemptToken: string,
): Promise<Doc<"accountDeletionJobs">> {
  const job = await requiredJob(ctx, userId);
  if (!job.attemptToken || job.attemptToken !== attemptToken)
    throw stableError("account_deletion_in_progress");
  validateDeletionJob(job);
  return job;
}

async function requiredJob(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<Doc<"accountDeletionJobs">> {
  const job = await ctx.db
    .query("accountDeletionJobs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!job) throw stableError("account_deletion_finalization_failed");
  return job;
}

async function recordFailure(
  ctx: Pick<ActionCtx, "runMutation">,
  userId: Id<"users">,
  attemptToken: string,
  code: Exclude<AccountDeletionErrorCode, "account_deletion_in_progress">,
) {
  await ctx.runMutation(internal.users.recordAccountDeletionFailure, {
    userId,
    attemptToken,
    code,
    nowMs: Date.now(),
  });
}
