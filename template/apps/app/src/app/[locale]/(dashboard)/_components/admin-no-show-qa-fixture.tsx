"use client";

import type { AdminReservation } from "@jeomwon/backend/src/agent-contract";
import { useEffect, useRef, useState } from "react";
import en from "@/locales/en";
import ko from "@/locales/ko";
import {
  AdminNoShowAction,
  type AdminNoShowError,
  noShowErrorCode,
  useAdminNoShowSubmission,
} from "./admin-no-show";
import { StatusPill } from "./admin-status-pill";

const NOW = Date.UTC(2026, 7, 11, 3);

export function AdminNoShowQaFixture({
  lang,
  scenario,
}: {
  lang: "ko" | "en";
  scenario: string;
}) {
  const dictionary = lang === "ko" ? ko : en;
  const initial = reservationForScenario(scenario);
  const [reservation, setReservation] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<AdminNoShowError | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const releaseRef = useRef<(() => void) | null>(null);
  const submission = useAdminNoShowSubmission(async (args) => {
    setRequestCount((count) => count + 1);
    if (scenario === "pending") {
      await new Promise<void>((resolve) => {
        releaseRef.current = resolve;
      });
    }
    if (scenario === "server-error") throw new Error("no_show_future");
    if (scenario === "repeat") throw new Error("no_show_already_marked");
    return {
      reservation: { ...reservation, status: "no_show" },
      publicContext: {
        displayName: reservation.displayName,
        reservationId: args.reservationId,
        serviceLabel: reservation.serviceLabel,
        resourceLabel: reservation.resourceLabel,
        timeWindow: reservation.timeWindow,
        status: "no_show",
        policySummary: "QA",
        nextStep: "QA",
      },
      auditType: "reservation.no_show",
    };
  });

  useEffect(() => setHydrated(true), []);

  async function confirm() {
    setError(null);
    try {
      const result = await submission.submit(reservation.id);
      if (result) {
        setReservation(result.reservation);
        setConfirming(false);
      }
    } catch (caught) {
      setConfirming(false);
      setError(noShowErrorCode(caught));
    }
  }

  return (
    <main
      className="mx-auto min-h-screen w-full max-w-screen-md px-4 py-8"
      data-hydrated={hydrated}
    >
      <section className="rounded-lg border border-border bg-card p-5">
        <p className="text-muted-foreground text-sm">QA fixture · {scenario}</p>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <StatusPill status={reservation.status} />
            <h1 className="mt-3 font-semibold text-xl">
              {reservation.serviceLabel}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {reservation.timeWindow}
            </p>
          </div>
          <AdminNoShowAction
            copy={dictionary.dashboard.noShow}
            enabled={scenario !== "off"}
            error={error}
            generatedAtMs={NOW}
            reservation={reservation}
            confirming={confirming}
            pending={submission.pending}
            onCancel={() => setConfirming(false)}
            onConfirm={() => void confirm()}
            onOpen={() => setConfirming(true)}
          />
        </div>
        {scenario === "pending" && submission.pending ? (
          <button
            data-testid="resolve-no-show"
            type="button"
            onClick={() => releaseRef.current?.()}
          >
            Resolve pending QA request
          </button>
        ) : null}
      </section>
      <output className="sr-only" data-testid="no-show-fixture-json">
        {JSON.stringify({
          status: reservation.status,
          requestCount,
          error,
          pending: submission.pending,
        })}
      </output>
    </main>
  );
}

function reservationForScenario(scenario: string): AdminReservation {
  const status = scenario === "ineligible" ? "held" : "confirmed";
  return {
    id: "NS-QA-101",
    threadId: "qa-customer",
    origin: "customer",
    displayName: "QA Customer",
    serviceKey: "qa-service",
    serviceLabel: "QA Reservation",
    resourceKey: "qa-resource",
    resourceLabel: "QA Resource",
    startMs: scenario === "future" ? NOW + 60_000 : NOW - 60_000,
    endMs: NOW + 60_000,
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
  };
}
