import type { ReservationEmailContext } from "./reservation.js";

export const sampleReservationEmailContext = {
  storeName: "Jeomwon Demo Desk",
  displayName: null,
  reservationId: "demo-reservation",
  serviceLabel: "상담 예약",
  resourceLabel: "상담 담당 A",
  timeWindow: "7월 3일 금 10:00-10:30",
  policySummary:
    "확정 전 임시 홀드는 10분 유지되며, 예약 시작 24시간 이내 취소는 운영자 확인이 필요합니다.",
  nextStep: "변경이나 취소가 필요하면 다시 말씀해 주세요.",
  copy: {
    confirmed: "예약이 확정되었습니다.",
    rescheduled: "예약이 변경되었습니다.",
    cancelled: "예약이 취소되었습니다.",
    cancelEscalated: "취소 가능 시간 규정에 걸려 운영자 확인이 필요합니다.",
  },
} satisfies ReservationEmailContext;
