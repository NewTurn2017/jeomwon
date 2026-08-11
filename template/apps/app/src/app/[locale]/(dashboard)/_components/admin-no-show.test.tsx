import { describe, expect, test } from "bun:test";
import type {
  AdminNoShowResult,
  AdminReservation,
} from "@jeomwon/backend/src/agent-contract";
import { renderToStaticMarkup } from "react-dom/server";
import en from "@/locales/en";
import ko from "@/locales/ko";
import type { AdminNoShowError } from "./admin-no-show";
import {
  AdminNoShowAction,
  createAdminNoShowSubmitter,
  isNoShowActionVisible,
  submitNoShow,
} from "./admin-no-show";

const NOW = Date.UTC(2026, 7, 11, 3);
const base: AdminReservation = {
  id: "NS-101",
  threadId: "customer-thread",
  origin: "customer",
  displayName: "Customer",
  serviceKey: "consultation",
  serviceLabel: "Consultation",
  resourceKey: "room-a",
  resourceLabel: "Room A",
  startMs: NOW - 1,
  endMs: NOW + 60_000,
  timeWindow: "11:59-12:00",
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

const copy = en.dashboard.noShow;

function html(
  options: {
    enabled?: boolean;
    reservation?: AdminReservation;
    confirming?: boolean;
    pending?: boolean;
    error?: AdminNoShowError | null;
  } = {},
) {
  return renderToStaticMarkup(
    <AdminNoShowAction
      copy={copy}
      enabled={options.enabled ?? true}
      error={options.error ?? null}
      generatedAtMs={NOW}
      reservation={options.reservation ?? base}
      confirming={options.confirming ?? false}
      pending={options.pending ?? false}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      onOpen={() => undefined}
    />,
  );
}

describe("admin no-show action", () => {
  test("uses only feature, lifecycle status, and server snapshot time for visibility", () => {
    for (const status of ["confirmed", "rescheduled"] as const) {
      expect(isNoShowActionVisible({ ...base, status }, true, NOW)).toBe(true);
    }
    for (const status of [
      "draft",
      "eligible",
      "held",
      "no_show",
      "waitlisted",
      "cancelled",
      "expired",
      "denied",
      "escalated",
    ] as const) {
      expect(isNoShowActionVisible({ ...base, status }, true, NOW)).toBe(false);
    }
    expect(isNoShowActionVisible(base, false, NOW)).toBe(false);
    expect(
      isNoShowActionVisible({ ...base, startMs: NOW + 1 }, true, NOW),
    ).toBe(false);
  });

  test("renders an explicit irreversible confirmation and supports cancellation state", () => {
    expect(html()).toContain('data-testid="mark-no-show"');
    const confirmation = html({ confirming: true });
    expect(confirmation).toContain('data-testid="confirm-no-show"');
    expect(confirmation).toContain(copy.irreversible);
    expect(confirmation).toContain(copy.cancel);
    const pending = html({ confirming: true, pending: true });
    expect(pending).toContain('data-testid="confirm-no-show" disabled=""');
    expect(pending).toContain('data-testid="cancel-no-show" disabled=""');
    expect(html({ confirming: false })).not.toContain(
      'data-testid="confirm-no-show"',
    );
  });

  test("keeps action absent for off, future, ineligible, and terminal rows", () => {
    expect(html({ enabled: false })).toBe("");
    expect(html({ reservation: { ...base, startMs: NOW + 1 } })).toBe("");
    expect(html({ reservation: { ...base, status: "held" } })).toBe("");
    expect(html({ reservation: { ...base, status: "no_show" } })).toBe("");
  });

  test("suppresses two synchronous confirmations before a render can disable controls", async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const request = async () => {
      calls += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return resultFixture();
    };

    const pending: boolean[] = [];
    const submit = createAdminNoShowSubmitter(request, (value) =>
      pending.push(value),
    );
    const first = submit(base.id);
    const second = submit(base.id);
    expect(calls).toBe(1);
    expect(pending).toEqual([true]);
    expect(await second).toBe(null);
    release?.();
    await first;
    expect(pending).toEqual([true, false]);
  });

  test("releases the synchronous guard after success and error", async () => {
    let calls = 0;
    const submit = createAdminNoShowSubmitter(async () => {
      calls += 1;
      if (calls === 2) throw new Error("no_show_future");
      return resultFixture();
    });
    expect((await submit(base.id))?.reservation.status).toBe("no_show");
    let error: unknown;
    try {
      await submit(base.id);
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).message).toBe("no_show_future");
    expect((await submit(base.id))?.reservation.status).toBe("no_show");
    expect(calls).toBe(3);
  });

  test("submits the exact typed payload and preserves rejection for stable UI error", async () => {
    const calls: unknown[] = [];
    const result = await submitNoShow(async (args) => {
      calls.push(args);
      return resultFixture();
    }, base.id);
    expect(calls).toEqual([{ reservationId: "NS-101" }]);
    expect(result.reservation.status).toBe("no_show");

    let error: unknown;
    try {
      await submitNoShow(async () => {
        throw new Error("no_show_future");
      }, base.id);
    } catch (caught) {
      error = caught;
    }
    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toBe("no_show_future");
  });

  test("renders a stable error without a false terminal state", () => {
    const markup = html({ error: "no_show_future" });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(copy.errors.no_show_future);
    expect(markup).toContain('data-testid="mark-no-show"');
    expect(markup).not.toContain(en.dashboard.status.no_show);
  });

  test("KO and EN dictionaries have complete matching no-show keys", () => {
    expect(Object.keys(ko.dashboard.noShow)).toEqual(
      Object.keys(en.dashboard.noShow),
    );
    expect(Object.keys(ko.dashboard.noShow.errors)).toEqual(
      Object.keys(en.dashboard.noShow.errors),
    );
    expect(ko.dashboard.noShow.irreversible).not.toBe(
      en.dashboard.noShow.irreversible,
    );
  });
});

function resultFixture(): AdminNoShowResult {
  return {
    reservation: { ...base, status: "no_show" },
    publicContext: {
      displayName: "Customer",
      reservationId: base.id,
      serviceLabel: base.serviceLabel,
      resourceLabel: base.resourceLabel,
      timeWindow: base.timeWindow,
      status: "no_show",
      policySummary: "Policy",
      nextStep: "Contact the store.",
    },
    auditType: "reservation.no_show",
  };
}
