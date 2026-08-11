import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as qaNoShow from "../convex/qaNoShow";
import { resetDomain } from "../convex/qaReset";
import { domainConfig } from "../domain.config";
import {
  FakeDatabase,
  invoke,
  objectField,
  rejectionMessage,
  testContext,
} from "./customer-reservations-test-harness";

const previousReset = process.env.JEOMWON_QA_RESET;
const previousFeature = domainConfig.features.noShow;
const previousCopy = domainConfig.copy.noShow;
const now = Date.UTC(2026, 7, 11, 3);

beforeEach(() => {
  process.env.JEOMWON_QA_RESET = "1";
  domainConfig.features.noShow = true;
  domainConfig.copy.noShow = "No-show QA copy";
});

afterEach(() => {
  if (previousReset === undefined) delete process.env.JEOMWON_QA_RESET;
  else process.env.JEOMWON_QA_RESET = previousReset;
  domainConfig.features.noShow = previousFeature;
  domainConfig.copy.noShow = previousCopy;
});

function fixture() {
  const db = new FakeDatabase();
  Object.defineProperty(db, "delete", {
    value: async (id: string) => {
      for (const rows of Object.values(db.tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) rows.splice(index, 1);
      }
    },
  });
  return { db, ctx: testContext(db, "users:qa") };
}

describe("deployed no-show QA fixture", () => {
  test("drives positive and negative lifecycle paths with no unrelated effects", async () => {
    const value = fixture();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    try {
      const prepared = await invoke(qaNoShow.prepareFixtures, value.ctx, {
        threadId: "user:users:qa",
      });
      const numbers = objectField(prepared, "fixtureNumbers");
      const positive = String(objectField(numbers, "positive"));
      const future = String(objectField(numbers, "future"));
      const ineligible = String(objectField(numbers, "ineligible"));

      await invoke(qaNoShow.markFixture, value.ctx, {
        reservationId: positive,
      });
      expect(
        await rejectionMessage(
          invoke(qaNoShow.markFixture, value.ctx, {
            reservationId: positive,
          }),
        ),
      ).toBe("no_show_already_marked");
      expect(
        await rejectionMessage(
          invoke(qaNoShow.markFixture, value.ctx, { reservationId: future }),
        ),
      ).toBe("no_show_future");
      expect(
        await rejectionMessage(
          invoke(qaNoShow.markFixture, value.ctx, {
            reservationId: ineligible,
          }),
        ),
      ).toBe("no_show_wrong_status");

      const inspected = await invoke(qaNoShow.inspectFixtures, value.ctx, {});
      const rows = objectField(inspected, "rows") as unknown[];
      expect(
        JSON.stringify(rows.map((row) => objectField(row, "status"))),
      ).toBe(JSON.stringify(["no_show", "confirmed", "cancelled"]));
      expect(value.db.tables.reservationEmailDeliveries.length).toBe(0);
      expect(value.db.tables.chatEvents.length).toBe(0);
      expect(
        value.db.tables.reservations.filter(
          (row) => row.status === "waitlisted",
        ).length,
      ).toBe(0);
      expect(value.ctx.scheduler.runAfterCalls.length).toBe(0);
      expect(value.ctx.scheduler.runAtCalls.length).toBe(0);
    } finally {
      clock.mockRestore();
    }
  });

  test("observes redacted durable account deletion subscription state", async () => {
    const value = fixture();
    value.db.seed("accountDeletionJobs", "accountDeletionJobs:pending", {
      phase: "requested",
      subscriptionCompleted: false,
    });
    value.db.seed("accountDeletionJobs", "accountDeletionJobs:completed", {
      phase: "subscription_done",
      subscriptionCompleted: true,
    });

    const result = await invoke(
      qaNoShow.inspectAccountBillingState,
      value.ctx,
      {},
    );

    expect(JSON.stringify(result)).toBe(
      JSON.stringify({
        source: "accountDeletionJobs.phase+subscriptionCompleted",
        rowCount: 2,
        subscriptionCompleted: 1,
        subscriptionPending: 1,
        phases: {
          requested: 1,
          subscription_done: 1,
          storage_done: 0,
          records_redacted: 0,
          auth_deleted: 0,
        },
      }),
    );
    expect(/userId|threadId|email|token/i.test(JSON.stringify(result))).toBe(
      false,
    );
  });

  test("feature off rejects fixture preparation before writes", async () => {
    const value = fixture();
    domainConfig.features.noShow = false;
    expect(
      await rejectionMessage(
        invoke(qaNoShow.prepareFixtures, value.ctx, {
          threadId: "user:users:qa",
        }),
      ),
    ).toBe("no_show_disabled");
    expect(value.db.operations.inserts).toBe(0);
    expect(value.db.operations.patches).toBe(0);
  });

  test("reset removes every fixture so two runs cannot reuse stale evidence", async () => {
    const value = fixture();
    for (let run = 0; run < 2; run += 1) {
      await invoke(qaNoShow.prepareFixtures, value.ctx, {
        threadId: "user:users:qa",
      });
      expect(value.db.tables.reservations.length).toBe(3);
      expect(value.db.tables.chatThreads.length).toBe(1);
      await invoke(resetDomain, value.ctx, {
        domainKey: domainConfig.domainKey,
      });
      expect(value.db.tables.reservations.length).toBe(0);
      expect(value.db.tables.chatThreads.length).toBe(0);
    }
  });
});
