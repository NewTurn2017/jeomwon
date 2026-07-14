import { describe, expect, test } from "bun:test";
import type {
  CustomerReservation,
  CustomerSnapshot,
} from "@jeomwon/backend/src/agent-contract";
import { renderToStaticMarkup } from "react-dom/server";
import { shouldCloseReservationDialog } from "./customer-reservation-dialog-shell";
import type {
  CustomerReservationFlow,
  CustomerReservationFlowState,
} from "./customer-reservation-flow";
import { customerDomainFixture } from "./customer-reservation-test-fixture";
import {
  type CustomerReservationCopy,
  CustomerReservationView,
} from "./customer-reservation-view";

const NOW_MS = Date.UTC(2026, 6, 15, 0, 0);

describe("customer reservation view", () => {
  test("Given active and historical own rows When rendered in Korean Then the action matrix and history are visible", () => {
    const html = render({
      dialog: { kind: "closed" },
      pending: false,
      error: null,
      notice: null,
    });

    expect(html).toContain("새 예약");
    expect(html).toContain("변경");
    expect(html).toContain("취소");
    expect(html).toContain("지난 예약");
    expect(html).toContain("취소된 상담");
  });

  test("Given an escalated cancellation When rendered Then it remains upcoming with operator-review copy and no customer actions", () => {
    const html = renderWith(
      fixtureSnapshot([reservation("escalated", "취소 요청 상담")]),
      {
        dialog: { kind: "closed" },
        pending: false,
        error: null,
        notice: null,
      },
    );
    const activeGroup = html.slice(
      html.indexOf(copy.activeTitle),
      html.indexOf(copy.historyTitle),
    );

    expect(activeGroup).toContain("취소 요청 상담");
    expect(activeGroup).toContain(copy.status.escalated);
    expect(activeGroup).not.toContain(`>${copy.confirm}<`);
    expect(activeGroup).not.toContain(`>${copy.edit}<`);
    expect(activeGroup).not.toContain(`>${copy.cancel}<`);
    expect(html.slice(html.indexOf(copy.historyTitle))).toContain(
      copy.historyEmpty,
    );
  });

  test("Given a create dialog When rendered Then labels, initial focus, and dialog semantics are keyboard accessible", () => {
    const html = render({
      dialog: {
        kind: "create",
        reservationId: null,
        serviceKey: "consultation",
        resourceKey: null,
        preferredStartMs: null,
        slots: [],
        selectedSlot: null,
        hold: null,
      },
      pending: false,
      error: null,
      notice: null,
    });

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="customer-create-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("서비스");
  });

  test("Given a pending create dialog When every control is disabled Then its dialog root remains programmatically focusable", () => {
    const html = render({
      dialog: {
        kind: "create",
        reservationId: null,
        serviceKey: "consultation",
        resourceKey: null,
        preferredStartMs: null,
        slots: [],
        selectedSlot: null,
        hold: null,
      },
      pending: true,
      error: null,
      notice: null,
    });

    expect(dialogOpeningTag(html)).toContain('tabindex="-1"');
    expect(enabledDialogControls(html)).toEqual([]);
  });

  test("Given a pending cancel dialog When every control is disabled Then its dialog root remains programmatically focusable", () => {
    const html = render({
      dialog: { kind: "cancel", reservationId: "R-100" },
      pending: true,
      error: null,
      notice: null,
    });

    expect(dialogOpeningTag(html)).toContain('tabindex="-1"');
    expect(enabledDialogControls(html)).toEqual([]);
  });

  test("Given a person service When its booking dialog renders Then room resources are not offered", () => {
    const html = render({
      dialog: {
        kind: "create",
        reservationId: null,
        serviceKey: "consultation",
        resourceKey: null,
        preferredStartMs: null,
        slots: [],
        selectedSlot: null,
        hold: null,
      },
      pending: false,
      error: null,
      notice: null,
    });

    expect(html).toContain("상담 담당 A");
    expect(html).not.toContain('<option value="room-a">상담실 A</option>');
  });

  test("Given an expired held row When rendered Then confirmation is absent and re-search guidance is visible", () => {
    const snapshot = fixtureSnapshot([
      reservation("held", "만료 홀드", NOW_MS - 1),
    ]);
    const html = renderWith(snapshot, {
      dialog: { kind: "closed" },
      pending: false,
      error: "hold_expired",
      notice: null,
    });

    expect(html).not.toContain(">확정<");
    expect(html).toContain("시간을 다시 검색해 주세요");
  });

  test("Given an expired create hold When rendered Then explicit confirmation is disabled", () => {
    const slot = {
      serviceKey: "consultation",
      serviceLabel: "상담",
      resourceKey: "advisor-a",
      resourceLabel: "상담 담당 A",
      startMs: NOW_MS + 3_600_000,
      endMs: NOW_MS + 7_200_000,
      timeWindow: "오전 9:00–오전 10:00",
    };
    const html = render({
      dialog: {
        kind: "create",
        reservationId: null,
        serviceKey: "consultation",
        resourceKey: "advisor-a",
        preferredStartMs: null,
        slots: [slot],
        selectedSlot: slot,
        hold: { reservationId: "R-EXPIRED", expiresAtMs: NOW_MS - 1 },
      },
      pending: false,
      error: null,
      notice: null,
    });

    expect(html).toContain("홀드 확정");
    expect(html).toContain('disabled=""');
    expect(html).toContain("시간을 다시 검색해 주세요");
    expect(html).toContain(
      '<button class="rounded-md border px-3 py-2 text-sm" type="button">시간 검색</button>',
    );
  });

  test("Given a keyboard event When Escape is pressed Then only Escape closes the dialog", () => {
    expect(shouldCloseReservationDialog("Escape")).toBe(true);
    expect(shouldCloseReservationDialog("Enter")).toBe(false);
  });
});

