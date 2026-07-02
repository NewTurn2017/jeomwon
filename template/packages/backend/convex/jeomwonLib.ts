import {
  type DomainResource,
  type DomainService,
  domainConfig,
  getServiceDurationMinutes,
  type Weekday,
} from "../domain.config";
import type {
  AgentName,
  DomainPublicSnapshot,
  GuardrailStatus,
  PublicContext,
  PublicSlot,
  ReservationStatus,
} from "../src/agent-contract";
import type { Doc, Id } from "./_generated/dataModel";

const weekdayMap: Record<string, Weekday> = {
  Monday: "monday",
  Tuesday: "tuesday",
  Wednesday: "wednesday",
  Thursday: "thursday",
  Friday: "friday",
  Saturday: "saturday",
  Sunday: "sunday",
};

type AuditEvent = {
  atMs: number;
  type: string;
  actor: AgentName;
  summary: string;
  publicMessage: string | null;
};

export function publicDomainSnapshot(): DomainPublicSnapshot {
  return {
    domainKey: domainConfig.domainKey,
    storeName: domainConfig.storeName,
    storeTimezone: domainConfig.storeTimezone,
    locale: domainConfig.locale,
    adminWidget: domainConfig.adminWidget,
    features: domainConfig.features,
    copy: domainConfig.copy,
    resources: domainConfig.resources,
    services: domainConfig.services,
  };
}

export function defaultGuardrailStatus(): GuardrailStatus {
  return {
    relevance: "clear",
    confirmation: "clear",
    privacy: "clear",
  };
}

export function defaultPublicContext(
  status: ReservationStatus = "draft",
): PublicContext {
  return {
    displayName: null,
    reservationId: null,
    serviceLabel: null,
    resourceLabel: null,
    timeWindow: null,
    status,
    policySummary: domainConfig.copy.policySummary,
    nextStep: domainConfig.copy.nextStepAvailability,
  };
}

export function publicContextFromReservation(
  reservation: Doc<"reservations">,
): PublicContext {
  const service = serviceByKey(reservation.serviceKey);

  return {
    displayName: reservation.displayName,
    reservationId: reservation.reservationNumber ?? null,
    serviceLabel: reservation.serviceLabel,
    resourceLabel: reservation.resourceLabel,
    timeWindow: timeWindowLabel(
      reservation.startMs,
      reservation.endMs,
      service,
    ),
    status: reservation.status,
    policySummary: domainConfig.copy.policySummary,
    nextStep: nextStepForStatus(reservation.status),
  };
}

export function nextStepForStatus(status: ReservationStatus) {
  if (status === "held") {
    return domainConfig.copy.nextStepHold;
  }

  if (status === "confirmed" || status === "rescheduled") {
    return domainConfig.copy.nextStepConfirmed;
  }

  if (status === "escalated") {
    return "운영자 확인을 기다려 주세요.";
  }

  if (status === "expired") {
    return domainConfig.copy.nextStepAvailability;
  }

  return domainConfig.copy.nextStepAvailability;
}

export function serviceByKey(serviceKey: string | null): DomainService {
  return (
    domainConfig.services.find((service) => service.key === serviceKey) ??
    domainConfig.services[0]!
  );
}

export function resourceByKey(
  resourceKey: string | null,
  service: DomainService,
  seededResources: DomainResource[],
): DomainResource {
  return (
    seededResources.find((resource) => resource.key === resourceKey) ??
    domainConfig.resources.find(
      (resource) =>
        resource.key === resourceKey && resource.kind === service.resourceKind,
    ) ??
    seededResources.find(
      (resource) => resource.kind === service.resourceKind,
    ) ??
    domainConfig.resources.find(
      (resource) => resource.kind === service.resourceKind,
    ) ??
    domainConfig.resources[0]!
  );
}

export function resourcesForService(
  service: DomainService,
  seededResources: DomainResource[],
) {
  const candidates = seededResources.filter(
    (resource) => resource.kind === service.resourceKind,
  );

  if (candidates.length > 0) {
    return candidates;
  }

  return domainConfig.resources.filter(
    (resource) => resource.kind === service.resourceKind,
  );
}

