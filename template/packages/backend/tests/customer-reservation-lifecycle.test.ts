import { describe, expect, test } from "bun:test";
import { expireHold } from "../convex/agentTools";
import { isSlotAllowed, serviceEndMs } from "../convex/engine/availability";
import {
  cancelCustomerReservation,
  confirmCustomerReservation,
  createCustomerReservationHold,
  rescheduleCustomerReservation,
} from "../convex/engine/customerReservationLifecycle";
import { isInsideCancelWindow } from "../convex/engine/policy";
import { domainConfig } from "../domain.config";

type LegacyCreateHoldArgs = {
  readonly threadId: string;
  readonly displayName: string | null;
  readonly serviceKey: string;
  readonly resourceKey: string;
  readonly startMs: number;
  readonly endMs: number;
};

type LegacyReservationArgs = {
  readonly threadId: string;
  readonly reservationId: string;
  readonly confirmed?: boolean;
  readonly requestedAtMs?: number;
};

type LegacyRescheduleArgs = LegacyReservationArgs & {
  readonly serviceKey: string;
  readonly resourceKey: string;
  readonly startMs: number;
  readonly endMs: number;
};

// These test-local adapters preserve the pre-cutover lifecycle characterization
// inputs without reintroducing public Convex functions. Production callers use
// only the canonical customerReservations validators.
const createHold = {
  _handler: async (
    ctx: Parameters<typeof createCustomerReservationHold>[0],
    args: LegacyCreateHoldArgs,
  ) =>
    await createCustomerReservationHold(ctx, {
      threadId: args.threadId,
      displayName: args.displayName,
      serviceKey: args.serviceKey,
      resourceKey: args.resourceKey,
      startMs: args.startMs,
    }),
};

const confirmReservation = {
  _handler: async (
    ctx: Parameters<typeof confirmCustomerReservation>[0],
    args: LegacyReservationArgs,
  ) => await confirmCustomerReservation(ctx, args),
};

const cancelReservation = {
  _handler: async (
    ctx: Parameters<typeof cancelCustomerReservation>[0],
    args: LegacyReservationArgs,
  ) => await cancelCustomerReservation(ctx, args),
};

const rescheduleReservation = {
  _handler: async (
    ctx: Parameters<typeof rescheduleCustomerReservation>[0],
    args: LegacyRescheduleArgs,
  ) =>
    await rescheduleCustomerReservation(ctx, {
      threadId: args.threadId,
      reservationId: args.reservationId,
      serviceKey: args.serviceKey,
      resourceKey: args.resourceKey,
      startMs: args.startMs,
    }),
};

type TableName = "reservations" | "resources" | "chatThreads" | "chatEvents";
type StoredRow = Record<string, unknown> & { _id: string };

class FakeQuery {
  private readonly filters: Array<{
    operator: "eq" | "gt" | "lt";
    field: string;
    value: unknown;
  }> = [];

  constructor(private readonly rows: StoredRow[]) {}

  withIndex(
    _name: string,
    configure: (query: FakeQuery) => FakeQuery,
  ): FakeQuery {
    return configure(this);
  }

  eq(field: string, value: unknown): FakeQuery {
    this.filters.push({ operator: "eq", field, value });
    return this;
  }

  gt(field: string, value: unknown): FakeQuery {
    this.filters.push({ operator: "gt", field, value });
    return this;
  }

  lt(field: string, value: unknown): FakeQuery {
    this.filters.push({ operator: "lt", field, value });
    return this;
  }

  async collect(): Promise<StoredRow[]> {
    return this.rows.filter((row) =>
      this.filters.every((filter) => {
        const rowValue = row[filter.field];
        if (filter.operator === "eq") {
          return rowValue === filter.value;
        }
        if (typeof rowValue !== "number" || typeof filter.value !== "number") {
          return false;
        }
        return filter.operator === "gt"
          ? rowValue > filter.value
          : rowValue < filter.value;
      }),
    );
  }

  async take(limit: number): Promise<StoredRow[]> {
    return (await this.collect()).slice(0, limit);
  }

  async unique(): Promise<StoredRow | null> {
    const rows = await this.collect();
    if (rows.length > 1) {
      throw new Error("fake_unique_multiple_rows");
    }
    return rows[0] ?? null;
  }
}

class FakeDatabase {
  readonly tables: Record<TableName, StoredRow[]> = {
    reservations: [],
    resources: [],
    chatThreads: [],
    chatEvents: [],
  };
  private nextId = 1;

