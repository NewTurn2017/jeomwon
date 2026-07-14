import {
  type DomainResource,
  type DomainService,
  domainConfig,
} from "../../domain.config";
import type {
  DomainPublicSnapshot,
  GuardrailStatus,
  PublicContext,
  ReservationAuditActor,
  ReservationStatus,
} from "../../src/agent-contract";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { publicReservationId } from "./customerReservationPublicId";

type AuditEvent = {
  atMs: number;
  type: string;
  actor: ReservationAuditActor;
  summary: string;
  publicMessage: string | null;
};

export const collisionActiveStatuses = [
  "held",
  "confirmed",
  "rescheduled",
  "escalated",
] as const satisfies readonly ReservationStatus[];

// Each resource/status lookup reads at most 257 rows: 256 candidates plus one
// sentinel that tells callers to fail closed. This keeps hot reads comfortably
// below Convex's per-query row limits. The tradeoff is deliberate: a resource
// with more than 256 end-index candidates after the requested start becomes
// temporarily unavailable until old/future active rows are reconciled.
export const reservationOverlapCandidateCap = 256;

export async function resourceReservationsOverlapping(
  ctx: QueryCtx | MutationCtx,
  resourceKey: string,
  statuses: readonly ReservationStatus[],
  startMs: number,
  endMs: number,
) {
  const reads = await Promise.all(
    statuses.map(async (status) => {
      const rows = await ctx.db
        .query("reservations")
        .withIndex("by_resource_status_end", (query) =>
          query
            .eq("domainKey", domainConfig.domainKey)
            .eq("resourceKey", resourceKey)
            .eq("status", status)
            .gt("endMs", startMs),
        )
        .take(reservationOverlapCandidateCap + 1);

      return {
        rows: rows.slice(0, reservationOverlapCandidateCap),
        truncated: rows.length > reservationOverlapCandidateCap,
      };
    }),
  );
  const rows = reads.flatMap((read) => read.rows);

  return {
    reservations: rows.filter((reservation) => reservation.startMs < endMs),
    truncated: reads.some((read) => read.truncated),
  };
}

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
    reservationId: publicReservationId(reservation),
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

export function isActiveReservation(reservation: Doc<"reservations">) {
  if (
    reservation.status === "confirmed" ||
    reservation.status === "rescheduled" ||
    reservation.status === "escalated"
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

export function auditEvent(
  type: string,
  actor: ReservationAuditActor,
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