export function timeWindowLabel(
  startMs: number,
  endMs: number,
  service?: DomainService,
) {
  if (service?.slotUnit === "day") {
    const formatter = new Intl.DateTimeFormat(domainConfig.locale, {
      timeZone: domainConfig.storeTimezone,
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const dayUnit = service.dayUnit;
    const checkInLabel = dayUnit?.checkInLabel ?? "체크인";
    const checkOutLabel = dayUnit?.checkOutLabel ?? "체크아웃";

    return `${checkInLabel} ${formatter.format(startMs)} - ${checkOutLabel} ${formatter.format(endMs)}`;
  }

  const formatter = new Intl.DateTimeFormat(domainConfig.locale, {
    timeZone: domainConfig.storeTimezone,
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const endFormatter = new Intl.DateTimeFormat(domainConfig.locale, {
    timeZone: domainConfig.storeTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return `${formatter.format(startMs)}-${endFormatter.format(endMs)}`;
}

export function buildSlot(
  service: DomainService,
  resource: DomainResource,
  startMs: number,
): PublicSlot {
  const endMs = serviceEndMs(service, startMs);

  return {
    serviceKey: service.key,
    serviceLabel: service.label,
    resourceKey: resource.key,
    resourceLabel: resource.label,
    startMs,
    endMs,
    timeWindow: timeWindowLabel(startMs, endMs, service),
  };
}

export function isSlotAllowed(
  startMs: number,
  endMs: number,
  service?: DomainService,
) {
  if (isBlackout(startMs, endMs)) {
    return false;
  }

  const startParts = calendarParts(startMs);
  const endParts = calendarParts(endMs - 1);

  if (service?.slotUnit === "day") {
    return isDaySlotAllowed(service, startParts, calendarParts(endMs));
  }

  if (startParts.dateKey !== endParts.dateKey) {
    return false;
  }

  const window = domainConfig.businessHours[startParts.weekday];
  if ("closed" in window) {
    return false;
  }

  const openMinutes = parseClockMinutes(window.open);
  const closeMinutes = parseClockMinutes(window.close);

  return (
    startParts.minutesSinceMidnight >= openMinutes &&
    endParts.minutesSinceMidnight + 1 <= closeMinutes
  );
}

export function hasCollision(
  reservations: Doc<"reservations">[],
  resourceKey: string,
  startMs: number,
  endMs: number,
  excludeReservationId: Id<"reservations"> | null = null,
) {
  return reservations.some((reservation) => {
    if (
      excludeReservationId !== null &&
      reservation._id === excludeReservationId
    ) {
      return false;
    }

    if (reservation.resourceKey !== resourceKey) {
      return false;
    }

    if (!isActiveReservation(reservation)) {
      return false;
    }

    return startMs < reservation.endMs && endMs > reservation.startMs;
  });
}

export function isActiveReservation(reservation: Doc<"reservations">) {
  if (
    reservation.status === "confirmed" ||
    reservation.status === "rescheduled"
  ) {
    return true;
  }

  if (reservation.status !== "held") {
    return false;
  }

  return (
    reservation.holdExpiresAtMs !== null &&
    reservation.holdExpiresAtMs > Date.now()
  );
}

export function isInsideCancelWindow(startMs: number, requestedAtMs: number) {
  const cancelWindowMs =
    domainConfig.policies.cancelWindowHours * 60 * 60 * 1000;
  return startMs - requestedAtMs < cancelWindowMs;
}

export function auditEvent(
  type: string,
  actor: AgentName,
  summary: string,
  publicMessage: string | null,
): AuditEvent {
  return {
    atMs: Date.now(),
    type,
    actor,
    summary,
    publicMessage,
  };
}

export function appendAudit(existing: AuditEvent[], event: AuditEvent) {
  return [...existing, event];
}

export function slotStepMs(service: DomainService) {
  if (service.slotUnit === "day") {
    return 24 * 60 * 60 * 1000;
  }

  return 30 * 60 * 1000;
}

export function firstSearchStart(
  preferredStartMs: number | null,
  service?: DomainService,
) {
  const now = Date.now();
  const minimum = now + 30 * 60 * 1000;
  if (preferredStartMs !== null && preferredStartMs > minimum) {
    return alignToSlot(preferredStartMs, service);
  }
  return alignToSlot(minimum, service);
}

export function alignToSlot(timestampMs: number, service?: DomainService) {
  if (service?.slotUnit === "day") {
    return alignToDaySlot(timestampMs, service);
  }

  return alignToThirtyMinutes(timestampMs);
}

export function serviceEndMs(service: DomainService, startMs: number) {
  return startMs + getServiceDurationMinutes(service) * 60 * 1000;
}

function alignToThirtyMinutes(timestampMs: number) {
  const stepMs = 30 * 60 * 1000;
  return Math.ceil(timestampMs / stepMs) * stepMs;
}

function alignToDaySlot(timestampMs: number, service: DomainService) {
  const targetMinutes = parseClockMinutes(
    service.dayUnit?.checkInTime ?? "00:00",
  );
  let cursorMs = alignToThirtyMinutes(timestampMs);
  for (let attempt = 0; attempt < 96; attempt += 1) {
    if (calendarParts(cursorMs).minutesSinceMidnight === targetMinutes) {
      return cursorMs;
    }
    cursorMs += 30 * 60 * 1000;
  }

  return cursorMs;
}

function isDaySlotAllowed(
  service: DomainService,
  startParts: ReturnType<typeof calendarParts>,
  endParts: ReturnType<typeof calendarParts>,
) {
  const checkInMinutes = parseClockMinutes(
    service.dayUnit?.checkInTime ?? "00:00",
  );
  const checkOutMinutes = parseClockMinutes(
    service.dayUnit?.checkOutTime ?? "00:00",
  );

  return (
    startParts.minutesSinceMidnight === checkInMinutes &&
    endParts.minutesSinceMidnight === checkOutMinutes &&
    isWithinBusinessHours(startParts, checkInMinutes) &&
    isWithinBusinessHours(endParts, checkOutMinutes)
  );
}

function isWithinBusinessHours(
  parts: ReturnType<typeof calendarParts>,
  minutes: number,
) {
  const window = domainConfig.businessHours[parts.weekday];
  if ("closed" in window) {
    return false;
  }

  const openMinutes = parseClockMinutes(window.open);
  const closeMinutes = parseClockMinutes(window.close);

  return minutes >= openMinutes && minutes <= closeMinutes;
}

function isBlackout(startMs: number, endMs: number) {
  return domainConfig.blackouts.some((blackout) => {
    const blackoutStart = Date.parse(blackout.startIso);
    const blackoutEnd = Date.parse(blackout.endIso);
    return startMs < blackoutEnd && endMs > blackoutStart;
  });
}

function parseClockMinutes(clock: string) {
  const [hour, minute] = clock
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  return hour! * 60 + minute!;
}

function calendarParts(timestampMs: number) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: domainConfig.storeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(timestampMs).map((part) => [part.type, part.value]),
  );
  const weekday = weekdayMap[parts.weekday ?? "Monday"] ?? "monday";
  const hour = Number.parseInt(parts.hour ?? "0", 10);
  const minute = Number.parseInt(parts.minute ?? "0", 10);

  return {
    weekday,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutesSinceMidnight: hour * 60 + minute,
  };
}
