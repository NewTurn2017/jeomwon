import { describe, expect, test } from "bun:test";
import type { AdminReservation } from "@jeomwon/backend/src/agent-contract";
import {
  applyOperatorCalendarQaAction,
  operatorCalendarQaStateHash,
} from "./operator-calendar-qa-state";

const operatorRow: AdminReservation = {
  id: "OP-101",
  threadId: "operator:OP-101",
  origin: "operator",
  displayName: "Team focus block",
  serviceKey: "consultation",
  serviceLabel: "Consultation",
  resourceKey: "room-a",
  resourceLabel: "Room A",
  startMs: Date.UTC(2026, 7, 11, 1, 30),
  endMs: Date.UTC(2026, 7, 11, 2, 30),
  timeWindow: "10:30-11:30",
  status: "confirmed",
  holdExpiresAtMs: null,
  auditHistory: [],
  internalContext: {
    operatorMemo: null,
    privateDecision: null,
    riskSignals: [],
    costBasisCents: null,
  },
  createdAtMs: 1,
  updatedAtMs: 1,
};

describe("operator calendar QA state", () => {
  test("every successful action produces a deterministic state transition", () => {
    const baseline = [operatorRow];
    const baselineHash = operatorCalendarQaStateHash(baseline);
    const created = applyOperatorCalendarQaAction(baseline, {
      kind: "create",
      args: {
        title: "QA block",
        serviceKey: "consultation",
        resourceKey: "room-a",
        dateKey: "2026-08-13",
        startTime: "11:00",
      },
    });
    const updated = applyOperatorCalendarQaAction(created, {
      kind: "update",
      args: {
        reservationId: "OP-101",
        title: "Updated block",
        serviceKey: "consultation",
        resourceKey: "room-a",
        dateKey: "2026-08-14",
        startTime: "12:00",
      },
    });
    const rescheduled = applyOperatorCalendarQaAction(updated, {
      kind: "reschedule",
      args: {
        reservationId: "OP-101",
        serviceKey: "consultation",
        resourceKey: "room-a",
        dateKey: "2026-08-15",
        startTime: "13:00",
      },
    });
    const cancelled = applyOperatorCalendarQaAction(rescheduled, {
      kind: "cancel",
      args: { reservationId: "OP-QA-CREATED" },
    });

    expect(
      new Set(
        [created, updated, rescheduled, cancelled].map(
          operatorCalendarQaStateHash,
        ),
      ).size,
    ).toBe(4);
    expect(operatorCalendarQaStateHash(cancelled)).not.toBe(baselineHash);
    expect(rescheduled.find((row) => row.id === "OP-101")?.displayName).toBe(
      "Updated block",
    );
  });

  test("equivalent untouched state retains the baseline hash", () => {
    expect(operatorCalendarQaStateHash([{ ...operatorRow }])).toBe(
      operatorCalendarQaStateHash([operatorRow]),
    );
  });
});
