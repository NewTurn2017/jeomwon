import { describe, expect, test } from "bun:test";
import * as customerReservations from "../convex/customerReservations";
import { isSlotAllowed, serviceEndMs } from "../convex/engine/availability";
import {
  customerReservationThreadReadCap,
  publicReservationId,
} from "../convex/engine/customerReservationPublicId";
import { reservationOverlapCandidateCap } from "../convex/engine/lifecycle";
import {
  type DomainService,
  domainConfig,
  getServiceDurationMinutes,
} from "../domain.config";
import {
  customerFixture,
  futureAllowedStart,
  setCustomerAccountsFeature,
} from "./customer-reservations-fixture";
import {
  type FakeDatabase,
  invoke,
  objectField,
  rejectionMessage,
} from "./customer-reservations-test-harness";

const minuteMs = 60 * 1000;
const dayMs = 24 * 60 * minuteMs;

type Fixture = ReturnType<typeof customerFixture>;

function reservationSetup() {
  const service = domainConfig.services[0];
  if (service === undefined) {
    throw new Error("test_service_missing");
  }
  const resource = domainConfig.resources.find(
    (candidate) => candidate.kind === service.resourceKind,
  );
  if (resource === undefined) {
    throw new Error("test_resource_missing");
  }
  const otherResource = domainConfig.resources.find(
    (candidate) =>
      candidate.kind === service.resourceKind && candidate.key !== resource.key,
  );
  if (otherResource === undefined) {
    throw new Error("test_other_resource_missing");
  }
  return { service, resource, otherResource };
}

function consecutiveAllowedStart() {
  const { service } = reservationSetup();
  let startMs = futureAllowedStart(4);
  for (let attempt = 0; attempt < 21 * 48; attempt += 1) {
    if (
      isSlotAllowed(startMs, serviceEndMs(service, startMs), service) &&
      isSlotAllowed(
        startMs + 30 * minuteMs,
        serviceEndMs(service, startMs + 30 * minuteMs),
        service,
      )
    ) {
      return startMs;
    }
    startMs += 30 * minuteMs;
  }
  throw new Error("no_consecutive_allowed_slots");
}

function seedReservation(
  db: FakeDatabase,
  id: string,
  input: {
    threadId?: string;
    reservationNumber?: string;
    service?: DomainService;
    resourceKey: string;
    startMs: number;
    endMs: number;
    status:
      | "held"
      | "confirmed"
      | "rescheduled"
      | "waitlisted"
      | "cancelled"
      | "expired"
      | "denied"
      | "escalated";
    holdExpiresAtMs?: number | null;
    auditHistory?: Array<{ type: string }>;
  },
) {
  const service = input.service ?? reservationSetup().service;
  const resource = domainConfig.resources.find(
    (candidate) => candidate.key === input.resourceKey,
  );
  db.seed("reservations", id, {
    domainKey: domainConfig.domainKey,
    threadId: input.threadId ?? `thread:${id}`,
    reservationNumber: input.reservationNumber ?? `TEST-${id}`,
    displayName: null,
    serviceKey: service.key,
    serviceLabel: service.label,
    resourceKey: input.resourceKey,
    resourceLabel: resource?.label ?? input.resourceKey,
    startMs: input.startMs,
    endMs: input.endMs,
    status: input.status,
    holdExpiresAtMs: input.holdExpiresAtMs ?? null,
    origin: "customer",
    auditHistory: input.auditHistory ?? [],
    createdAtMs: input.startMs - dayMs,
    updatedAtMs: input.startMs - dayMs,
  });
}

function seedHistoricalNoise(
  fixture: Fixture,
  resourceKey: string,
  status: "confirmed" | "waitlisted" = "confirmed",
) {
  const anchorMs = consecutiveAllowedStart() - 400 * dayMs;
  for (let index = 0; index < 240; index += 1) {
    const startMs = anchorMs - index * dayMs;
    seedReservation(fixture.db, `reservations:history:${status}:${index}`, {
      resourceKey,
      startMs,
      endMs: startMs + 30 * minuteMs,
      status,
    });
  }
}

function seedFarFutureActiveRows(
  fixture: Fixture,
  resourceKey: string,
  afterMs: number,
  count: number,
) {
  for (let index = 0; index < count; index += 1) {
    const startMs = afterMs + (index + 1) * dayMs;
    seedReservation(fixture.db, `reservations:future:${index}`, {
      resourceKey,
      startMs,
      endMs: startMs + 30 * minuteMs,
      status: "confirmed",
    });
  }
}

