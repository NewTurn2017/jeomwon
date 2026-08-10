export function renderDomainConfig(pack) {
	return `export type ResourceKind = "person" | "seat" | "room" | "unit";

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
  noShow: string | null;
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
    customerAccounts: true;
    operatorCalendarCrud: boolean;
    noShow: boolean;
  };
  copy: DomainCopy;
};

export const domainConfig: DomainConfig = ${JSON.stringify(pack, null, 2)};

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
}`;
}

export function renderReservationSample(pack) {
	const service = pack.services[0];
	const resource =
		pack.resources.find((item) => item.kind === service.resourceKind) ??
		pack.resources[0];
	const timeWindow =
		service.slotUnit === "day" && service.dayUnit
			? `${service.dayUnit.checkInLabel} 7월 3일 금 ${service.dayUnit.checkInTime} - ${service.dayUnit.checkOutLabel} 7월 4일 토 ${service.dayUnit.checkOutTime}`
			: "7월 3일 금 10:00-10:30";

	return `import type { ReservationEmailContext } from "./reservation.js";

export const sampleReservationEmailContext = {
  storeName: ${JSON.stringify(pack.storeName)},
  displayName: null,
  reservationId: "demo-reservation",
  serviceLabel: ${JSON.stringify(service.label)},
  resourceLabel: ${JSON.stringify(resource.label)},
  timeWindow: ${JSON.stringify(timeWindow)},
  policySummary: ${JSON.stringify(pack.copy.policySummary)},
  nextStep: ${JSON.stringify(pack.copy.nextStepConfirmed)},
  copy: {
    confirmed: ${JSON.stringify(pack.copy.confirmed)},
    rescheduled: ${JSON.stringify(pack.copy.rescheduled)},
    cancelled: ${JSON.stringify(pack.copy.cancelled)},
    cancelEscalated: ${JSON.stringify(pack.copy.cancelEscalated)},
  },
} satisfies ReservationEmailContext;`;
}
