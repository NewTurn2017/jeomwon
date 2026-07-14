import {
  type DomainResource,
  type DomainService,
  domainConfig,
  getServiceDurationMinutes,
  type Weekday,
} from "../../domain.config";
import type { PublicSlot } from "../../src/agent-contract";
import type { Doc, Id } from "../_generated/dataModel";
import { isActiveReservation, timeWindowLabel } from "./lifecycle";

const weekdayMap: Record<string, Weekday> = {
  Monday: "monday",
  Tuesday: "tuesday",
  Wednesday: "wednesday",
  Thursday: "thursday",
  Friday: "friday",
  Saturday: "saturday",
  Sunday: "sunday",
};

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

export function calendarParts(timestampMs: number) {
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
