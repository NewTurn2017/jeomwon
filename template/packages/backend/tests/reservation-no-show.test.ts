import { describe, expect, spyOn, test } from "bun:test";
import { getFunctionName } from "convex/server";
import * as admin from "../convex/admin";
import * as customerReservations from "../convex/customerReservations";
import { hasCollision } from "../convex/engine/availability";
import { isActiveReservation } from "../convex/engine/lifecycle";
import { domainConfig } from "../domain.config";
import { reservationStatuses } from "../src/agent-contract";
import { jeomwonConvex } from "../src/convex-refs";
import {
  exportedArgKeys,
  FakeDatabase,
  invoke,
  objectField,
  rejectionMessage,
  sortedObjectKeys,
  testContext,
} from "./customer-reservations-test-harness";

const NOW_MS = Date.UTC(2026, 7, 9, 3, 0, 0);

function fixture(status: string = "confirmed", startMs = NOW_MS - 60_000) {
  const db = new FakeDatabase();
  db.seed("users", "users:operator", {
    name: "Operator",
    email: "operator@example.com",
    isAnonymous: false,
  });
  db.seed("users", "users:customer", {
    name: "Customer",
    email: "customer@example.com",
    isAnonymous: false,
  });
  db.seed("reservations", "reservations:target", {
    domainKey: domainConfig.domainKey,
    threadId: "user:users:customer",
    reservationNumber: "NS-260809-TEST01",
    displayName: "Customer",
    serviceKey: domainConfig.services[0]!.key,
    serviceLabel: domainConfig.services[0]!.label,
    resourceKey: domainConfig.resources[0]!.key,
    resourceLabel: domainConfig.resources[0]!.label,
    startMs,
    endMs: startMs + 30 * 60_000,
    status,
    holdExpiresAtMs: null,
    origin: "customer",
    customerUserId: "users:customer",
    auditHistory: [],
    createdAtMs: NOW_MS - 86_400_000,
    updatedAtMs: NOW_MS - 86_400_000,
  });
  db.seed("chatThreads", "chatThreads:target", {
    domainKey: domainConfig.domainKey,
    threadId: "user:users:customer",
    activeAgent: "reservation",
    publicContext: {
      displayName: "Customer",
      reservationId: "NS-260809-TEST01",
      serviceLabel: domainConfig.services[0]!.label,
      resourceLabel: domainConfig.resources[0]!.label,
      timeWindow: "before",
      status,
      policySummary: domainConfig.copy.policySummary,
      nextStep: domainConfig.copy.nextStepConfirmed,
    },
    guardrailStatus: {
      relevance: "clear",
      confirmation: "clear",
      privacy: "clear",
    },
    guardrailBanner: null,
    suggestedSlots: [],
    createdAtMs: NOW_MS - 86_400_000,
    updatedAtMs: NOW_MS - 86_400_000,
  });
  db.seed("reservations", "reservations:waiter", {
    domainKey: domainConfig.domainKey,
    threadId: "customer:waiter",
    reservationNumber: "NS-260809-WAIT01",
    displayName: "Waiting Customer",
    serviceKey: domainConfig.services[0]!.key,
    serviceLabel: domainConfig.services[0]!.label,
    resourceKey: domainConfig.resources[0]!.key,
    resourceLabel: domainConfig.resources[0]!.label,
    startMs,
    endMs: startMs + 30 * 60_000,
    status: "waitlisted",
    holdExpiresAtMs: null,
    origin: "customer",
    auditHistory: [],
    createdAtMs: NOW_MS - 86_400_000,
    updatedAtMs: NOW_MS - 86_400_000,
  });
  db.seed("reservationEmailDeliveries", "reservationEmailDeliveries:existing", {
    reservationId: "reservations:target",
    audience: "customer",
    template: "reservation.confirmed",
    generation: 0,
    status: "completed",
    idempotencyKey: "existing",
    eventRecorded: true,
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  return {
    db,
    anonymous: testContext(db, null),
    customer: testContext(db, "users:customer"),
    operator: testContext(db, "users:operator"),
  };
}

function enableNoShow() {
  const previousEmails = process.env.JEOMWON_ADMIN_EMAILS;
  const previousNoShow = domainConfig.features.noShow;
  const previousNoShowCopy = domainConfig.copy.noShow;
  const previousWaitlist = domainConfig.features.waitlist;
  process.env.JEOMWON_ADMIN_EMAILS = "operator@example.com";
  domainConfig.features.noShow = true;
  domainConfig.copy.noShow = "예약 불이행 처리되었습니다. 매장에 문의해 주세요.";
  domainConfig.features.waitlist = true;
  const dateNow = spyOn(Date, "now").mockReturnValue(NOW_MS);
  return () => {
    dateNow.mockRestore();
    domainConfig.features.noShow = previousNoShow;
    domainConfig.copy.noShow = previousNoShowCopy;
    domainConfig.features.waitlist = previousWaitlist;
    if (previousEmails === undefined) delete process.env.JEOMWON_ADMIN_EMAILS;
    else process.env.JEOMWON_ADMIN_EMAILS = previousEmails;
  };
}

function stateHash(db: FakeDatabase) {
  return JSON.stringify({
    reservations: db.tables.reservations,
    chatThreads: db.tables.chatThreads,
    chatEvents: db.tables.chatEvents,
    deliveries: db.tables.reservationEmailDeliveries,
  });
}

async function mark(value: ReturnType<typeof fixture>) {
  return await invoke(admin.markReservationNoShow, value.operator, {
    reservationId: "NS-260809-TEST01",
  });
}

describe("reservation no-show lifecycle", () => {
  test("typed contract exposes one server-timed admin mutation and the terminal status", () => {
    expect(getFunctionName(jeomwonConvex.admin.markReservationNoShow)).toBe(
      "admin:markReservationNoShow",
    );
    expect(JSON.stringify(exportedArgKeys(admin.markReservationNoShow))).toBe(
      JSON.stringify(["reservationId"]),
    );
    expect(reservationStatuses.includes("no_show")).toBe(true);
  });

  test("feature-off rejects an authorized operator before any write", async () => {
    const value = fixture();
    const restore = enableNoShow();
    domainConfig.features.noShow = false;
    const before = stateHash(value.db);
    try {
      expect(await rejectionMessage(mark(value))).toBe("no_show_disabled");
      expect(stateHash(value.db)).toBe(before);
      expect(value.db.operations.inserts).toBe(0);
      expect(value.db.operations.patches).toBe(0);
    } finally {
      restore();
    }
  });

  test("missing auth and a non-admin fail with stable codes and no writes", async () => {
    const value = fixture();
    const restore = enableNoShow();
    const before = stateHash(value.db);
    try {
      expect(
        await rejectionMessage(
          invoke(admin.markReservationNoShow, value.anonymous, {
            reservationId: "NS-260809-TEST01",
          }),
        ),
      ).toBe("auth_required");
      expect(
        await rejectionMessage(
          invoke(admin.markReservationNoShow, value.customer, {
            reservationId: "NS-260809-TEST01",
          }),
        ),
      ).toBe("admin_forbidden");
      expect(stateHash(value.db)).toBe(before);
    } finally {
      restore();
    }
  });

  test("past confirmed transitions exactly once without chat, email, or waitlist effects", async () => {
    const value = fixture();
    const restore = enableNoShow();
    const chatCount = value.db.tables.chatEvents.length;
    const emailCount = value.db.tables.reservationEmailDeliveries.length;
    const waiterHash = JSON.stringify(value.db.tables.reservations[1]);
    try {
      const result = await mark(value);
      const reservation = value.db.tables.reservations[0]!;
      const publicContext = objectField(result, "publicContext");
      expect(reservation.status).toBe("no_show");
      expect(
        JSON.stringify(
          (reservation.auditHistory as Array<{ type: string }>).map(
            (event) => event.type,
          ),
        ),
      ).toBe(JSON.stringify(["reservation.no_show"]));
      expect(objectField(result, "auditType")).toBe("reservation.no_show");
      expect(objectField(publicContext, "status")).toBe("no_show");
      expect(objectField(publicContext, "nextStep")).toBe(
        domainConfig.copy.noShow,
      );
      expect(JSON.stringify(sortedObjectKeys(publicContext))).toBe(
        JSON.stringify([
          "displayName",
          "nextStep",
          "policySummary",
          "reservationId",
          "resourceLabel",
          "serviceLabel",
          "status",
          "timeWindow",
        ]),
      );
      expect(/operatorMemo|privateDecision|riskSignals|costBasis|email/i.test(JSON.stringify(publicContext))).toBe(false);
      expect(value.db.tables.chatEvents.length).toBe(chatCount);
      expect(value.db.tables.reservationEmailDeliveries.length).toBe(emailCount);
      expect(JSON.stringify(value.db.tables.reservations[1])).toBe(waiterHash);
      expect(value.operator.scheduler.runAfterCalls.length).toBe(0);
      expect(value.operator.scheduler.runAtCalls.length).toBe(0);
    } finally {
      restore();
    }
  });

  test("customer serializer propagates terminal no-show without internal fields", async () => {
    const value = fixture();
    const restore = enableNoShow();
    try {
      await mark(value);
      const snapshot = await invoke(
        customerReservations.snapshot,
        value.customer,
        {},
      );
      const reservations = objectField(snapshot, "reservations");
      expect(Array.isArray(reservations)).toBe(true);
      const serialized = (reservations as unknown[])[0];
      expect(objectField(serialized, "status")).toBe("no_show");
      expect(
        /auditHistory|internalContext|operatorMemo|customerUserId|threadId/.test(
          JSON.stringify(serialized),
        ),
      ).toBe(false);
    } finally {
      restore();
    }
  });

  test("rescheduled is eligible and exact start boundary is not future", async () => {
    const value = fixture("rescheduled", NOW_MS);
    const restore = enableNoShow();
    try {
      const result = await mark(value);
      expect(objectField(objectField(result, "reservation"), "status")).toBe(
        "no_show",
      );
    } finally {
      restore();
    }
  });

  test("future start fails no_show_future without changing state", async () => {
    const value = fixture("confirmed", NOW_MS + 1);
    const restore = enableNoShow();
    const before = stateHash(value.db);
    try {
      expect(await rejectionMessage(mark(value))).toBe("no_show_future");
      expect(stateHash(value.db)).toBe(before);
    } finally {
      restore();
    }
  });

  test("invalid lifecycle status fails no_show_wrong_status without changing state", async () => {
    const value = fixture("cancelled");
    const restore = enableNoShow();
    const before = stateHash(value.db);
    try {
      expect(await rejectionMessage(mark(value))).toBe("no_show_wrong_status");
      expect(stateHash(value.db)).toBe(before);
    } finally {
      restore();
    }
  });

  test("repeat marking fails no_show_already_marked without a second audit or write", async () => {
    const value = fixture();
    const restore = enableNoShow();
    try {
      await mark(value);
      const afterFirst = stateHash(value.db);
      expect(await rejectionMessage(mark(value))).toBe(
        "no_show_already_marked",
      );
      expect(stateHash(value.db)).toBe(afterFirst);
    } finally {
      restore();
    }
  });

  test("no-show is terminal, customer-inactive, and collision-inactive", () => {
    const value = fixture("no_show");
    const reservation = value.db.tables.reservations[0] as never;
    expect(isActiveReservation(reservation)).toBe(false);
    expect(
      hasCollision(
        [reservation],
        domainConfig.resources[0]!.key,
        NOW_MS - 30_000,
        NOW_MS + 30_000,
      ),
    ).toBe(false);
  });
});
