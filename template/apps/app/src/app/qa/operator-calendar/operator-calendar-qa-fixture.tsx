"use client";

import type {
  AdminDashboardSnapshot,
  AdminReservation,
} from "@jeomwon/backend/src/agent-contract";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  createOperatorCalendarController,
  type OperatorCalendarGateway,
} from "@/app/[locale]/(dashboard)/_components/operator-calendar-controller";
import {
  OperatorCalendarControlsView,
  operatorCalendarCopyEn,
  operatorCalendarCopyKo,
} from "@/app/[locale]/(dashboard)/_components/operator-calendar-controls";
import {
  applyOperatorCalendarQaAction,
  type OperatorCalendarQaAction,
  operatorCalendarQaStateHash,
} from "./operator-calendar-qa-state";

type FixtureState = {
  requestedActions: string[];
  reservations: AdminReservation[];
  requestCount: number;
  scenario: string;
};

export function OperatorCalendarQaFixture({
  lang,
  scenario,
}: {
  lang: "ko" | "en";
  scenario: string;
}) {
  const initialRows = qaSnapshot(scenario).reservations;
  const baselineHash = operatorCalendarQaStateHash(initialRows);
  const [fixture, setFixture] = useState<FixtureState>({
    requestedActions: [],
    reservations: initialRows,
    requestCount: 0,
    scenario,
  });
  const [controller] = useState(() =>
    createOperatorCalendarController(mockGateway(scenario, setFixture)),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const snapshot = qaSnapshot(scenario, fixture.reservations);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-screen-xl content-start gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="rounded-lg border border-border bg-card p-5">
        <p className="font-medium text-primary text-sm">QA fixture</p>
        <h1 className="mt-1 font-semibold text-card-foreground text-xl">
          {lang === "ko" ? "운영자 캘린더" : "Operator calendar"}
        </h1>
      </header>
      {scenario === "loading" ? (
        <section
          aria-busy="true"
          className="grid gap-5 rounded-lg border border-border bg-card p-5"
        >
          <p className="font-medium text-card-foreground text-sm">
            {lang === "ko"
              ? "캘린더를 불러오는 중입니다."
              : "Loading the calendar."}
          </p>
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-16 animate-pulse rounded-md bg-muted" />
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        </section>
      ) : (
        <OperatorCalendarControlsView
          copy={lang === "ko" ? operatorCalendarCopyKo : operatorCalendarCopyEn}
          snapshot={snapshot}
          state={state}
          onCreate={async (args) => {
            await controller.create(args);
            return controller.getSnapshot().error === null;
          }}
          onUpdateOperator={async (args) => {
            await controller.updateOperator(args);
            return controller.getSnapshot().error === null;
          }}
          onRescheduleCustomer={async (args) => {
            await controller.rescheduleCustomer(args);
            return controller.getSnapshot().error === null;
          }}
          onCancel={async (args) => {
            await controller.cancel(args);
            return controller.getSnapshot().error === null;
          }}
        />
      )}
      <output
        aria-hidden="true"
        className="sr-only"
        data-testid="operator-calendar-fixture-json"
      >
        {JSON.stringify({
          requestedAction: fixture.requestedActions.at(-1) ?? null,
          requestedActions: fixture.requestedActions,
          requestCount: fixture.requestCount,
          scenario: fixture.scenario,
          error: state.error,
          pending: scenario === "loading" || state.pending,
          baselineHash,
          currentHash: operatorCalendarQaStateHash(fixture.reservations),
          reservationIds: fixture.reservations.map((row) => row.id),
        })}
      </output>
    </main>
  );
}

function mockGateway(
  scenario: string,
  setFixture: Dispatch<SetStateAction<FixtureState>>,
): OperatorCalendarGateway {
  function run(action: OperatorCalendarQaAction) {
    const errors: Record<string, string> = {
      slot_unavailable: "slot_conflict",
      outside_business_hours: "slot_outside_business_hours",
      admin_forbidden: "admin_forbidden",
      error: "invalid_session",
    };
    const error = errors[scenario];
    setFixture((current) => ({
      ...current,
      requestedActions: [...current.requestedActions, action.kind],
      requestCount: current.requestCount + 1,
      reservations: error
        ? current.reservations
        : applyOperatorCalendarQaAction(current.reservations, action),
    }));
    if (error) return Promise.reject(new Error(error));
    return Promise.resolve({ reservation: operatorRow });
  }
  return {
    createSession: (args) => run({ kind: "create", args }),
    updateSession: (args) => run({ kind: "update", args }),
    rescheduleCustomerReservation: (args) => run({ kind: "reschedule", args }),
    deleteSession: async (args) => ({
      ...(await run({ kind: "cancel", args })),
      escalated: false,
    }),
  };
}

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

function qaSnapshot(
  scenario: string,
  reservations?: AdminReservation[],
): AdminDashboardSnapshot {
  const customerRow: AdminReservation = {
    ...operatorRow,
    id: "R-202",
    threadId: "customer-thread",
    origin: "customer",
    displayName: "Fixture customer",
    startMs: Date.UTC(2026, 7, 12, 4),
    endMs: Date.UTC(2026, 7, 12, 5),
    timeWindow: "13:00-14:00",
  };
  return {
    domain: {
      domainKey: "qa",
      storeName: "QA Store",
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
        operatorCalendarCrud: scenario !== "hidden",
        noShow: false,
      },
    },
    reservations:
      scenario === "empty" ? [] : (reservations ?? [operatorRow, customerRow]),
    escalations: [],
    events: [],
    generatedAtMs: Date.UTC(2026, 7, 9),
  };
}
