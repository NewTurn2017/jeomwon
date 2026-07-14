// Unit tests for the config-independent engine arithmetic. These run with
// `bun test` and must stay valid for ANY injected domain pack: every service
// object is constructed explicitly here, and the only config the assertions
// touch is the store timezone — through round-trip properties that hold in
// every zone. Business-hour/blackout behavior is config-shaped and is covered
// by the live QA gates instead.
import { describe, expect, test } from "bun:test";
import type { Doc } from "../convex/_generated/dataModel";
import {
  alignToSlot,
  calendarParts,
  hasCollision,
  serviceEndMs,
} from "../convex/engine/availability";
import { isActiveReservation } from "../convex/engine/lifecycle";
import type { DomainService } from "../domain.config";
import { getServiceDurationMinutes } from "../domain.config";

const MINUTE = 60 * 1000;

function service(overrides: Partial<DomainService>): DomainService {
  return {
    key: "svc",
    label: "서비스",
    resourceKind: "person",
    ...overrides,
  };
}

function reservation(overrides: Partial<Doc<"reservations">>) {
  return {
    _id: "r1",
    resourceKey: "seat-1",
    status: "confirmed",
    startMs: 1_000 * MINUTE,
    endMs: 1_060 * MINUTE,
    holdExpiresAtMs: null,
    ...overrides,
  } as Doc<"reservations">;
}

describe("getServiceDurationMinutes", () => {
  test("explicit durationMinutes wins", () => {
    expect(getServiceDurationMinutes(service({ durationMinutes: 90 }))).toBe(
      90,
    );
  });

  test("slot unit defaults: hour → 60, default → 30, day without dayUnit → 1440", () => {
    expect(getServiceDurationMinutes(service({ slotUnit: "hour" }))).toBe(60);
    expect(getServiceDurationMinutes(service({}))).toBe(30);
    expect(getServiceDurationMinutes(service({ slotUnit: "day" }))).toBe(1440);
  });

  test("day unit crossing midnight: check-in 15:00 → check-out 11:00 is 20h", () => {
    const stay = service({
      slotUnit: "day",
      dayUnit: {
        checkInTime: "15:00",
        checkOutTime: "11:00",
        checkInLabel: "체크인",
        checkOutLabel: "체크아웃",
      },
    });
    expect(getServiceDurationMinutes(stay)).toBe(20 * 60);
  });

  test("day unit same-day: 09:00 → 18:00 is 9h", () => {
    const rental = service({
      slotUnit: "day",
      dayUnit: {
        checkInTime: "09:00",
        checkOutTime: "18:00",
        checkInLabel: "수령",
        checkOutLabel: "반납",
      },
    });
    expect(getServiceDurationMinutes(rental)).toBe(9 * 60);
  });
});

describe("serviceEndMs", () => {
  test("adds the service duration to the start", () => {
    expect(serviceEndMs(service({ durationMinutes: 45 }), 0)).toBe(45 * MINUTE);
  });
});

describe("alignToSlot (30-minute grid)", () => {
  test("a timestamp already on the grid stays put", () => {
    expect(alignToSlot(60 * MINUTE)).toBe(60 * MINUTE);
  });

  test("one millisecond past a boundary rounds up to the next slot", () => {
    expect(alignToSlot(60 * MINUTE + 1)).toBe(90 * MINUTE);
  });

  test("day-unit slots land exactly on the check-in wall time", () => {
    const stay = service({
      slotUnit: "day",
      dayUnit: {
        checkInTime: "15:00",
        checkOutTime: "11:00",
        checkInLabel: "체크인",
        checkOutLabel: "체크아웃",
      },
    });
    const aligned = alignToSlot(Date.now(), stay);
    expect(calendarParts(aligned).minutesSinceMidnight).toBe(15 * 60);
  });
});

describe("hasCollision (half-open interval overlap)", () => {
  const existing = [reservation({})]; // occupies [1000m, 1060m) on seat-1

  test("an overlapping range on the same resource collides", () => {
    expect(
      hasCollision(existing, "seat-1", 1_030 * MINUTE, 1_090 * MINUTE),
    ).toBe(true);
  });

  test("touching intervals do not collide (end == start)", () => {
    expect(
      hasCollision(existing, "seat-1", 1_060 * MINUTE, 1_120 * MINUTE),
    ).toBe(false);
    expect(hasCollision(existing, "seat-1", 940 * MINUTE, 1_000 * MINUTE)).toBe(
      false,
    );
  });

  test("a different resource never collides", () => {
    expect(
      hasCollision(existing, "seat-2", 1_030 * MINUTE, 1_090 * MINUTE),
    ).toBe(false);
  });

  test("the excluded reservation is skipped (reschedule path)", () => {
    const target = existing[0]!;
    expect(
      hasCollision(
        existing,
        "seat-1",
        1_030 * MINUTE,
        1_090 * MINUTE,
        target._id,
      ),
    ).toBe(false);
  });

  test("an expired hold no longer blocks the slot", () => {
    const expiredHold = [
      reservation({ status: "held", holdExpiresAtMs: Date.now() - MINUTE }),
    ];
    expect(
      hasCollision(expiredHold, "seat-1", 1_030 * MINUTE, 1_090 * MINUTE),
    ).toBe(false);
  });

  test("a live hold still blocks the slot", () => {
    const liveHold = [
      reservation({
        status: "held",
        holdExpiresAtMs: Date.now() + 60 * MINUTE,
      }),
    ];
    expect(
      hasCollision(liveHold, "seat-1", 1_030 * MINUTE, 1_090 * MINUTE),
    ).toBe(true);
  });
});

describe("isActiveReservation", () => {
  test("confirmed and rescheduled are active; cancelled and expired are not", () => {
    expect(isActiveReservation(reservation({ status: "confirmed" }))).toBe(
      true,
    );
    expect(isActiveReservation(reservation({ status: "rescheduled" }))).toBe(
      true,
    );
    expect(isActiveReservation(reservation({ status: "cancelled" }))).toBe(
      false,
    );
    expect(isActiveReservation(reservation({ status: "expired" }))).toBe(false);
  });
});

describe("calendarParts", () => {
  test("returns a well-formed wall-clock reading in the store timezone", () => {
    const parts = calendarParts(Date.UTC(2026, 7, 15, 3, 0)); // 2026-08-15T03:00Z
    expect(parts.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parts.minutesSinceMidnight).toBeGreaterThanOrEqual(0);
    expect(parts.minutesSinceMidnight).toBeLessThan(24 * 60);
  });

  test("advancing 30 minutes advances the wall clock by 30 minutes (mod day)", () => {
    const base = Date.UTC(2026, 7, 15, 3, 0);
    const a = calendarParts(base);
    const b = calendarParts(base + 30 * MINUTE);
    expect(
      (b.minutesSinceMidnight - a.minutesSinceMidnight + 24 * 60) % (24 * 60),
    ).toBe(30);
  });
});
