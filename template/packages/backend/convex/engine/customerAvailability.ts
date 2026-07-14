import { domainConfig } from "../../domain.config";
import type {
  CustomerAvailableSlotsArgs,
  PublicSlot,
} from "../../src/agent-contract";
import type { QueryCtx } from "../_generated/server";
import {
  buildSlot,
  firstSearchStart,
  hasCollision,
  isSlotAllowed,
  serviceEndMs,
  slotStepMs,
} from "./availability";
import { publicResources } from "./customerReservationLifecycle";
import {
  collisionActiveStatuses,
  resourceReservationsOverlapping,
} from "./lifecycle";

export async function customerAvailableSlots(
  ctx: QueryCtx,
  input: CustomerAvailableSlotsArgs,
): Promise<{ slots: PublicSlot[] }> {
  const service = domainConfig.services.find(
    (candidate) => candidate.key === input.serviceKey,
  );
  if (service === undefined) {
    throw new Error("service_not_found");
  }

  const resources = await publicResources(ctx);
  const resourceCandidates = resources.filter(
    (candidate) =>
      candidate.kind === service.resourceKind &&
      (input.resourceKey === null || candidate.key === input.resourceKey),
  );
  if (resourceCandidates.length === 0) {
    throw new Error("resource_not_found");
  }

  const slots: PublicSlot[] = [];
  const firstStartMs = firstSearchStart(input.preferredStartMs, service);
  const horizonMs = firstStartMs + 21 * 24 * 60 * 60 * 1000;
  const reservationReads = await Promise.all(
    resourceCandidates.map(async (resource) => ({
      resourceKey: resource.key,
      ...(await resourceReservationsOverlapping(
        ctx,
        resource.key,
        collisionActiveStatuses,
        firstStartMs,
        serviceEndMs(service, horizonMs),
      )),
    })),
  );
  const safeResourceKeys = new Set(
    reservationReads
      .filter((read) => !read.truncated)
      .map((read) => read.resourceKey),
  );
  const reservations = reservationReads.flatMap((read) => read.reservations);

  for (
    let startMs = firstStartMs;
    startMs < horizonMs && slots.length < Math.max(1, input.count);
    startMs += slotStepMs(service)
  ) {
    for (const resource of resourceCandidates) {
      const slot = buildSlot(service, resource, startMs);
      if (
        safeResourceKeys.has(resource.key) &&
        isSlotAllowed(slot.startMs, slot.endMs, service) &&
        !hasCollision(reservations, resource.key, slot.startMs, slot.endMs)
      ) {
        slots.push(slot);
      }
      if (slots.length >= Math.max(1, input.count)) {
        break;
      }
    }
  }

  return { slots };
}