  query(table: TableName): FakeQuery {
    return new FakeQuery(this.tables[table]);
  }

  async insert(
    table: TableName,
    value: Record<string, unknown>,
  ): Promise<string> {
    const row = {
      ...value,
      _id: `${table}:${this.nextId}`,
      _creationTime: this.nextId,
    };
    this.nextId += 1;
    this.tables[table].push(row);
    return row._id;
  }

  async get(id: string): Promise<StoredRow | null> {
    for (const rows of Object.values(this.tables)) {
      const row = rows.find((candidate) => candidate._id === id);
      if (row) {
        return row;
      }
    }
    return null;
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = await this.get(id);
    if (!row) {
      throw new Error("fake_patch_missing_row");
    }
    Object.assign(row, value);
  }
}

class FakeScheduler {
  readonly runAtCalls: Array<{ timestampMs: number; args: unknown }> = [];
  readonly runAfterCalls: Array<{ delayMs: number; args: unknown }> = [];

  async runAt(
    timestampMs: number,
    _reference: unknown,
    args: unknown,
  ): Promise<void> {
    this.runAtCalls.push({ timestampMs, args });
  }

  async runAfter(
    delayMs: number,
    _reference: unknown,
    args: unknown,
  ): Promise<void> {
    this.runAfterCalls.push({ delayMs, args });
  }
}

function mutationContext() {
  return {
    db: new FakeDatabase(),
    scheduler: new FakeScheduler(),
  };
}

async function invoke<TArgs, TResult>(
  registered: unknown,
  ctx: ReturnType<typeof mutationContext>,
  args: TArgs,
): Promise<TResult> {
  const handler = (
    registered as {
      _handler: (
        context: ReturnType<typeof mutationContext>,
        input: TArgs,
      ) => Promise<TResult>;
    }
  )._handler;
  return await handler(ctx, args);
}

function futureAllowedStart(offsetDays = 3): number {
  const service = domainConfig.services[0]!;
  let candidate = Date.now() + offsetDays * 24 * 60 * 60 * 1000;
  candidate = Math.ceil(candidate / (30 * 60 * 1000)) * (30 * 60 * 1000);
  for (let attempt = 0; attempt < 21 * 48; attempt += 1) {
    const endMs = serviceEndMs(service, candidate);
    if (isSlotAllowed(candidate, endMs, service)) {
      return candidate;
    }
    candidate += 30 * 60 * 1000;
  }
  throw new Error("no_allowed_slot_in_test_horizon");
}

function futureAllowedOverlappingMove(offsetDays = 4) {
  const service = domainConfig.services[0]!;
  let startMs = futureAllowedStart(offsetDays);
  for (let attempt = 0; attempt < 21 * 48; attempt += 1) {
    const movedStartMs = startMs + 15 * 60 * 1000;
    if (
      isSlotAllowed(startMs, serviceEndMs(service, startMs), service) &&
      isSlotAllowed(movedStartMs, serviceEndMs(service, movedStartMs), service)
    ) {
      return { startMs, movedStartMs };
    }
    startMs += 30 * 60 * 1000;
  }
  throw new Error("no_overlapping_move_in_test_horizon");
}

function pastAllowedStart(): number {
  const service = domainConfig.services[0]!;
  let candidate = Date.now() - 24 * 60 * 60 * 1000;
  candidate = Math.floor(candidate / (30 * 60 * 1000)) * (30 * 60 * 1000);
  for (let attempt = 0; attempt < 21 * 48; attempt += 1) {
    const endMs = serviceEndMs(service, candidate);
    if (isSlotAllowed(candidate, endMs, service)) {
      return candidate;
    }
    candidate -= 30 * 60 * 1000;
  }
  throw new Error("no_past_allowed_slot_in_test_horizon");
}

function countByType(ctx: ReturnType<typeof mutationContext>, type: string) {
  return ctx.db.tables.chatEvents.filter((event) => event.type === type).length;
}

