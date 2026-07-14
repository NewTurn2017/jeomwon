import type { DomainPublicSnapshot } from "@jeomwon/backend/src/agent-contract";

export const customerDomainFixture: DomainPublicSnapshot = {
  domainKey: "test-domain",
  storeName: "Test store",
  storeTimezone: "Asia/Seoul",
  locale: "ko-KR",
  adminWidget: "calendar",
  features: {
    email: false,
    polar: false,
    waitlist: false,
    customerAccounts: true,
    operatorCalendarCrud: false,
  },
  copy: {
    chatTitle: "",
    chatGreeting: "",
    chatPlaceholder: "",
    relevanceRefusal: "",
    confirmationRequired: "",
    privacyRefusal: "",
    availabilityIntro: "",
    holdCreated: "",
    confirmed: "",
    rescheduled: "",
    cancelled: "",
    cancelEscalated: "",
    holdExpired: "",
    schemaError: "",
    guardrailBanner: "",
    nextStepAvailability: "",
    nextStepHold: "",
    nextStepConfirmed: "",
    policySummary: "",
  },
  resources: [
    { key: "advisor-a", label: "상담 담당 A", kind: "person" },
    { key: "room-a", label: "상담실 A", kind: "room" },
  ],
  services: [
    {
      key: "consultation",
      label: "상담 예약",
      durationMinutes: 30,
      resourceKind: "person",
    },
  ],
};
