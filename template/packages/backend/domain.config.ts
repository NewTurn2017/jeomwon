export type ResourceKind = "person" | "seat" | "room" | "unit";

export type SlotUnit = "minutes:30" | "hour" | "day";

export type AdminWidget = "calendar" | "seatGrid";

export type LocaleCode = "ko-KR" | "en-US";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type BusinessHoursWindow =
  | {
      open: string;
      close: string;
    }
  | {
      closed: true;
    };

export type DomainResource = {
  key: string;
  label: string;
  kind: ResourceKind;
};

export type DomainDayUnit = {
  checkInTime: string;
  checkOutTime: string;
  checkInLabel: string;
  checkOutLabel: string;
};

export type DomainService = {
  key: string;
  label: string;
  durationMinutes?: number;
  slotUnit?: SlotUnit;
  dayUnit?: DomainDayUnit;
  price?: string;
  resourceKind: ResourceKind;
};

export type DomainBlackout = {
  startIso: string;
  endIso: string;
  reason?: string;
};

export type DomainPolicies = {
  cancelWindowHours: number;
  holdMinutes: number;
  confirmationRequired: true;
};

export type DomainCopy = {
  chatTitle: string;
  chatGreeting: string;
  chatPlaceholder: string;
  relevanceRefusal: string;
  confirmationRequired: string;
  privacyRefusal: string;
  availabilityIntro: string;
  holdCreated: string;
  confirmed: string;
  rescheduled: string;
  cancelled: string;
  cancelEscalated: string;
  holdExpired: string;
  schemaError: string;
  guardrailBanner: string;
  nextStepAvailability: string;
  nextStepHold: string;
  nextStepConfirmed: string;
  policySummary: string;
};

export type DomainConfig = {
  domainKey: string;
  storeName: string;
  storeTimezone: string;
  locale: LocaleCode;
  resources: DomainResource[];
  services: DomainService[];
  businessHours: Record<Weekday, BusinessHoursWindow>;
  blackouts: DomainBlackout[];
  policies: DomainPolicies;
  adminWidget: AdminWidget;
  // Customer email collection is deferred to the Phase 6 domain interview.
  // Phase 4 lifecycle email goes to this operator/demo recipient instead.
  notificationEmail: string;
  features: {
    email: boolean;
    polar: boolean;
    waitlist: boolean;
    customerAccounts: boolean;
    operatorCalendarCrud: boolean;
  };
  copy: DomainCopy;
};

export const domainConfig: DomainConfig = {
  domainKey: "generic-appointment",
  storeName: "Jeomwon Demo Desk",
  storeTimezone: "Asia/Seoul",
  locale: "ko-KR",
  resources: [
    { key: "advisor-a", label: "상담 담당 A", kind: "person" },
    { key: "advisor-b", label: "상담 담당 B", kind: "person" },
    { key: "room-1", label: "회의실 1", kind: "room" },
  ],
  services: [
    {
      key: "consultation",
      label: "상담 예약",
      durationMinutes: 30,
      price: "무료",
      resourceKind: "person",
    },
    {
      key: "planning-session",
      label: "플래닝 세션",
      slotUnit: "hour",
      price: "문의",
      resourceKind: "room",
    },
  ],
  businessHours: {
    monday: { open: "09:00", close: "18:00" },
    tuesday: { open: "09:00", close: "18:00" },
    wednesday: { open: "09:00", close: "18:00" },
    thursday: { open: "09:00", close: "18:00" },
    friday: { open: "09:00", close: "18:00" },
    saturday: { open: "10:00", close: "14:00" },
    sunday: { closed: true },
  },
  blackouts: [],
  policies: {
    cancelWindowHours: 24,
    holdMinutes: 10,
    confirmationRequired: true,
  },
  adminWidget: "calendar",
  notificationEmail: "ops@example.com",
  features: {
    email: true,
    polar: false,
    waitlist: false,
    customerAccounts: false,
    operatorCalendarCrud: false,
  },
  copy: {
    chatTitle: "예약 도우미",
    chatGreeting:
      "안녕하세요. 가능한 시간 확인, 임시 홀드, 확정, 변경/취소 안내를 도와드릴게요.",
    chatPlaceholder: "예약 문의를 입력하세요",
    relevanceRefusal:
      "예약 관련 문의만 도와드릴 수 있어요. 가능 시간, 예약 확정, 변경, 취소를 문의해 주세요.",
    confirmationRequired:
      "확정, 변경, 취소는 고객 확인 없이 바로 처리할 수 없습니다. 먼저 예약 내용을 확인해 주세요.",
    privacyRefusal:
      "공개 가능한 예약 정보만 안내할 수 있어요. 내부 운영 정보는 제공하지 않습니다.",
    availabilityIntro: "요청하신 조건으로 가능한 시간을 확인했어요.",
    holdCreated:
      "선택한 시간을 임시로 잡아두었습니다. 확정하려면 확인한다고 답해 주세요.",
    confirmed: "예약이 확정되었습니다.",
    rescheduled: "예약이 변경되었습니다.",
    cancelled: "예약이 취소되었습니다.",
    cancelEscalated: "취소 가능 시간 규정에 걸려 운영자 확인이 필요합니다.",
    holdExpired: "임시 홀드 시간이 지나 예약 가능 상태로 돌아갔습니다.",
    schemaError: "요청 형식이 올바르지 않습니다.",
    guardrailBanner: "예약 관련 문의만 도와드릴 수 있어요.",
    nextStepAvailability: "원하는 시간을 선택해 주세요.",
    nextStepHold: "내용이 맞으면 확인한다고 답해 주세요.",
    nextStepConfirmed: "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    policySummary:
      "확정 전 임시 홀드는 10분 유지되며, 예약 시작 24시간 이내 취소는 운영자 확인이 필요합니다.",
  },
};

export function getHoldDurationMs() {
  const overrideMs = Number.parseInt(
    process.env.JEOMWON_TEST_HOLD_MS ?? "",
    10,
  );

  if (Number.isFinite(overrideMs) && overrideMs > 0) {
    return overrideMs;
  }

  return domainConfig.policies.holdMinutes * 60 * 1000;
}

export function getServiceDurationMinutes(service: DomainService) {
  if (typeof service.durationMinutes === "number") {
    return service.durationMinutes;
  }

  if (service.slotUnit === "hour") {
    return 60;
  }

  if (service.slotUnit === "day") {
    const dayUnit = service.dayUnit;
    if (dayUnit) {
      const checkIn = parseClockMinutes(dayUnit.checkInTime);
      const checkOut = parseClockMinutes(dayUnit.checkOutTime);
      return checkOut > checkIn
        ? checkOut - checkIn
        : 24 * 60 - checkIn + checkOut;
    }

    return 24 * 60;
  }

  return 30;
}

function parseClockMinutes(clock: string) {
  const [hour, minute] = clock
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  return hour! * 60 + minute!;
}
