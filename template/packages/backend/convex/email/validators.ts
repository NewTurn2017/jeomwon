import { v } from "convex/values";

export const reservationEmailKindValidator = v.union(
  v.literal("reservation.confirmed"),
  v.literal("reservation.rescheduled"),
  v.literal("reservation.cancelled"),
  v.literal("reservation.escalated"),
);

const reservationStatusValidator = v.union(
  v.literal("draft"),
  v.literal("eligible"),
  v.literal("held"),
  v.literal("confirmed"),
  v.literal("rescheduled"),
  v.literal("waitlisted"),
  v.literal("cancelled"),
  v.literal("expired"),
  v.literal("denied"),
  v.literal("escalated"),
);

export const publicContextValidator = v.object({
  displayName: v.union(v.string(), v.null()),
  reservationId: v.union(v.string(), v.null()),
  serviceLabel: v.union(v.string(), v.null()),
  resourceLabel: v.union(v.string(), v.null()),
  timeWindow: v.union(v.string(), v.null()),
  status: reservationStatusValidator,
  policySummary: v.string(),
  nextStep: v.string(),
});

export const emailEventPayloadValidator = v.object({
  mode: v.union(v.literal("capture"), v.literal("sent")),
  to: v.string(),
  subject: v.string(),
  summary: v.string(),
  reservationId: v.union(v.string(), v.null()),
  template: reservationEmailKindValidator,
});
