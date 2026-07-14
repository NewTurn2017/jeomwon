import { reservationStatuses } from "@jeomwon/backend/src/agent-contract";
import { z } from "zod";

const nonEmptyString = z.string().min(1);
const finiteNumber = z.number().finite();
const publicContext = z.object({
  displayName: z.string().nullable(),
  reservationId: nonEmptyString,
  serviceLabel: z.string().nullable(),
  resourceLabel: z.string().nullable(),
  timeWindow: z.string().nullable(),
  status: z.enum(reservationStatuses),
  policySummary: z.string(),
  nextStep: z.string(),
});
const publicSlot = z
  .object({
    serviceKey: nonEmptyString,
    serviceLabel: nonEmptyString,
    resourceKey: nonEmptyString,
    resourceLabel: nonEmptyString,
    startMs: finiteNumber,
    endMs: finiteNumber,
    timeWindow: nonEmptyString,
  })
  .refine((slot) => slot.endMs > slot.startMs);
const availabilityResult = z.object({ slots: z.array(publicSlot) });
const holdResult = z
  .object({
    publicContext,
    holdExpiresAtMs: finiteNumber.positive(),
  })
  .refine((result) => result.publicContext.status === "held");
const mutationResult = z.object({ publicContext });
const confirmedResult = mutationResult.refine(
  (result) => result.publicContext.status === "confirmed",
);
const rescheduledResult = mutationResult.refine(
  (result) => result.publicContext.status === "rescheduled",
);
const cancelResult = mutationResult
  .extend({ escalated: z.boolean() })
  .refine(
    (result) =>
      result.publicContext.status ===
      (result.escalated ? "escalated" : "cancelled"),
  );

export const customerResult = {
  availability(input: unknown) {
    return availabilityResult.parse(input);
  },
  hold(input: unknown) {
    const result = holdResult.safeParse(input);
    if (!result.success) throw new TypeError("malformed_hold_result");
    return result.data;
  },
  confirm(input: unknown) {
    return confirmedResult.parse(input);
  },
  reschedule(input: unknown) {
    return rescheduledResult.parse(input);
  },
  cancel(input: unknown) {
    return cancelResult.parse(input);
  },
} as const;