describe("customer reservation write characterization PIN", () => {
  test("valid hold, confirm, reschedule, cancel preserve persisted state and each side effect once", async () => {
    const ctx = mutationContext();
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const startMs = futureAllowedStart(4);
    const endMs = serviceEndMs(service, startMs);

    const hold = await invoke<
      {
        threadId: string;
        displayName: string;
        serviceKey: string;
        resourceKey: string;
        startMs: number;
        endMs: number;
      },
      { publicContext: { reservationId: string }; holdExpiresAtMs: number }
    >(createHold, ctx, {
      threadId: "thread-characterization",
      displayName: "Test Customer",
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs,
      endMs,
    });

    const held = ctx.db.tables.reservations[0]!;
    expect(held.status).toBe("held");
    expect(held.endMs).toBe(endMs);
    expect((held.auditHistory as Array<{ type: string }>)[0]?.type).toBe(
      "reservation.held",
    );
    expect(countByType(ctx, "reservation.held")).toBe(1);
    expect(ctx.scheduler.runAtCalls.length).toBe(1);
    expect(ctx.scheduler.runAtCalls[0]?.timestampMs).toBe(hold.holdExpiresAtMs);

    await invoke(confirmReservation, ctx, {
      threadId: "thread-characterization",
      reservationId: hold.publicContext.reservationId,
      confirmed: true,
    });
    expect(held.status).toBe("confirmed");
    expect(countByType(ctx, "reservation.confirmed")).toBe(1);
    expect(ctx.scheduler.runAfterCalls.length).toBe(1);

    const rescheduledStartMs = futureAllowedStart(6);
    await invoke(rescheduleReservation, ctx, {
      threadId: "thread-characterization",
      reservationId: hold.publicContext.reservationId,
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs: rescheduledStartMs,
      endMs: serviceEndMs(service, rescheduledStartMs),
      requestedAtMs: Date.now(),
    });
    expect(held.status).toBe("rescheduled");
    expect(held.startMs).toBe(rescheduledStartMs);
    expect(countByType(ctx, "reservation.rescheduled")).toBe(1);
    expect(ctx.scheduler.runAfterCalls.length).toBe(2);

    const exactThreshold =
      rescheduledStartMs -
      domainConfig.policies.cancelWindowHours * 60 * 60 * 1000;
    const cancelled = await invoke<
      { threadId: string; reservationId: string; requestedAtMs: number },
      { escalated: boolean }
    >(cancelReservation, ctx, {
      threadId: "thread-characterization",
      reservationId: hold.publicContext.reservationId,
      requestedAtMs: exactThreshold,
    });
    expect(cancelled.escalated).toBe(false);
    expect(held.status).toBe("cancelled");
    expect(countByType(ctx, "reservation.cancelled")).toBe(1);
    expect(ctx.scheduler.runAfterCalls.length).toBe(3);
    expect((held.auditHistory as Array<{ type: string }>).length).toBe(4);
    console.log(
      `MANUAL_QA_LIFECYCLE=${JSON.stringify({
        finalStatus: held.status,
        auditTypes: (held.auditHistory as Array<{ type: string }>).map(
          (event) => event.type,
        ),
        chatTypes: ctx.db.tables.chatEvents.map((event) => event.type),
        holdSchedules: ctx.scheduler.runAtCalls.length,
        emailSchedules: ctx.scheduler.runAfterCalls.length,
        serverDerivedRescheduleEnd:
          held.endMs === serviceEndMs(service, rescheduledStartMs),
      })}`,
    );
  });

  test("collision rejection and scheduled expiry remain observable", async () => {
    const ctx = mutationContext();
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const startMs = futureAllowedStart(3);
    const input = {
      threadId: "thread-expiry",
      displayName: null,
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs,
      endMs: serviceEndMs(service, startMs),
    };
    await invoke(createHold, ctx, input);

    let collisionError = "";
    try {
      await invoke(createHold, ctx, {
        ...input,
        threadId: "thread-collision",
      });
    } catch (error) {
      collisionError = error instanceof Error ? error.message : String(error);
    }
    expect(collisionError).toBe("slot_conflict");
    expect(ctx.db.tables.reservations.length).toBe(1);
    expect(countByType(ctx, "reservation.held")).toBe(1);

    const held = ctx.db.tables.reservations[0]!;
    held.holdExpiresAtMs = Date.now() - 1;
    await invoke(expireHold, ctx, { reservationId: held._id });
    expect(held.status).toBe("expired");
    expect(countByType(ctx, "reservation.expired")).toBe(1);
  });

  test("cancel window threshold is strict", () => {
    const startMs = 48 * 60 * 60 * 1000;
    const windowMs = domainConfig.policies.cancelWindowHours * 60 * 60 * 1000;
    expect(isInsideCancelWindow(startMs, startMs - windowMs)).toBe(false);
    expect(isInsideCancelWindow(startMs, startMs - windowMs + 1)).toBe(true);
  });
});

