import { describe, expect, mock, test } from "bun:test";
import type {
  AdminDashboardSnapshot,
  AdminNoShowResult,
  AdminReservationRef,
} from "@jeomwon/backend/src/agent-contract";
import { type FunctionReference, getFunctionName } from "convex/server";
import { useSyncExternalStore } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let snapshot = makeSnapshot("confirmed");
const listeners = new Set<() => void>();
let mutationCalls: AdminReservationRef[] = [];
let mutation: (args: AdminReservationRef) => Promise<AdminNoShowResult>;
const mutationRefs: string[] = [];

mock.module("convex/react", () => ({
  useConvex: () => ({ query: async () => ({ slots: [] }) }),
  useQuery: (reference: FunctionReference<"query">) => {
    expect(getFunctionName(reference)).toBe("admin:dashboardSnapshot");
    return useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => snapshot,
      () => snapshot,
    );
  },
  useMutation: (reference: FunctionReference<"mutation">) => {
    const name = getFunctionName(reference);
    mutationRefs.push(name);
    if (name === "admin:markReservationNoShow") {
      return (args: AdminReservationRef) => mutation(args);
    }
    return async () => ({});
  },
}));

mock.module("@/locales/client", () => ({
  useScopedI18n: () => (key: string) => key,
}));

const { AdminDashboard } = await import("./admin-dashboard");

function button(renderer: ReactTestRenderer, testId: string) {
  return renderer.root.find((node) => node.props["data-testid"] === testId);
}

function hasButton(renderer: ReactTestRenderer, testId: string) {
  return (
    renderer.root.findAll((node) => node.props["data-testid"] === testId)
      .length > 0
  );
}

async function renderDashboard() {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<AdminDashboard />);
  });
  return renderer!;
}

function publish(status: "confirmed" | "no_show") {
  snapshot = makeSnapshot(status);
  for (const listener of listeners) listener();
}

describe("AdminDashboard no-show Convex integration", () => {
  test("suppresses duplicate pending writes and removes the action only after subscription reconciliation", async () => {
    snapshot = makeSnapshot("confirmed");
    mutationCalls = [];
    let resolve: ((result: AdminNoShowResult) => void) | undefined;
    mutation = (args) => {
      mutationCalls.push(args);
      return new Promise((done) => {
        resolve = done;
      });
    };
    const renderer = await renderDashboard();
    expect(mutationRefs).toContain("admin:markReservationNoShow");

    await act(async () => button(renderer, "mark-no-show").props.onClick());
    const confirm = button(renderer, "confirm-no-show");
    await act(async () => {
      confirm.props.onClick();
      confirm.props.onClick();
    });
    expect(mutationCalls).toEqual([{ reservationId: "NS-INTEGRATION" }]);
    expect(button(renderer, "confirm-no-show").props.disabled).toBe(true);
    expect(button(renderer, "cancel-no-show").props.disabled).toBe(true);

    await act(async () => resolve?.(resultFixture()));
    expect(hasButton(renderer, "mark-no-show")).toBe(true);

    await act(async () => publish("no_show"));
    expect(hasButton(renderer, "mark-no-show")).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).toContain("status.no_show");
    await act(async () => renderer.unmount());
  });

  test("renders a stable server error, preserves status, and releases the guard for retry", async () => {
    snapshot = makeSnapshot("confirmed");
    mutationCalls = [];
    mutation = async (args) => {
      mutationCalls.push(args);
      throw new Error("no_show_future");
    };
    const renderer = await renderDashboard();

    await act(async () => button(renderer, "mark-no-show").props.onClick());
    await act(async () => button(renderer, "confirm-no-show").props.onClick());
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "noShow.errors.no_show_future",
    );
    expect(hasButton(renderer, "mark-no-show")).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain("status.confirmed");

    await act(async () => button(renderer, "mark-no-show").props.onClick());
    await act(async () => button(renderer, "confirm-no-show").props.onClick());
    expect(mutationCalls).toEqual([
      { reservationId: "NS-INTEGRATION" },
      { reservationId: "NS-INTEGRATION" },
    ]);
    await act(async () => renderer.unmount());
  });
});

function resultFixture(): AdminNoShowResult {
  const reservation = makeSnapshot("no_show").reservations[0]!;
  return {
    reservation,
    publicContext: {
      displayName: reservation.displayName,
      reservationId: reservation.id,
      serviceLabel: reservation.serviceLabel,
      resourceLabel: reservation.resourceLabel,
      timeWindow: reservation.timeWindow,
      status: "no_show",
      policySummary: "Policy",
      nextStep: "Contact the store",
    },
    auditType: "reservation.no_show",
  };
}

function makeSnapshot(status: "confirmed" | "no_show"): AdminDashboardSnapshot {
  const generatedAtMs = Date.UTC(2026, 7, 11, 3);
  return {
    domain: {
      domainKey: "integration",
      storeName: "Integration Store",
      storeTimezone: "Asia/Seoul",
      locale: "en-US",
      adminWidget: "seatGrid",
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
        operatorCalendarCrud: false,
        noShow: true,
      },
    },
    reservations: [
      {
        id: "NS-INTEGRATION",
        threadId: "customer-thread",
        origin: "customer",
        displayName: "Customer",
        serviceKey: "consultation",
        serviceLabel: "Consultation",
        resourceKey: "room-a",
        resourceLabel: "Room A",
        startMs: generatedAtMs - 60_000,
        endMs: generatedAtMs + 60_000,
        timeWindow: "11:59-12:01",
        status,
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
      },
    ],
    escalations: [],
    events: [],
    generatedAtMs,
  };
}