function reservationReadSignature(db: FakeDatabase) {
  return db.queryTraces
    .filter(
      (trace) =>
        trace.table === "reservations" &&
        trace.indexName === "by_resource_status_end",
    )
    .map((trace) => ({
      indexName: trace.indexName,
      filters: trace.filters,
      rowsRead: trace.rowsRead,
    }));
}

function expectStatusScopedEndRanges(db: FakeDatabase) {
  const traces = db.queryTraces.filter(
    (trace) =>
      trace.table === "reservations" &&
      trace.indexName === "by_resource_status_end",
  );
  expect(traces.length > 0).toBe(true);
  for (const trace of traces) {
    expect(
      trace.filters.some(
        (filter) => filter.field === "status" && filter.operator === "eq",
      ),
    ).toBe(true);
    expect(
      trace.filters.some(
        (filter) => filter.field === "endMs" && filter.operator === "gt",
      ),
    ).toBe(true);
  }
}

describe("bounded customer reservation hot reads", () => {
  test("snapshot fails closed without a partial list when a customer thread exceeds its lifetime cap", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const fixture = customerFixture();
      const { resource } = reservationSetup();
      const anchorMs = consecutiveAllowedStart() - 400 * dayMs;
      for (
        let index = 0;
        index < customerReservationThreadReadCap + 44;
        index += 1
      ) {
        const startMs = anchorMs - index * dayMs;
        seedReservation(fixture.db, `reservations:customer-history:${index}`, {
          threadId: "user:users:a",
          resourceKey: resource.key,
          startMs,
          endMs: startMs + 30 * minuteMs,
          status: "cancelled",
        });
      }

      expect(
        await rejectionMessage(
          invoke(customerReservations.snapshot, fixture.customerA, {}),
        ),
      ).toBe("customer_snapshot_limit_exceeded");
      const threadReads = fixture.db.queryTraces.filter(
        (trace) =>
          trace.table === "reservations" && trace.indexName === "by_thread",
      );
      expect(threadReads.length).toBe(1);
      expect(threadReads[0]?.rowsRead).toBe(
        customerReservationThreadReadCap + 1,
      );
    } finally {
      restore();
    }
  });

  test("legacy action lookup fails closed at the same owner-thread sentinel", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const fixture = customerFixture();
      const { service, resource } = reservationSetup();
      const startMs = consecutiveAllowedStart();
      fixture.db.seed("reservations", "j571legacyownerrow00000000a1b2c3d4", {
        domainKey: domainConfig.domainKey,
        threadId: "user:users:a",
        displayName: null,
        serviceKey: service.key,
        serviceLabel: service.label,
        resourceKey: resource.key,
        resourceLabel: resource.label,
        startMs,
        endMs: serviceEndMs(service, startMs),
        status: "held",
        holdExpiresAtMs: Date.now() + 10 * minuteMs,
        origin: "customer",
        auditHistory: [],
        createdAtMs: Date.now() - minuteMs,
        updatedAtMs: Date.now() - minuteMs,
      });
      for (
        let index = 0;
        index < customerReservationThreadReadCap + 44;
        index += 1
      ) {
        const historicalStartMs = startMs - (index + 1) * dayMs;
        seedReservation(fixture.db, `reservations:legacy-noise:${index}`, {
          threadId: "user:users:a",
          resourceKey: resource.key,
          startMs: historicalStartMs,
          endMs: historicalStartMs + 30 * minuteMs,
          status: "cancelled",
        });
      }

      expect(
        await rejectionMessage(
          invoke(customerReservations.confirmReservation, fixture.customerA, {
            reservationId: publicReservationId(
              fixture.db.tables.reservations[0] as never,
            ),
          }),
        ),
      ).toBe("reservation_not_found");
      const threadReads = fixture.db.queryTraces.filter(
        (trace) =>
          trace.table === "reservations" && trace.indexName === "by_thread",
      );
      expect(threadReads.length).toBe(1);
      expect(threadReads[0]?.rowsRead).toBe(
        customerReservationThreadReadCap + 1,
      );
      expect(fixture.db.operations.patches).toBe(0);
    } finally {
      restore();
    }
  });

  test("availability fails closed when far-future active candidates saturate the overlap read", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const fixture = customerFixture();
      const { service, resource } = reservationSetup();
      const startMs = consecutiveAllowedStart();
      seedFarFutureActiveRows(
        fixture,
        resource.key,
        startMs + 21 * dayMs,
        reservationOverlapCandidateCap + 44,
      );

      const result = await invoke(
        customerReservations.availableSlots,
        fixture.customerA,
        {
          serviceKey: service.key,
          resourceKey: resource.key,
          preferredStartMs: startMs,
          count: 1,
        },
      );

      expect(JSON.stringify(objectField(result, "slots"))).toBe("[]");
      const rowsRead = reservationReadSignature(fixture.db).map(
        (trace) => trace.rowsRead,
      );
      expect(
        Math.max(...rowsRead.map((count) => count ?? 0)) <=
          reservationOverlapCandidateCap + 1,
      ).toBe(true);
      expect(rowsRead.includes(reservationOverlapCandidateCap + 1)).toBe(true);
    } finally {
      restore();
    }
  });

  test("create and reschedule reject saturated far-future candidates before side effects", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const { service, resource } = reservationSetup();
      const createStartMs = consecutiveAllowedStart();
      const createFixture = customerFixture();
      seedFarFutureActiveRows(
        createFixture,
        resource.key,
        createStartMs,
        reservationOverlapCandidateCap + 44,
      );

      expect(
        await rejectionMessage(
          invoke(customerReservations.createHold, createFixture.customerA, {
            serviceKey: service.key,
            resourceKey: resource.key,
            startMs: createStartMs,
          }),
        ),
      ).toBe("slot_conflict");
      expect(createFixture.db.operations.inserts).toBe(0);
      expect(createFixture.db.operations.patches).toBe(0);
      expect(createFixture.customerA.scheduler.runAtCalls.length).toBe(0);

      const moveFixture = customerFixture();
      const originalStartMs = futureAllowedStart(4);
      const movedStartMs = futureAllowedStart(7);
      seedReservation(moveFixture.db, "reservations:saturated-move", {
        threadId: "user:users:a",
        reservationNumber: "SATURATED-MOVE",
        resourceKey: resource.key,
        startMs: originalStartMs,
        endMs: serviceEndMs(service, originalStartMs),
        status: "confirmed",
      });
      seedFarFutureActiveRows(
        moveFixture,
        resource.key,
        movedStartMs,
        reservationOverlapCandidateCap + 44,
      );

      expect(
        await rejectionMessage(
          invoke(
            customerReservations.rescheduleReservation,
            moveFixture.customerA,
            {
              reservationId: "SATURATED-MOVE",
              serviceKey: service.key,
              resourceKey: resource.key,
              startMs: movedStartMs,
            },
          ),
        ),
      ).toBe("slot_conflict");
      expect(
        moveFixture.db.tables.reservations.find(
          (row) => row.reservationNumber === "SATURATED-MOVE",
        )?.startMs,
      ).toBe(originalStartMs);
      expect(moveFixture.db.operations.inserts).toBe(0);
      expect(moveFixture.db.operations.patches).toBe(0);
      expect(moveFixture.customerA.scheduler.runAfterCalls.length).toBe(0);

      for (const fixture of [createFixture, moveFixture]) {
        const rowsRead = reservationReadSignature(fixture.db).map(
          (trace) => trace.rowsRead,
        );
        expect(
          Math.max(...rowsRead.map((count) => count ?? 0)) <=
            reservationOverlapCandidateCap + 1,
        ).toBe(true);
        expect(rowsRead.includes(reservationOverlapCandidateCap + 1)).toBe(
          true,
        );
      }
    } finally {
      restore();
    }
  });

  test("waitlist release skips notification on truncation without undoing the valid cancellation", async () => {
    const restoreAccounts = setCustomerAccountsFeature(true);
    const previousWaitlist = domainConfig.features.waitlist;
    domainConfig.features.waitlist = true;
    try {
      const { service, resource } = reservationSetup();
      const startMs = futureAllowedStart(4);
      const endMs = serviceEndMs(service, startMs);
      const fixture = customerFixture();
      seedReservation(fixture.db, "reservations:saturated-owner", {
        threadId: "user:users:a",
        reservationNumber: "SATURATED-CANCEL",
        resourceKey: resource.key,
        startMs,
        endMs,
        status: "confirmed",
      });
      seedReservation(fixture.db, "reservations:saturated-waiter", {
        threadId: "thread:saturated-waiter",
        reservationNumber: "SATURATED-WAITER",
        resourceKey: resource.key,
        startMs,
        endMs,
        status: "waitlisted",
      });
      seedFarFutureActiveRows(
        fixture,
        resource.key,
        startMs,
        reservationOverlapCandidateCap + 44,
      );

      const result = await invoke(
        customerReservations.cancelReservation,
        fixture.customerA,
        { reservationId: "SATURATED-CANCEL" },
      );

      expect(objectField(objectField(result, "publicContext"), "status")).toBe(
        "cancelled",
      );
      expect(
        fixture.db.tables.chatEvents.filter(
          (event) => event.type === "waitlist.slotOpened",
        ).length,
      ).toBe(0);
      expect(
        JSON.stringify(
          fixture.db.tables.reservations.find(
            (row) => row.reservationNumber === "SATURATED-WAITER",
          )?.auditHistory,
        ),
      ).toBe("[]");
      expect(fixture.customerA.scheduler.runAfterCalls.length).toBe(1);
      const rowsRead = reservationReadSignature(fixture.db).map(
        (trace) => trace.rowsRead,
      );
      expect(
        Math.max(...rowsRead.map((count) => count ?? 0)) <=
          reservationOverlapCandidateCap + 1,
      ).toBe(true);
      expect(rowsRead.includes(reservationOverlapCandidateCap + 1)).toBe(true);
    } finally {
      domainConfig.features.waitlist = previousWaitlist;
      restoreAccounts();
    }
  });

  test("availability reads a historical 90-minute active row after current service durations shrink to 60 minutes", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const compact = customerFixture();
      const historical = customerFixture();
      const { service, resource, otherResource } = reservationSetup();
      const startMs = consecutiveAllowedStart();
      expect(
        Math.max(...domainConfig.services.map(getServiceDurationMinutes)),
      ).toBe(60);
      for (const fixture of [compact, historical]) {
        seedReservation(fixture.db, "reservations:long-active", {
          resourceKey: resource.key,
          startMs: startMs - 75 * minuteMs,
          endMs: startMs + 15 * minuteMs,
          status: "confirmed",
        });
        seedReservation(fixture.db, "reservations:terminal-overlap", {
          resourceKey: resource.key,
          startMs: startMs - 75 * minuteMs,
          endMs: startMs + 15 * minuteMs,
          status: "cancelled",
        });
        seedReservation(fixture.db, "reservations:other-resource", {
          resourceKey: otherResource.key,
          startMs,
          endMs: startMs + 30 * minuteMs,
          status: "escalated",
        });
      }
      seedHistoricalNoise(historical, resource.key);

      const args = {
        serviceKey: service.key,
        resourceKey: resource.key,
        preferredStartMs: startMs,
        count: 1,
      };
      const compactResult = await invoke(
        customerReservations.availableSlots,
        compact.customerA,
        args,
      );
      const historicalResult = await invoke(
        customerReservations.availableSlots,
        historical.customerA,
        args,
      );

      expect(JSON.stringify(historicalResult)).toBe(
        JSON.stringify(compactResult),
      );
      const slots = objectField(compactResult, "slots");
      if (!Array.isArray(slots) || slots.length === 0) {
        throw new Error("available_slot_missing");
      }
      expect(objectField(slots[0], "startMs")).toBe(startMs + 30 * minuteMs);
      expect(JSON.stringify(reservationReadSignature(historical.db))).toBe(
        JSON.stringify(reservationReadSignature(compact.db)),
      );
      expectStatusScopedEndRanges(historical.db);
    } finally {
      restore();
    }
  });

  test("create and reschedule collision reads stay bounded while active overlaps block and terminal overlaps do not", async () => {
    const restore = setCustomerAccountsFeature(true);
    try {
      const { service, resource } = reservationSetup();
      const createStartMs = consecutiveAllowedStart();
      const compactCreate = customerFixture();
      const historicalCreate = customerFixture();
      for (const fixture of [compactCreate, historicalCreate]) {
        seedReservation(fixture.db, "reservations:create-terminal", {
          resourceKey: resource.key,
          startMs: createStartMs,
          endMs: serviceEndMs(service, createStartMs),
          status: "cancelled",
        });
        seedReservation(fixture.db, "reservations:create-active", {
          resourceKey: resource.key,
          startMs: createStartMs - 75 * minuteMs,
          endMs: createStartMs + 15 * minuteMs,
          status: "escalated",
        });
      }
      seedHistoricalNoise(historicalCreate, resource.key);

      const createArgs = {
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs: createStartMs,
      };
      expect(
        await rejectionMessage(
          invoke(
            customerReservations.createHold,
            compactCreate.customerA,
            createArgs,
          ),
        ),
      ).toBe("slot_conflict");
      expect(
        await rejectionMessage(
          invoke(
            customerReservations.createHold,
            historicalCreate.customerA,
            createArgs,
          ),
        ),
      ).toBe("slot_conflict");
      expect(
        JSON.stringify(reservationReadSignature(historicalCreate.db)),
      ).toBe(JSON.stringify(reservationReadSignature(compactCreate.db)));
      expectStatusScopedEndRanges(historicalCreate.db);

      const compactTerminal = customerFixture();
      const historicalTerminal = customerFixture();
      for (const fixture of [compactTerminal, historicalTerminal]) {
        seedReservation(fixture.db, "reservations:create-terminal-only", {
          resourceKey: resource.key,
          startMs: createStartMs,
          endMs: serviceEndMs(service, createStartMs),
          status: "cancelled",
        });
        seedReservation(fixture.db, "reservations:create-touching-active", {
          resourceKey: resource.key,
          startMs: createStartMs - 30 * minuteMs,
          endMs: createStartMs,
          status: "confirmed",
        });
      }
      seedHistoricalNoise(historicalTerminal, resource.key);
      const compactCreated = await invoke(
        customerReservations.createHold,
        compactTerminal.customerA,
        createArgs,
      );
      const historicalCreated = await invoke(
        customerReservations.createHold,
        historicalTerminal.customerA,
        createArgs,
      );
      expect(
        objectField(objectField(compactCreated, "publicContext"), "status"),
      ).toBe("held");
      expect(
        objectField(objectField(historicalCreated, "publicContext"), "status"),
      ).toBe("held");
      expect(
        JSON.stringify(reservationReadSignature(historicalTerminal.db)),
      ).toBe(JSON.stringify(reservationReadSignature(compactTerminal.db)));
      expectStatusScopedEndRanges(historicalTerminal.db);

      const compactMove = customerFixture();
      const historicalMove = customerFixture();
      const originalStartMs = futureAllowedStart(4);
      const movedStartMs = futureAllowedStart(7);
      for (const fixture of [compactMove, historicalMove]) {
        seedReservation(fixture.db, "reservations:owned", {
          threadId: "user:users:a",
          reservationNumber: "BOUND-MOVE",
          resourceKey: resource.key,
          startMs: originalStartMs,
          endMs: serviceEndMs(service, originalStartMs),
          status: "confirmed",
        });
        seedReservation(fixture.db, "reservations:move-terminal", {
          resourceKey: resource.key,
          startMs: movedStartMs,
          endMs: serviceEndMs(service, movedStartMs),
          status: "expired",
        });
        seedReservation(fixture.db, "reservations:move-active", {
          resourceKey: resource.key,
          startMs: movedStartMs - 75 * minuteMs,
          endMs: movedStartMs + 15 * minuteMs,
          status: "held",
          holdExpiresAtMs: Date.now() + dayMs,
        });
      }
      seedHistoricalNoise(historicalMove, resource.key);
      const moveArgs = {
        reservationId: "BOUND-MOVE",
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs: movedStartMs,
      };
      expect(
        await rejectionMessage(
          invoke(
            customerReservations.rescheduleReservation,
            compactMove.customerA,
            moveArgs,
          ),
        ),
      ).toBe("slot_conflict");
      expect(
        await rejectionMessage(
          invoke(
            customerReservations.rescheduleReservation,
            historicalMove.customerA,
            moveArgs,
          ),
        ),
      ).toBe("slot_conflict");
      expect(JSON.stringify(reservationReadSignature(historicalMove.db))).toBe(
        JSON.stringify(reservationReadSignature(compactMove.db)),
      );
      expectStatusScopedEndRanges(historicalMove.db);
    } finally {
      restore();
    }
  });

  test("slot release reads only the freed resource window and notifies only its matching waiter", async () => {
    const restoreAccounts = setCustomerAccountsFeature(true);
    const previousWaitlist = domainConfig.features.waitlist;
    domainConfig.features.waitlist = true;
    try {
      const { service, resource, otherResource } = reservationSetup();
      const startMs = futureAllowedStart(4);
      const endMs = serviceEndMs(service, startMs);
      const compact = customerFixture();
      const historical = customerFixture();
      for (const fixture of [compact, historical]) {
        seedReservation(fixture.db, "reservations:owner", {
          threadId: "user:users:a",
          reservationNumber: "BOUND-CANCEL",
          resourceKey: resource.key,
          startMs,
          endMs,
          status: "confirmed",
        });
        seedReservation(fixture.db, "reservations:historical-blocker", {
          threadId: "user:users:a",
          reservationNumber: "BOUND-HISTORICAL-BLOCKER",
          resourceKey: resource.key,
          startMs: startMs - 75 * minuteMs,
          endMs: startMs + 15 * minuteMs,
          status: "confirmed",
        });
        seedReservation(fixture.db, "reservations:wrong-resource-waiter", {
          threadId: "thread:wrong-resource",
          reservationNumber: "WAIT-WRONG-RESOURCE",
          resourceKey: otherResource.key,
          startMs,
          endMs,
          status: "waitlisted",
        });
        seedReservation(fixture.db, "reservations:wrong-service-waiter", {
          threadId: "thread:wrong-service",
          reservationNumber: "WAIT-WRONG-SERVICE",
          service: domainConfig.services[1],
          resourceKey: resource.key,
          startMs,
          endMs,
          status: "waitlisted",
        });
        seedReservation(fixture.db, "reservations:matching-waiter", {
          threadId: "thread:matching",
          reservationNumber: "WAIT-MATCHING",
          resourceKey: resource.key,
          startMs,
          endMs,
          status: "waitlisted",
        });
      }
      seedHistoricalNoise(historical, resource.key, "waitlisted");

      await invoke(customerReservations.cancelReservation, compact.customerA, {
        reservationId: "BOUND-CANCEL",
      });
      await invoke(
        customerReservations.cancelReservation,
        historical.customerA,
        { reservationId: "BOUND-CANCEL" },
      );

      expect(
        compact.db.tables.chatEvents.filter(
          (event) => event.type === "waitlist.slotOpened",
        ).length,
      ).toBe(0);
      expect(
        historical.db.tables.chatEvents.filter(
          (event) => event.type === "waitlist.slotOpened",
        ).length,
      ).toBe(0);

      await invoke(customerReservations.cancelReservation, compact.customerA, {
        reservationId: "BOUND-HISTORICAL-BLOCKER",
      });
      await invoke(
        customerReservations.cancelReservation,
        historical.customerA,
        { reservationId: "BOUND-HISTORICAL-BLOCKER" },
      );

      const compactEvents = compact.db.tables.chatEvents.filter(
        (event) => event.type === "waitlist.slotOpened",
      );
      const historicalEvents = historical.db.tables.chatEvents.filter(
        (event) => event.type === "waitlist.slotOpened",
      );
      expect(compactEvents.length).toBe(1);
      expect(historicalEvents.length).toBe(1);
      expect(historicalEvents[0]?.threadId).toBe("thread:matching");
      expect(
        JSON.stringify(
          historical.db.tables.reservations
            .filter((row) =>
              [
                "WAIT-WRONG-RESOURCE",
                "WAIT-WRONG-SERVICE",
                "WAIT-MATCHING",
              ].includes(String(row.reservationNumber)),
            )
            .map((row) => ({
              reservationNumber: row.reservationNumber,
              auditTypes: (row.auditHistory as Array<{ type: string }>).map(
                (event) => event.type,
              ),
            })),
        ),
      ).toBe(
        JSON.stringify([
          { reservationNumber: "WAIT-WRONG-RESOURCE", auditTypes: [] },
          { reservationNumber: "WAIT-WRONG-SERVICE", auditTypes: [] },
          {
            reservationNumber: "WAIT-MATCHING",
            auditTypes: ["waitlist.notified"],
          },
        ]),
      );
      expect(JSON.stringify(reservationReadSignature(historical.db))).toBe(
        JSON.stringify(reservationReadSignature(compact.db)),
      );
      expectStatusScopedEndRanges(historical.db);
    } finally {
      domainConfig.features.waitlist = previousWaitlist;
      restoreAccounts();
    }
  });
});