describe("customer reservation lifecycle server boundaries", () => {
  test("exact same-slot reschedule rejects before audit, chat, email, or waitlist effects", async () => {
    const previousWaitlist = domainConfig.features.waitlist;
    domainConfig.features.waitlist = true;
    try {
      const ctx = mutationContext();
      const service = domainConfig.services[0]!;
      const resource = domainConfig.resources.find(
        (candidate) => candidate.kind === service.resourceKind,
      )!;
      const startMs = futureAllowedStart(4);
      const endMs = serviceEndMs(service, startMs);
      const hold = await invoke<
        {
          threadId: string;
          displayName: null;
          serviceKey: string;
          resourceKey: string;
          startMs: number;
          endMs: number;
        },
        { publicContext: { reservationId: string } }
      >(createHold, ctx, {
        threadId: "thread-same-slot",
        displayName: null,
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs,
        endMs,
      });
      await invoke(confirmReservation, ctx, {
        threadId: "thread-same-slot",
        reservationId: hold.publicContext.reservationId,
        confirmed: true,
      });
      await ctx.db.insert("reservations", {
        domainKey: domainConfig.domainKey,
        threadId: "thread-same-slot-waitlist",
        reservationNumber: "WAIT-SAME-SLOT",
        displayName: null,
        serviceKey: service.key,
        serviceLabel: service.label,
        resourceKey: resource.key,
        resourceLabel: resource.label,
        startMs,
        endMs,
        status: "waitlisted",
        holdExpiresAtMs: null,
        origin: "customer",
        auditHistory: [],
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      const row = ctx.db.tables.reservations[0]!;
      const before = {
        audit: (row.auditHistory as unknown[]).length,
        chat: ctx.db.tables.chatEvents.length,
        emails: ctx.scheduler.runAfterCalls.length,
      };

      expect(
        await capturedError(() =>
          invoke(rescheduleReservation, ctx, {
            threadId: "thread-same-slot",
            reservationId: hold.publicContext.reservationId,
            serviceKey: service.key,
            resourceKey: resource.key,
            startMs,
            endMs,
            requestedAtMs: 0,
          }),
        ),
      ).toBe("reservation_not_actionable");
      expect(row.status).toBe("confirmed");
      expect(row.startMs).toBe(startMs);
      expect(
        JSON.stringify({
          audit: (row.auditHistory as unknown[]).length,
          chat: ctx.db.tables.chatEvents.length,
          emails: ctx.scheduler.runAfterCalls.length,
        }),
      ).toBe(JSON.stringify(before));
      expect(countByType(ctx, "waitlist.slotOpened")).toBe(0);
    } finally {
      domainConfig.features.waitlist = previousWaitlist;
    }
  });

  test("partially overlapping reschedule does not announce its still-occupied old interval", async () => {
    const previousWaitlist = domainConfig.features.waitlist;
    domainConfig.features.waitlist = true;
    try {
      const ctx = mutationContext();
      const service = domainConfig.services[0]!;
      const resource = domainConfig.resources.find(
        (candidate) => candidate.kind === service.resourceKind,
      )!;
      const { startMs, movedStartMs } = futureAllowedOverlappingMove();
      const endMs = serviceEndMs(service, startMs);
      const hold = await invoke<
        {
          threadId: string;
          displayName: null;
          serviceKey: string;
          resourceKey: string;
          startMs: number;
          endMs: number;
        },
        { publicContext: { reservationId: string } }
      >(createHold, ctx, {
        threadId: "thread-overlapping-move",
        displayName: null,
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs,
        endMs,
      });
      await invoke(confirmReservation, ctx, {
        threadId: "thread-overlapping-move",
        reservationId: hold.publicContext.reservationId,
        confirmed: true,
      });
      await ctx.db.insert("reservations", {
        domainKey: domainConfig.domainKey,
        threadId: "thread-overlap-waitlist",
        reservationNumber: "WAIT-OVERLAP",
        displayName: null,
        serviceKey: service.key,
        serviceLabel: service.label,
        resourceKey: resource.key,
        resourceLabel: resource.label,
        startMs,
        endMs,
        status: "waitlisted",
        holdExpiresAtMs: null,
        origin: "customer",
        auditHistory: [],
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });

      await invoke(rescheduleReservation, ctx, {
        threadId: "thread-overlapping-move",
        reservationId: hold.publicContext.reservationId,
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs: movedStartMs,
        endMs: 0,
        requestedAtMs: 0,
      });

      const moved = ctx.db.tables.reservations[0]!;
      const waitlisted = ctx.db.tables.reservations[1]!;
      expect(moved.status).toBe("rescheduled");
      expect(moved.startMs).toBe(movedStartMs);
      expect((moved.auditHistory as unknown[]).length).toBe(3);
      expect(countByType(ctx, "reservation.rescheduled")).toBe(1);
      expect(ctx.scheduler.runAfterCalls.length).toBe(2);
      expect(countByType(ctx, "waitlist.slotOpened")).toBe(0);
      expect(JSON.stringify(waitlisted.auditHistory)).toBe(JSON.stringify([]));
    } finally {
      domainConfig.features.waitlist = previousWaitlist;
    }
  });

  test("hold derives end time and rejects strict service/resource keys and past slots", async () => {
    const ctx = mutationContext();
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const startMs = futureAllowedStart(3);

    await invoke(createHold, ctx, {
      threadId: "thread-server-end",
      displayName: null,
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs,
      endMs: startMs + 1,
    });
    expect(ctx.db.tables.reservations[0]?.endMs).toBe(
      serviceEndMs(service, startMs),
    );

    expect(
      await capturedError(() =>
        invoke(createHold, mutationContext(), {
          threadId: "thread-invalid-service",
          displayName: null,
          serviceKey: "missing-service",
          resourceKey: resource.key,
          startMs,
          endMs: serviceEndMs(service, startMs),
        }),
      ),
    ).toBe("service_not_found");
    expect(
      await capturedError(() =>
        invoke(createHold, mutationContext(), {
          threadId: "thread-invalid-resource",
          displayName: null,
          serviceKey: service.key,
          resourceKey: "missing-resource",
          startMs,
          endMs: serviceEndMs(service, startMs),
        }),
      ),
    ).toBe("resource_not_found");
    expect(
      await capturedError(() =>
        invoke(createHold, mutationContext(), {
          threadId: "thread-past",
          displayName: null,
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: pastAllowedStart(),
          endMs: 0,
        }),
      ),
    ).toBe("slot_in_past");
  });

  test("cancel ignores a forged client clock and uses the exact server threshold", async () => {
    const ctx = mutationContext();
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const startMs = futureAllowedStart(4);
    const hold = await invoke<
      {
        threadId: string;
        displayName: null;
        serviceKey: string;
        resourceKey: string;
        startMs: number;
        endMs: number;
      },
      { publicContext: { reservationId: string } }
    >(createHold, ctx, {
      threadId: "thread-server-clock",
      displayName: null,
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs,
      endMs: serviceEndMs(service, startMs),
    });
    await invoke(confirmReservation, ctx, {
      threadId: "thread-server-clock",
      reservationId: hold.publicContext.reservationId,
      confirmed: true,
    });

    const result = await invoke<
      { threadId: string; reservationId: string; requestedAtMs: number },
      { escalated: boolean }
    >(cancelReservation, ctx, {
      threadId: "thread-server-clock",
      reservationId: hold.publicContext.reservationId,
      requestedAtMs: startMs,
    });
    expect(result.escalated).toBe(false);
    expect(ctx.db.tables.reservations[0]?.status).toBe("cancelled");
  });

  test("cancel applies the strict threshold to the server clock at the mutation boundary", async () => {
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const startMs = futureAllowedStart(5);
    const windowMs = domainConfig.policies.cancelWindowHours * 60 * 60 * 1000;
    const originalNow = Date.now;

    try {
      for (const scenario of [
        { serverNow: startMs - windowMs, expectedEscalated: false },
        { serverNow: startMs - windowMs + 1, expectedEscalated: true },
      ]) {
        Date.now = () => scenario.serverNow;
        const ctx = mutationContext();
        const hold = await invoke<
          {
            threadId: string;
            displayName: null;
            serviceKey: string;
            resourceKey: string;
            startMs: number;
            endMs: number;
          },
          { publicContext: { reservationId: string } }
        >(createHold, ctx, {
          threadId: `thread-threshold-${scenario.expectedEscalated}`,
          displayName: null,
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs,
          endMs: 0,
        });
        await invoke(confirmReservation, ctx, {
          threadId: `thread-threshold-${scenario.expectedEscalated}`,
          reservationId: hold.publicContext.reservationId,
          confirmed: true,
        });
        const result = await invoke<
          { threadId: string; reservationId: string; requestedAtMs: number },
          { escalated: boolean }
        >(cancelReservation, ctx, {
          threadId: `thread-threshold-${scenario.expectedEscalated}`,
          reservationId: hold.publicContext.reservationId,
          requestedAtMs: scenario.expectedEscalated ? 0 : startMs,
        });
        expect(result.escalated).toBe(scenario.expectedEscalated);
      }
    } finally {
      Date.now = originalNow;
    }
  });

  test("reschedule derives end and server time while enforcing strict keys and future slots", async () => {
    const ctx = mutationContext();
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const initialStartMs = futureAllowedStart(4);
    const hold = await invoke<
      {
        threadId: string;
        displayName: null;
        serviceKey: string;
        resourceKey: string;
        startMs: number;
        endMs: number;
      },
      { publicContext: { reservationId: string } }
    >(createHold, ctx, {
      threadId: "thread-reschedule-server-fields",
      displayName: null,
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs: initialStartMs,
      endMs: serviceEndMs(service, initialStartMs),
    });
    await invoke(confirmReservation, ctx, {
      threadId: "thread-reschedule-server-fields",
      reservationId: hold.publicContext.reservationId,
      confirmed: true,
    });

    const nextStartMs = futureAllowedStart(6);
    await invoke(rescheduleReservation, ctx, {
      threadId: "thread-reschedule-server-fields",
      reservationId: hold.publicContext.reservationId,
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs: nextStartMs,
      endMs: nextStartMs + 1,
      requestedAtMs: initialStartMs,
    });
    expect(ctx.db.tables.reservations[0]?.startMs).toBe(nextStartMs);
    expect(ctx.db.tables.reservations[0]?.endMs).toBe(
      serviceEndMs(service, nextStartMs),
    );

    expect(
      await capturedError(() =>
        invoke(rescheduleReservation, ctx, {
          threadId: "thread-reschedule-server-fields",
          reservationId: hold.publicContext.reservationId,
          serviceKey: "missing-service",
          resourceKey: resource.key,
          startMs: futureAllowedStart(8),
          endMs: 0,
          requestedAtMs: 0,
        }),
      ),
    ).toBe("service_not_found");
  });

  test("expired and repeated actions reject before audit, chat, email, or waitlist effects", async () => {
    const ctx = mutationContext();
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const startMs = futureAllowedStart(3);
    const hold = await invoke<
      {
        threadId: string;
        displayName: null;
        serviceKey: string;
        resourceKey: string;
        startMs: number;
        endMs: number;
      },
      { publicContext: { reservationId: string } }
    >(createHold, ctx, {
      threadId: "thread-repeat",
      displayName: null,
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs,
      endMs: serviceEndMs(service, startMs),
    });
    await invoke(confirmReservation, ctx, {
      threadId: "thread-repeat",
      reservationId: hold.publicContext.reservationId,
      confirmed: true,
    });
    await invoke(cancelReservation, ctx, {
      threadId: "thread-repeat",
      reservationId: hold.publicContext.reservationId,
      requestedAtMs: Date.now(),
    });

    const row = ctx.db.tables.reservations[0]!;
    const beforeAudit = (row.auditHistory as unknown[]).length;
    const beforeEvents = ctx.db.tables.chatEvents.length;
    const beforeEmails = ctx.scheduler.runAfterCalls.length;
    expect(
      await capturedError(() =>
        invoke(cancelReservation, ctx, {
          threadId: "thread-repeat",
          reservationId: hold.publicContext.reservationId,
          requestedAtMs: 0,
        }),
      ),
    ).toBe("reservation_not_actionable");
    expect((row.auditHistory as unknown[]).length).toBe(beforeAudit);
    expect(ctx.db.tables.chatEvents.length).toBe(beforeEvents);
    expect(ctx.scheduler.runAfterCalls.length).toBe(beforeEmails);

    expect(
      await capturedError(() =>
        invoke(confirmReservation, ctx, {
          threadId: "thread-repeat",
          reservationId: hold.publicContext.reservationId,
          confirmed: true,
        }),
      ),
    ).toBe("reservation_not_actionable");
    expect((row.auditHistory as unknown[]).length).toBe(beforeAudit);
    expect(ctx.db.tables.chatEvents.length).toBe(beforeEvents);
    expect(ctx.scheduler.runAfterCalls.length).toBe(beforeEmails);
  });

  test("a stale expired hold rejects confirmation without duplicating side effects", async () => {
    const ctx = mutationContext();
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const startMs = futureAllowedStart(3);
    const hold = await invoke<
      {
        threadId: string;
        displayName: null;
        serviceKey: string;
        resourceKey: string;
        startMs: number;
        endMs: number;
      },
      { publicContext: { reservationId: string } }
    >(createHold, ctx, {
      threadId: "thread-expired-repeat",
      displayName: null,
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs,
      endMs: serviceEndMs(service, startMs),
    });
    const row = ctx.db.tables.reservations[0]!;
    row.holdExpiresAtMs = Date.now() - 1;
    await invoke(expireHold, ctx, { reservationId: row._id });
    const beforeAudit = (row.auditHistory as unknown[]).length;
    const beforeEvents = ctx.db.tables.chatEvents.length;
    const beforeScheduled = ctx.scheduler.runAfterCalls.length;

    expect(
      await capturedError(() =>
        invoke(confirmReservation, ctx, {
          threadId: "thread-expired-repeat",
          reservationId: hold.publicContext.reservationId,
          confirmed: true,
        }),
      ),
    ).toBe("reservation_not_actionable");
    expect((row.auditHistory as unknown[]).length).toBe(beforeAudit);
    expect(ctx.db.tables.chatEvents.length).toBe(beforeEvents);
    expect(ctx.scheduler.runAfterCalls.length).toBe(beforeScheduled);
  });

  test("a held row past its deadline cannot be cancelled before the expiry scheduler catches up", async () => {
    const ctx = mutationContext();
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const startMs = futureAllowedStart(3);
    const hold = await invoke<
      {
        threadId: string;
        displayName: null;
        serviceKey: string;
        resourceKey: string;
        startMs: number;
        endMs: number;
      },
      { publicContext: { reservationId: string } }
    >(createHold, ctx, {
      threadId: "thread-expired-cancel",
      displayName: null,
      serviceKey: service.key,
      resourceKey: resource.key,
      startMs,
      endMs: 0,
    });
    const row = ctx.db.tables.reservations[0]!;
    row.holdExpiresAtMs = Date.now() - 1;
    const beforeAudit = (row.auditHistory as unknown[]).length;
    const beforeEvents = ctx.db.tables.chatEvents.length;

    expect(
      await capturedError(() =>
        invoke(cancelReservation, ctx, {
          threadId: "thread-expired-cancel",
          reservationId: hold.publicContext.reservationId,
          requestedAtMs: 0,
        }),
      ),
    ).toBe("reservation_not_actionable");
    expect((row.auditHistory as unknown[]).length).toBe(beforeAudit);
    expect(ctx.db.tables.chatEvents.length).toBe(beforeEvents);
  });

  test("the full invalid status matrix is rejected before any side effect", async () => {
    const service = domainConfig.services[0]!;
    const resource = domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    )!;
    const invalidByAction = {
      confirm: [
        "confirmed",
        "rescheduled",
        "cancelled",
        "expired",
        "escalated",
        "waitlisted",
      ],
      cancel: ["cancelled", "expired", "escalated", "waitlisted"],
      reschedule: ["held", "cancelled", "expired", "escalated", "waitlisted"],
    } as const;

    for (const [action, statuses] of Object.entries(invalidByAction)) {
      for (const status of statuses) {
        const ctx = mutationContext();
        const reservationNumber = `PIN-${action}-${status}`.toUpperCase();
        const startMs = futureAllowedStart(5);
        await ctx.db.insert("reservations", {
          domainKey: domainConfig.domainKey,
          threadId: "thread-status-matrix",
          reservationNumber,
          displayName: null,
          serviceKey: service.key,
          serviceLabel: service.label,
          resourceKey: resource.key,
          resourceLabel: resource.label,
          startMs,
          endMs: serviceEndMs(service, startMs),
          status,
          holdExpiresAtMs:
            status === "held" ? Date.now() + 10 * 60 * 1000 : null,
          origin: "customer",
          auditHistory: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        });

        const error = await capturedError(() => {
          if (action === "confirm") {
            return invoke(confirmReservation, ctx, {
              threadId: "thread-status-matrix",
              reservationId: reservationNumber,
              confirmed: true,
            });
          }
          if (action === "cancel") {
            return invoke(cancelReservation, ctx, {
              threadId: "thread-status-matrix",
              reservationId: reservationNumber,
              requestedAtMs: 0,
            });
          }
          return invoke(rescheduleReservation, ctx, {
            threadId: "thread-status-matrix",
            reservationId: reservationNumber,
            serviceKey: service.key,
            resourceKey: resource.key,
            startMs: futureAllowedStart(7),
            endMs: 0,
            requestedAtMs: 0,
          });
        });
        expect(error).toBe("reservation_not_actionable");
        expect(ctx.db.tables.chatThreads.length).toBe(0);
        expect(ctx.db.tables.chatEvents.length).toBe(0);
        expect(ctx.scheduler.runAtCalls.length).toBe(0);
        expect(ctx.scheduler.runAfterCalls.length).toBe(0);
        expect(
          (ctx.db.tables.reservations[0]?.auditHistory as unknown[]).length,
        ).toBe(0);
      }
    }
  });

  test("a freed slot notifies one waitlisted reservation once", async () => {
    const previousWaitlist = domainConfig.features.waitlist;
    domainConfig.features.waitlist = true;
    try {
      const ctx = mutationContext();
      const service = domainConfig.services[0]!;
      const resource = domainConfig.resources.find(
        (candidate) => candidate.kind === service.resourceKind,
      )!;
      const startMs = futureAllowedStart(4);
      const endMs = serviceEndMs(service, startMs);
      const hold = await invoke<
        {
          threadId: string;
          displayName: null;
          serviceKey: string;
          resourceKey: string;
          startMs: number;
          endMs: number;
        },
        { publicContext: { reservationId: string } }
      >(createHold, ctx, {
        threadId: "thread-waitlist-owner",
        displayName: null,
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs,
        endMs,
      });
      await invoke(confirmReservation, ctx, {
        threadId: "thread-waitlist-owner",
        reservationId: hold.publicContext.reservationId,
        confirmed: true,
      });
      await ctx.db.insert("reservations", {
        domainKey: domainConfig.domainKey,
        threadId: "thread-waitlisted",
        reservationNumber: "WAITLIST-PIN",
        displayName: null,
        serviceKey: service.key,
        serviceLabel: service.label,
        resourceKey: resource.key,
        resourceLabel: resource.label,
        startMs,
        endMs,
        status: "waitlisted",
        holdExpiresAtMs: null,
        origin: "customer",
        auditHistory: [],
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });

      const nextStartMs = futureAllowedStart(7);
      await invoke(rescheduleReservation, ctx, {
        threadId: "thread-waitlist-owner",
        reservationId: hold.publicContext.reservationId,
        serviceKey: service.key,
        resourceKey: resource.key,
        startMs: nextStartMs,
        endMs: 0,
        requestedAtMs: Number.MAX_SAFE_INTEGER,
      });
      const waitlisted = ctx.db.tables.reservations[1]!;
      expect(countByType(ctx, "waitlist.slotOpened")).toBe(1);
      expect(
        (waitlisted.auditHistory as Array<{ type: string }>)[0]?.type,
      ).toBe("waitlist.notified");
      expect(ctx.scheduler.runAfterCalls.length).toBe(3);

      await invoke(cancelReservation, ctx, {
        threadId: "thread-waitlist-owner",
        reservationId: hold.publicContext.reservationId,
        requestedAtMs: 0,
      });
      const beforeRepeat = ctx.scheduler.runAfterCalls.length;
      expect(
        await capturedError(() =>
          invoke(cancelReservation, ctx, {
            threadId: "thread-waitlist-owner",
            reservationId: hold.publicContext.reservationId,
            requestedAtMs: 0,
          }),
        ),
      ).toBe("reservation_not_actionable");
      expect(countByType(ctx, "waitlist.slotOpened")).toBe(1);
      expect(ctx.scheduler.runAfterCalls.length).toBe(beforeRepeat);
      console.log(
        `MANUAL_QA_WAITLIST=${JSON.stringify({
          notificationEvents: countByType(ctx, "waitlist.slotOpened"),
          waitlistAuditTypes: (
            waitlisted.auditHistory as Array<{ type: string }>
          ).map((event) => event.type),
          repeatError: "reservation_not_actionable",
          schedulerCallsAfterRepeat: ctx.scheduler.runAfterCalls.length,
        })}`,
      );
    } finally {
      domainConfig.features.waitlist = previousWaitlist;
    }
  });
});

async function capturedError(operation: () => Promise<unknown>) {
  try {
    await operation();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
