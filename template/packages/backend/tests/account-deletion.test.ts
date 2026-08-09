import { describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import { customerThreadId } from "../convex/engine/identity";
import {
  deleteAccountAuth,
  deleteAvatarAndMarkStorageDone,
  deleteCurrentUserAccount,
  finalizeAccountDeletion,
  getAccountDeletionSnapshot,
  markSubscriptionDone,
  recordAccountDeletionFailure,
  redactAccountRecordsBatch,
  requestAccountDeletion,
} from "../convex/users";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type Failure = "subscription" | "storage" | "records" | "finalization" | null;

const TABLES = [
  "users",
  "accountDeletionJobs",
  "reservations",
  "reservationEmailDeliveries",
  "chatThreads",
  "chatEvents",
  "authAccounts",
  "authSessions",
  "authRefreshTokens",
  "authVerificationCodes",
  "authVerifiers",
  "authRateLimits",
] as const;
type Table = (typeof TABLES)[number];

class Query {
  private filters: Array<[string, unknown]> = [];
  private direction: "asc" | "desc" = "asc";
  constructor(private rows: Row[]) {}
  withIndex(_name: string, configure: (query: Query) => Query) {
    return configure(this);
  }
  eq(field: string, value: unknown) {
    this.filters.push([field, value]);
    return this;
  }
  order(direction: "asc" | "desc") {
    this.direction = direction;
    return this;
  }
  private matches() {
    const rows = this.rows.filter((row) =>
      this.filters.every(([key, value]) => row[key] === value),
    );
    return rows.sort((a, b) =>
      this.direction === "asc"
        ? a._creationTime - b._creationTime
        : b._creationTime - a._creationTime,
    );
  }
  async collect() {
    return this.matches();
  }
  async take(limit: number) {
    return this.matches().slice(0, limit);
  }
  async first() {
    return this.matches()[0] ?? null;
  }
  async unique() {
    const rows = this.matches();
    if (rows.length > 1) throw new Error("fake_unique_multiple_rows");
    return rows[0] ?? null;
  }
}

class Db {
  readonly tables = Object.fromEntries(
    TABLES.map((table) => [table, []]),
  ) as unknown as Record<Table, Row[]>;
  private serial = 1;
  failPatchIdOnce: string | null = null;
  failDeleteIdOnce: string | null = null;
  seed(table: Table, id: string, value: Record<string, unknown>) {
    this.tables[table].push({
      ...value,
      _id: id,
      _creationTime: this.serial++,
    });
  }
  query(table: Table) {
    return new Query(this.tables[table]);
  }
  async get(id: string) {
    return (
      Object.values(this.tables)
        .flat()
        .find((row) => row._id === id) ?? null
    );
  }
  async insert(table: Table, value: Record<string, unknown>) {
    const id = `${table}:${this.serial}`;
    this.seed(table, id, value);
    return id;
  }
  async patch(id: string, value: Record<string, unknown>) {
    if (this.failPatchIdOnce === id) {
      this.failPatchIdOnce = null;
      throw new Error("injected_patch_failure");
    }
    const row = await this.get(id);
    if (!row) throw new Error("fake_patch_missing");
    Object.assign(row, value);
  }
  async delete(id: string) {
    if (this.failDeleteIdOnce === id) {
      this.failDeleteIdOnce = null;
      throw new Error("injected_delete_failure");
    }
    for (const rows of Object.values(this.tables)) {
      const index = rows.findIndex((row) => row._id === id);
      if (index >= 0) {
        rows.splice(index, 1);
        return;
      }
    }
    throw new Error("fake_delete_missing");
  }
}

function handler(registered: unknown) {
  const value = Reflect.get(Object(registered), "_handler");
  if (typeof value !== "function")
    throw new Error("registered_handler_missing");
  return value as (
    ctx: unknown,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

const mutations = new Map<string, unknown>([
  ["users:requestAccountDeletion", requestAccountDeletion],
  ["users:markSubscriptionDone", markSubscriptionDone],
  ["users:deleteAvatarAndMarkStorageDone", deleteAvatarAndMarkStorageDone],
  ["users:redactAccountRecordsBatch", redactAccountRecordsBatch],
  ["users:deleteAccountAuth", deleteAccountAuth],
  ["users:finalizeAccountDeletion", finalizeAccountDeletion],
  ["users:recordAccountDeletionFailure", recordAccountDeletionFailure],
]);

function fullAccount(failure: Failure = null) {
  const db = new Db();
  const userId = "users:target";
  const otherId = "users:other";
  const threadId = customerThreadId(userId as never);
  db.seed("users", userId, {
    email: " Target@Example.COM ",
    phone: " +82101234 ",
    imageId: "storage:avatar",
    name: "Target",
  });
  db.seed("users", otherId, {
    email: "other@example.com",
    imageId: "storage:other",
    name: "Other",
  });
  for (const [suffix, owner] of [
    ["google", userId],
    ["github", userId],
    ["other", otherId],
  ] as const) {
    db.seed("authAccounts", `account:${suffix}`, {
      userId: owner,
      provider: suffix,
      providerAccountId: `${suffix}-pii`,
    });
  }
  for (const suffix of ["a", "b"]) {
    db.seed("authSessions", `session:${suffix}`, {
      userId,
      expirationTime: 99,
    });
    db.seed("authRefreshTokens", `refresh:${suffix}:1`, {
      sessionId: `session:${suffix}`,
      expirationTime: 99,
    });
    db.seed("authRefreshTokens", `refresh:${suffix}:2`, {
      sessionId: `session:${suffix}`,
      parentRefreshTokenId: `refresh:${suffix}:1`,
      expirationTime: 99,
    });
    db.seed("authVerifiers", `verifier:${suffix}`, {
      sessionId: `session:${suffix}`,
      signature: `secret-${suffix}`,
    });
  }
  db.seed("authSessions", "session:other", {
    userId: otherId,
    expirationTime: 99,
  });
  db.seed("authRefreshTokens", "refresh:other", {
    sessionId: "session:other",
    expirationTime: 99,
  });
  db.seed("authVerifiers", "verifier:other", {
    sessionId: "session:other",
    signature: "other-secret",
  });
  db.seed("authVerificationCodes", "code:google", {
    accountId: "account:google",
    provider: "google",
    code: "pii",
    expirationTime: 99,
  });
  db.seed("authVerificationCodes", "code:github", {
    accountId: "account:github",
    provider: "github",
    code: "pii",
    expirationTime: 99,
  });
  db.seed("authVerificationCodes", "code:other", {
    accountId: "account:other",
    provider: "other",
    code: "other",
    expirationTime: 99,
  });
  db.seed("authRateLimits", "rate:email", {
    identifier: "target@example.com",
    attemptsLeft: 1,
    lastAttemptTime: 1,
  });
  db.seed("authRateLimits", "rate:phone", {
    identifier: "+82101234",
    attemptsLeft: 1,
    lastAttemptTime: 1,
  });
  db.seed("authRateLimits", "rate:other", {
    identifier: "other@example.com",
    attemptsLeft: 1,
    lastAttemptTime: 1,
  });
  const reservationBase = {
    domainKey: "domain",
    displayName: "Target PII",
    serviceKey: "service",
    serviceLabel: "Service",
    resourceKey: "resource",
    resourceLabel: "Resource",
    startMs: 10,
    endMs: 20,
    holdExpiresAtMs: null,
    origin: "customer",
    auditHistory: [
      {
        atMs: 1,
        type: "reservation.confirmed",
        actor: "reservation",
        summary: "audit",
        publicMessage: null,
      },
    ],
    createdAtMs: 1,
    updatedAtMs: 2,
  };
  db.seed("reservations", "reservation:active", {
    ...reservationBase,
    threadId,
    customerUserId: userId,
    reservationNumber: "ACTIVE-1",
    status: "confirmed",
  });
  db.seed("reservations", "reservation:history", {
    ...reservationBase,
    threadId,
    reservationNumber: "HISTORY-1",
    status: "cancelled",
  });
  db.seed("reservations", "reservation:other", {
    ...reservationBase,
    threadId: customerThreadId(otherId as never),
    customerUserId: otherId,
    reservationNumber: "OTHER-1",
    displayName: "Other",
    status: "confirmed",
  });
  db.seed("reservationEmailDeliveries", "delivery:target", {
    reservationId: "reservation:active",
    audience: "customer",
    template: "reservation.confirmed",
    generation: 1,
    status: "pending",
    idempotencyKey: "private-target-key",
    eventRecorded: false,
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  db.seed("reservationEmailDeliveries", "delivery:other", {
    reservationId: "reservation:other",
    audience: "customer",
    template: "reservation.confirmed",
    generation: 1,
    status: "pending",
    idempotencyKey: "private-other-key",
    eventRecorded: false,
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  db.seed("chatThreads", "thread:target", {
    threadId,
    domainKey: "domain",
    publicContext: { displayName: "Target PII" },
  });
  db.seed("chatThreads", "thread:other", {
    threadId: customerThreadId(otherId as never),
    domainKey: "domain",
    publicContext: { displayName: "Other" },
  });
  for (let index = 0; index < 257; index++)
    db.seed("chatEvents", `event:${index}`, {
      threadId,
      domainKey: "domain",
      message: `pii-${index}`,
    });
  db.seed("chatEvents", "event:other", {
    threadId: customerThreadId(otherId as never),
    domainKey: "domain",
    message: "other",
  });
  if (failure === "records") db.failPatchIdOnce = "reservation:active";
  if (failure === "finalization") db.failDeleteIdOnce = userId;

  const trace: string[] = [];
  const storageDeletes: string[] = [];
  let cancellationCalls = 0;
  let fail = failure;
  const mutationCtx = {
    db,
    storage: {
      delete: async (id: string) => {
        if (fail === "storage") {
          fail = null;
          throw new Error("storage_down");
        }
        storageDeletes.push(id);
      },
    },
  };
  const actionCtx = {
    auth: {
      getUserIdentity: async () => ({
        subject: userId,
        issuer: "test",
        tokenIdentifier: `test|${userId}`,
      }),
    },
    runQuery: async (reference: unknown, args: unknown) => {
      const name = getFunctionName(reference as never);
      if (name === "users:getUser")
        return {
          ...(await db.get(userId)),
          subscription: { id: "subscription:1" },
        };
      if (name === "users:getAccountDeletionSnapshot")
        return handler(getAccountDeletionSnapshot)(
          { db },
          args as Record<string, unknown>,
        );
      throw new Error(`unexpected_query:${name}`);
    },
    runMutation: async (reference: unknown, args: unknown) => {
      const name = getFunctionName(reference as never);
      const registered = mutations.get(name);
      if (!registered) throw new Error(`unexpected_mutation:${name}`);
      const result = await handler(registered)(
        mutationCtx,
        args as Record<string, unknown>,
      );
      const phase =
        typeof result === "object" && result
          ? Reflect.get(result, "phase")
          : undefined;
      if (typeof phase === "string" && trace[trace.length - 1] !== phase)
        trace.push(phase);
      return result;
    },
    runAction: async (reference: unknown) => {
      const name = getFunctionName(reference as never);
      if (name !== "subscriptions:cancelCurrentSubscription")
        throw new Error(`unexpected_action:${name}`);
      cancellationCalls++;
      if (fail === "subscription") {
        fail = null;
        throw new Error("provider_down");
      }
      return null;
    },
  };
  return {
    db,
    userId,
    otherId,
    threadId,
    trace,
    storageDeletes,
    get cancellationCalls() {
      return cancellationCalls;
    },
    actionCtx,
  };
}

async function run(fixture: ReturnType<typeof fullAccount>) {
  return handler(deleteCurrentUserAccount)(fixture.actionCtx, {});
}

function expectEqual(actual: unknown, expected: unknown) {
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
}

async function expectReject(invocation: Promise<unknown>, code: string) {
  try {
    await invocation;
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toMatch(
      code,
    );
    return;
  }
  throw new Error("expected_rejection");
}

function operationalReservation(row: Row) {
  return {
    reservationNumber: row.reservationNumber,
    serviceKey: row.serviceKey,
    serviceLabel: row.serviceLabel,
    resourceKey: row.resourceKey,
    resourceLabel: row.resourceLabel,
    startMs: row.startMs,
    endMs: row.endMs,
    status: row.status,
    origin: row.origin,
    auditHistory: row.auditHistory,
  };
}

describe("privacy-complete account deletion", () => {
  test("full-account resumes through deterministic batches and preserves operations", async () => {
    const fixture = fullAccount();
    const before = fixture.db.tables.reservations
      .slice(0, 2)
      .map(operationalReservation);
    const otherBefore = JSON.stringify({
      user: await fixture.db.get(fixture.otherId),
      reservation: await fixture.db.get("reservation:other"),
      event: await fixture.db.get("event:other"),
    });

    expectEqual(await run(fixture), { status: "complete" });
    expectEqual(fixture.trace, [
      "requested",
      "subscription_done",
      "storage_done",
      "records_redacted",
      "auth_deleted",
      "complete",
    ]);
    expect(fixture.cancellationCalls).toBe(1);
    expectEqual(fixture.storageDeletes, ["storage:avatar"]);
    expect(
      fixture.db.tables.chatEvents.filter(
        (row) => row.threadId === fixture.threadId,
      ).length,
    ).toBe(0);
    expect(
      fixture.db.tables.chatThreads.filter(
        (row) => row.threadId === fixture.threadId,
      ).length,
    ).toBe(0);
    expectEqual(
      fixture.db.tables.reservations.slice(0, 2).map(operationalReservation),
      before,
    );
    expectEqual(
      fixture.db.tables.reservations.slice(0, 2).map((row) => ({
        displayName: row.displayName,
        customerUserId: row.customerUserId,
        threadId: row.threadId,
      })),
      [
        {
          displayName: null,
          customerUserId: undefined,
          threadId: "deleted:ACTIVE-1",
        },
        {
          displayName: null,
          customerUserId: undefined,
          threadId: "deleted:HISTORY-1",
        },
      ],
    );
    expect(await fixture.db.get(fixture.userId)).toBe(null);
    expect(fixture.db.tables.accountDeletionJobs.length).toBe(0);
    expect(
      fixture.db.tables.reservationEmailDeliveries.find(
        (row) => row._id === "delivery:target",
      )?.status,
    ).toBe("invalidated");
    expect(
      fixture.db.tables.reservationEmailDeliveries.find(
        (row) => row._id === "delivery:target",
      )?.eventRecorded,
    ).toBe(false);
    expect(
      fixture.db.tables.reservationEmailDeliveries.find(
        (row) => row._id === "delivery:other",
      )?.status,
    ).toBe("pending");
    for (const table of [
      "authAccounts",
      "authSessions",
      "authRefreshTokens",
      "authVerificationCodes",
      "authVerifiers",
    ] as const)
      expect(
        fixture.db.tables[table].filter(
          (row) =>
            JSON.stringify(row).includes("target") ||
            JSON.stringify(row).match(/:(a|b)(\b|:)/),
        ).length,
      ).toBe(0);
    expectEqual(
      fixture.db.tables.authRateLimits.map((row) => row.identifier),
      ["other@example.com"],
    );
    expect(
      JSON.stringify({
        user: await fixture.db.get(fixture.otherId),
        reservation: await fixture.db.get("reservation:other"),
        event: await fixture.db.get("event:other"),
      }),
    ).toBe(otherBefore);
  });

  test("persists long-batch cursors and ignores stale cursor values on resume", async () => {
    const fixture = fullAccount();
    const mutationCtx = {
      db: fixture.db,
      storage: {
        delete: async (id: string) => fixture.storageDeletes.push(id),
      },
    };
    let job = await handler(requestAccountDeletion)(mutationCtx, {
      userId: fixture.userId,
      threadId: fixture.threadId,
      attemptToken: "attempt:batch",
      nowMs: 1,
    });
    job = await handler(markSubscriptionDone)(mutationCtx, {
      userId: fixture.userId,
      attemptToken: "attempt:batch",
      nowMs: 2,
    });
    job = await handler(deleteAvatarAndMarkStorageDone)(mutationCtx, {
      userId: fixture.userId,
      attemptToken: "attempt:batch",
      nowMs: 3,
    });
    job = await handler(redactAccountRecordsBatch)(mutationCtx, {
      userId: fixture.userId,
      attemptToken: "attempt:batch",
      nowMs: 4,
    });
    expect(job.phase).toBe("storage_done");
    expect(job.reservationCursor).toBe(2);
    expect(job.chatEventCursor).toBe(128);
    const resumed = await handler(requestAccountDeletion)(mutationCtx, {
      userId: fixture.userId,
      threadId: fixture.threadId,
      attemptToken: "attempt:resumed",
      nowMs: 60_002,
    });
    expect(resumed._id).toBe(job._id);
    expect(resumed.phase).toBe("storage_done");
    fixture.db.tables.chatEvents.reverse();
    job = await handler(redactAccountRecordsBatch)(mutationCtx, {
      userId: fixture.userId,
      attemptToken: "attempt:resumed",
      nowMs: 60_003,
    });
    expect(job.chatEventCursor).toBe(256);
    if (typeof job._id !== "string") throw new Error("test_job_id_missing");
    await fixture.db.patch(job._id, {
      reservationCursor: 99_999,
      chatEventCursor: 99_999,
    });
    expectEqual(await run(fixture), { status: "complete" });
    expect(
      fixture.db.tables.chatEvents.filter(
        (row) => row.threadId === fixture.threadId,
      ).length,
    ).toBe(0);
    expect(fixture.storageDeletes.length).toBe(1);
    expect(fixture.cancellationCalls).toBe(0);
  });

  for (const [failure, code] of [
    ["subscription", "account_deletion_external_failed"],
    ["storage", "account_deletion_storage_failed"],
  ] as const) {
    test(`${failure}-failure persists a retryable gate and resumes once`, async () => {
      const fixture = fullAccount(failure);
      await expectReject(run(fixture), code);
      const job = fixture.db.tables.accountDeletionJobs[0]!;
      expect(job.errorCode).toBe(code);
      expect((await fixture.db.get(fixture.userId)) === null).toBe(false);
      expect(
        fixture.db.tables.authSessions.filter(
          (row) => row.userId === fixture.userId,
        ).length,
      ).toBe(2);
      expect(failure === "subscription" ? job.phase : "subscription_done").toBe(
        job.phase,
      );
      expectEqual(await run(fixture), { status: "complete" });
      expect(fixture.cancellationCalls).toBe(
        failure === "subscription" ? 2 : 1,
      );
      expectEqual(fixture.storageDeletes, ["storage:avatar"]);
    });
  }

  test("record and finalization interruptions persist their exact retry codes", async () => {
    for (const [failure, code, phase] of [
      ["records", "account_deletion_retryable", "storage_done"],
      ["finalization", "account_deletion_finalization_failed", "auth_deleted"],
    ] as const) {
      const fixture = fullAccount(failure);
      await expectReject(run(fixture), code);
      const job = fixture.db.tables.accountDeletionJobs[0];
      if (!job) throw new Error("test_job_missing");
      expect(job.phase).toBe(phase);
      expect(job.errorCode).toBe(code);
      expectEqual(await run(fixture), { status: "complete" });
    }
  });

  test("an old attempt cannot wake after expired-lease takeover", async () => {
    const fixture = fullAccount();
    const mutationCtx = { db: fixture.db, storage: { delete: async () => {} } };
    const first = await handler(requestAccountDeletion)(mutationCtx, {
      userId: fixture.userId,
      threadId: fixture.threadId,
      attemptToken: "attempt:old",
      nowMs: 1,
    });
    expect(first.attemptToken).toBe("attempt:old");
    const takeover = await handler(requestAccountDeletion)(mutationCtx, {
      userId: fixture.userId,
      threadId: fixture.threadId,
      attemptToken: "attempt:new",
      nowMs: 60_002,
    });
    expect(takeover.attemptToken).toBe("attempt:new");
    for (const phaseMutation of [
      markSubscriptionDone,
      deleteAvatarAndMarkStorageDone,
      redactAccountRecordsBatch,
      deleteAccountAuth,
      finalizeAccountDeletion,
      recordAccountDeletionFailure,
    ]) {
      await expectReject(
        handler(phaseMutation)(mutationCtx, {
          userId: fixture.userId,
          attemptToken: "attempt:old",
          code: "account_deletion_retryable",
          nowMs: 60_003,
        }),
        "account_deletion_in_progress",
      );
    }
    const persisted = fixture.db.tables.accountDeletionJobs[0];
    if (!persisted) throw new Error("test_job_missing");
    expect(persisted.phase).toBe("requested");
    expect(persisted.subscriptionCompleted).toBe(false);
    expect(persisted.attemptToken).toBe("attempt:new");
  });

  test("contradictory phase flags fail before storage, records, auth, or finalization effects", async () => {
    const cases = [
      {
        phase: "subscription_done",
        subscriptionCompleted: false,
        storageCompleted: false,
        invoke: deleteAvatarAndMarkStorageDone,
        unchanged: (fixture: ReturnType<typeof fullAccount>) =>
          JSON.stringify({
            user: fixture.db.tables.users[0],
            storageDeletes: fixture.storageDeletes,
          }),
      },
      {
        phase: "storage_done",
        subscriptionCompleted: true,
        storageCompleted: false,
        invoke: redactAccountRecordsBatch,
        unchanged: (fixture: ReturnType<typeof fullAccount>) =>
          JSON.stringify(fixture.db.tables.reservations),
      },
      {
        phase: "records_redacted",
        subscriptionCompleted: false,
        storageCompleted: true,
        invoke: deleteAccountAuth,
        unchanged: (fixture: ReturnType<typeof fullAccount>) =>
          JSON.stringify(fixture.db.tables.authAccounts),
      },
      {
        phase: "auth_deleted",
        subscriptionCompleted: true,
        storageCompleted: false,
        invoke: finalizeAccountDeletion,
        unchanged: (fixture: ReturnType<typeof fullAccount>) =>
          JSON.stringify(fixture.db.tables.users),
      },
    ] as const;
    for (const malformed of cases) {
      const fixture = fullAccount();
      fixture.db.seed("accountDeletionJobs", `job:${malformed.phase}`, {
        userId: fixture.userId,
        threadId: fixture.threadId,
        attemptToken: "attempt:owner",
        phase: malformed.phase,
        reservationCursor: 0,
        chatEventCursor: 0,
        subscriptionCompleted: malformed.subscriptionCompleted,
        storageCompleted: malformed.storageCompleted,
        leaseExpiresAtMs: 100,
        requestedAtMs: 1,
        updatedAtMs: 1,
      });
      const before = malformed.unchanged(fixture);
      await expectReject(
        handler(malformed.invoke)(
          {
            db: fixture.db,
            storage: {
              delete: async (id: string) => fixture.storageDeletes.push(id),
            },
          },
          {
            userId: fixture.userId,
            attemptToken: "attempt:owner",
            nowMs: 2,
          },
        ),
        "account_deletion_finalization_failed",
      );
      expect(malformed.unchanged(fixture)).toBe(before);
    }

    const failureFixture = fullAccount();
    failureFixture.db.seed("accountDeletionJobs", "job:failure-code", {
      userId: failureFixture.userId,
      threadId: failureFixture.threadId,
      attemptToken: "attempt:owner",
      phase: "requested",
      reservationCursor: 0,
      chatEventCursor: 0,
      subscriptionCompleted: false,
      storageCompleted: false,
      leaseExpiresAtMs: 100,
      requestedAtMs: 1,
      updatedAtMs: 1,
    });
    await expectReject(
      handler(recordAccountDeletionFailure)(
        { db: failureFixture.db },
        {
          userId: failureFixture.userId,
          attemptToken: "attempt:owner",
          code: "account_deletion_storage_failed",
          nowMs: 2,
        },
      ),
      "account_deletion_finalization_failed",
    );
    expect(failureFixture.db.tables.accountDeletionJobs[0]?.errorCode).toBe(
      undefined,
    );
  });

  test("stale jobs, malformed boundaries, and repeated finalization fail closed with stable codes", async () => {
    const exportedArgs = Reflect.get(
      Object(deleteCurrentUserAccount),
      "exportArgs",
    );
    if (typeof exportedArgs !== "function")
      throw new Error("registered_args_missing");
    const actionArgs = JSON.parse(
      Reflect.apply(exportedArgs, deleteCurrentUserAccount, []),
    ) as {
      value: Record<string, unknown>;
    };
    expect(Object.keys(actionArgs.value).length).toBe(0);
    await expectReject(
      handler(deleteCurrentUserAccount)(
        { auth: { getUserIdentity: async () => null } },
        {},
      ),
      "account_deletion_finalization_failed",
    );
    const concurrent = fullAccount();
    await handler(requestAccountDeletion)(
      { db: concurrent.db },
      {
        userId: concurrent.userId,
        threadId: concurrent.threadId,
        attemptToken: "attempt:concurrent",
        nowMs: Date.now(),
      },
    );
    await expectReject(run(concurrent), "account_deletion_in_progress");

    const fixture = fullAccount();
    await handler(requestAccountDeletion)(
      { db: fixture.db },
      {
        userId: fixture.userId,
        threadId: "wrong-thread",
        attemptToken: "attempt:wrong-thread",
        nowMs: 1,
      },
    );
    await expectReject(run(fixture), "account_deletion_in_progress");
    const missing = fullAccount();
    missing.db.tables.users.length = 0;
    await expectReject(run(missing), "account_deletion_finalization_failed");
    const completed = fullAccount();
    await run(completed);
    await expectReject(run(completed), "account_deletion_finalization_failed");
  });
});
