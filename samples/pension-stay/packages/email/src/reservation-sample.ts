import type { ReservationEmailContext } from "./reservation.js";

export const sampleReservationEmailContext = {
  storeName: "소나무 펜션",
  displayName: null,
  reservationId: "demo-reservation",
  serviceLabel: "1박 숙박",
  resourceLabel: "솔방울 객실",
  timeWindow: "체크인 7월 3일 금 15:00 - 체크아웃 7월 4일 토 11:00",
  policySummary:
    "객실 홀드는 30분 유지되며, 체크인 72시간 이내 취소는 운영자 확인이 필요합니다.",
  nextStep: "변경이나 취소가 필요하면 다시 말씀해 주세요.",
  copy: {
    confirmed: "숙박 예약이 확정되었습니다.",
    rescheduled: "숙박 예약이 변경되었습니다.",
    cancelled: "숙박 예약이 취소되었습니다.",
    cancelEscalated: "체크인 72시간 이내 취소라 운영자 확인이 필요합니다.",
  },
} satisfies ReservationEmailContext;
