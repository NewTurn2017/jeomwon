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
  domainKey: "pension-stay",
  storeName: "소나무 펜션",
  storeTimezone: "Asia/Seoul",
  locale: "ko-KR",
  resources: [
    {
      key: "room-pine",
      label: "솔방울 객실",
      kind: "room",
    },
    {
      key: "room-river",
      label: "강가 객실",
      kind: "room",
    },
    {
      key: "room-family",
      label: "패밀리 객실",
      kind: "room",
    },
  ],
  services: [
    {
      key: "one-night-stay",
      label: "1박 숙박",
      slotUnit: "day",
      dayUnit: {
        checkInTime: "15:00",
        checkOutTime: "11:00",
        checkInLabel: "체크인",
        checkOutLabel: "체크아웃",
      },
      price: "120000원부터",
      resourceKind: "room",
    },
  ],
  businessHours: {
    monday: {
      open: "00:00",
      close: "23:59",
    },
    tuesday: {
      open: "00:00",
      close: "23:59",
    },
    wednesday: {
      open: "00:00",
      close: "23:59",
    },
    thursday: {
      open: "00:00",
      close: "23:59",
    },
    friday: {
      open: "00:00",
      close: "23:59",
    },
    saturday: {
      open: "00:00",
      close: "23:59",
    },
    sunday: {
      open: "00:00",
      close: "23:59",
    },
  },
  blackouts: [
    {
      startIso: "2026-12-24T00:00:00+09:00",
      endIso: "2026-12-26T00:00:00+09:00",
      reason: "성수기 수동 배정",
    },
  ],
  policies: {
    cancelWindowHours: 72,
    holdMinutes: 30,
    confirmationRequired: true,
  },
  adminWidget: "calendar",
  notificationEmail: "stay-ops@example.com",
  features: {
    email: true,
    polar: false,
    waitlist: false,
    customerAccounts: false,
    operatorCalendarCrud: false,
  },
  copy: {
    chatTitle: "펜션 예약 도우미",
    chatGreeting:
      "원하는 숙박 날짜와 객실을 알려주시면 예약 가능한 객실을 찾아드릴게요.",
    chatPlaceholder: "예: 다음 주 토요일 1박 가능한 객실",
    relevanceRefusal: "펜션 객실 예약, 변경, 취소 문의만 도와드릴 수 있어요.",
    confirmationRequired:
      "숙박 예약 확정은 고객 확인 후에만 진행할 수 있습니다.",
    privacyRefusal: "공개 가능한 숙박 예약 정보만 안내할 수 있어요.",
    availabilityIntro: "숙박 가능한 객실을 찾았어요.",
    holdCreated: "선택한 객실을 임시로 잡아두었습니다.",
    confirmed: "숙박 예약이 확정되었습니다.",
    rescheduled: "숙박 예약이 변경되었습니다.",
    cancelled: "숙박 예약이 취소되었습니다.",
    cancelEscalated: "체크인 72시간 이내 취소라 운영자 확인이 필요합니다.",
    holdExpired: "객실 홀드 시간이 지나 예약 가능 상태로 돌아갔습니다.",
    schemaError: "숙박 요청 형식이 올바르지 않습니다.",
    guardrailBanner: "펜션 객실 예약 관련 문의만 도와드릴 수 있어요.",
    nextStepAvailability: "원하는 객실 번호를 선택해 주세요.",
    nextStepHold: "내용이 맞으면 확인한다고 답해 주세요.",
    nextStepConfirmed: "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    policySummary:
      "객실 홀드는 30분 유지되며, 체크인 72시간 이내 취소는 운영자 확인이 필요합니다.",
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
