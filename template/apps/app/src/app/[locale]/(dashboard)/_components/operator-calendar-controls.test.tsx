import { describe, expect, test } from "bun:test";
import type { AdminDashboardSnapshot } from "@jeomwon/backend/src/agent-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { OperatorCalendarState } from "./operator-calendar-controller";
import {
  OperatorCalendarControlsView,
  operatorCalendarCopyEn,
} from "./operator-calendar-controls";

const idle: OperatorCalendarState = { pending: false, error: null };

describe("operator calendar controls rendering", () => {
  test("renders required create/operator/customer selectors without customer title fields", () => {
    const html = render(snapshot(), idle);
    expect(html).toContain('data-testid="operator-calendar-create"');
    expect(html).toContain('data-testid="operator-session-OP-101-edit"');
    expect(html).toContain('data-testid="reservation-R-202-reschedule"');
    expect(html).toContain('data-testid="reservation-R-202-cancel"');
    expect(html).not.toContain("Customer A</button>");
  });

  test("renders hidden, loading, empty, and stable localized error states", () => {
    expect(render(snapshot({ enabled: false }), idle)).toBe("");
    expect(render(snapshot({ reservations: [] }), idle)).toContain(
      'data-testid="operator-calendar-empty"',
    );
    expect(render(snapshot(), { pending: true, error: null })).toContain(
      'aria-busy="true"',
    );
    const error = render(snapshot(), {
      pending: false,
      error: "slot_unavailable",
    });
    expect(error).toContain('data-testid="operator-calendar-error"');
    expect(error).toContain(operatorCalendarCopyEn.errors.slot_unavailable);
    expect(error).not.toContain("slot_conflict");
  });

  test("renders the focused form selector for create and customer reschedule modes", () => {
    expect(render(snapshot(), idle, { kind: "create" })).toContain(
      'data-testid="operator-calendar-form"',
    );
    const customerForm = render(snapshot(), idle, {
      kind: "rescheduleCustomer",
      reservationId: "R-202",
    });
    expect(customerForm).toContain('data-testid="operator-calendar-form"');
    expect(customerForm).not.toContain('name="title"');
  });
});

function render(
  value: AdminDashboardSnapshot,
  state: OperatorCalendarState,
  initialEditor:
    | { kind: "create" }
    | { kind: "rescheduleCustomer"; reservationId: string }
    | null = null,
) {
  return renderToStaticMarkup(
    <OperatorCalendarControlsView
      copy={operatorCalendarCopyEn}
      initialEditor={initialEditor}
      snapshot={value}
      state={state}
      onCancel={() => undefined}
      onCreate={() => undefined}
      onRescheduleCustomer={() => undefined}
      onUpdateOperator={() => undefined}
    />,
  );
}

function snapshot(
  options: {
    enabled?: boolean;
    reservations?: AdminDashboardSnapshot["reservations"];
  } = {},
): AdminDashboardSnapshot {
  const base = {
    threadId: "thread",
    displayName: "Team block",
    serviceKey: "consultation",
    serviceLabel: "Consultation",
    resourceKey: "room-a",
    resourceLabel: "Room A",
    startMs: Date.UTC(2026, 7, 11, 1, 30),
    endMs: Date.UTC(2026, 7, 11, 2, 30),
    timeWindow: "10:30-11:30",
    status: "confirmed" as const,
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
  const reservations = options.reservations ?? [
    { ...base, id: "OP-101", origin: "operator" as const },
    {
      ...base,
      id: "R-202",
      origin: "customer" as const,
      displayName: "Customer A",
    },
  ];
  return {
    domain: {
      domainKey: "fixture",
      storeName: "Fixture",
      storeTimezone: "Asia/Seoul",
      locale: "en-US",
      adminWidget: "calendar",
      businessHours: {
        monday: { open: "09:00", close: "18:00" },
        tuesday: { open: "09:00", close: "18:00" },
        wednesday: { open: "09:00", close: "18:00" },
        thursday: { open: "09:00", close: "18:00" },
        friday: { open: "09:00", close: "18:00" },
        saturday: { closed: true },
        sunday: { closed: true },
      },
      resources: [{ key: "room-a", label: "Room A", kind: "person" }],
      services: [
        {
          key: "consultation",
          label: "Consultation",
          durationMinutes: 60,
          resourceKind: "person",
        },
      ],
      policies: {
        cancelWindowHours: 24,
        holdMinutes: 10,
        confirmationRequired: true,
      },
      features: {
        email: false,
        polar: false,
        waitlist: false,
        customerAccounts: true,
        operatorCalendarCrud: options.enabled ?? true,
        noShow: false,
      },
    },
    reservations,
    escalations: [],
    events: [],
    generatedAtMs: Date.UTC(2026, 7, 9),
  };
}