function render(state: CustomerReservationFlowState): string {
  return renderWith(
    fixtureSnapshot([
      reservation("confirmed", "상담"),
      reservation("cancelled", "취소된 상담"),
    ]),
    state,
  );
}

function renderWith(
  snapshot: CustomerSnapshot,
  state: CustomerReservationFlowState,
): string {
  return renderToStaticMarkup(
    <CustomerReservationView
      copy={copy}
      flow={flow}
      snapshot={snapshot}
      state={state}
    />,
  );
}

const flow: CustomerReservationFlow = {
  getState: () => ({
    dialog: { kind: "closed" },
    pending: false,
    error: null,
    notice: null,
  }),
  subscribe: () => () => undefined,
  openCreate: () => undefined,
  openEdit: () => undefined,
  openCancel: () => undefined,
  close: () => undefined,
  updateBooking: () => undefined,
  selectSlot: () => undefined,
  searchAvailability: async () => undefined,
  createHold: async () => undefined,
  confirmHold: async () => undefined,
  confirmExisting: async () => undefined,
  reschedule: async () => undefined,
  cancel: async () => undefined,
};

const copy: CustomerReservationCopy = {
  title: "내 예약 관리",
  newReservation: "새 예약",
  activeTitle: "다가오는 예약",
  historyTitle: "지난 예약",
  empty: "예약이 없습니다.",
  historyEmpty: "지난 예약이 없습니다.",
  confirm: "확정",
  edit: "변경",
  cancel: "취소",
  createTitle: "새 예약 만들기",
  editTitle: "예약 변경",
  cancelTitle: "예약 취소",
  service: "서비스",
  resource: "리소스",
  allResources: "모든 리소스",
  search: "시간 검색",
  noSlots: "가능한 시간이 없습니다.",
  createHold: "임시 홀드",
  confirmHold: "홀드 확정",
  reschedule: "변경 확정",
  cancelPrompt: "이 예약을 취소할까요?",
  close: "닫기",
  pending: "처리 중",
  holdCreated: "시간이 임시 홀드되었습니다.",
  expiredPrompt: "홀드가 만료되었습니다. 시간을 다시 검색해 주세요.",
  confirmedNotice: "예약이 확정되었습니다.",
  rescheduledNotice: "예약이 변경되었습니다.",
  cancelledNotice: "예약이 취소되었습니다.",
  escalatedNotice: "취소 요청됨 · 운영자 확인 필요",
  collisionError: "선택한 시간을 사용할 수 없습니다.",
  unavailableError: "서비스 또는 리소스를 다시 선택해 주세요.",
  genericError: "요청을 처리하지 못했습니다.",
  status: {
    draft: "초안",
    eligible: "예약 가능",
    held: "임시 홀드",
    confirmed: "확정",
    rescheduled: "변경됨",
    waitlisted: "대기",
    cancelled: "취소",
    expired: "만료",
    denied: "거절",
    escalated: "운영자 확인",
  },
};

function reservation(
  status: CustomerReservation["status"],
  serviceLabel: string,
  holdExpiresAtMs: number | null = null,
): CustomerReservation {
  return {
    id: `${status}-1`,
    displayName: null,
    serviceKey: "consultation",
    serviceLabel,
    resourceKey: "room-a",
    resourceLabel: "상담실 A",
    startMs: NOW_MS + 3_600_000,
    endMs: NOW_MS + 7_200_000,
    timeWindow: "오전 9:00–오전 10:00",
    status,
    holdExpiresAtMs,
    createdAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
  };
}

function fixtureSnapshot(
  reservations: readonly CustomerReservation[],
): CustomerSnapshot {
  return {
    domain: customerDomainFixture,
    threadId: "customer-owned-thread",
    reservations: [...reservations],
    generatedAtMs: NOW_MS,
  };
}

function dialogOpeningTag(html: string): string {
  return html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0] ?? "";
}

function enabledDialogControls(html: string): string[] {
  return [...html.matchAll(/<(button|select|input|textarea)\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => !tag.includes("disabled"));
}
