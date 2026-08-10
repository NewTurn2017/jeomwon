import { isInsideCancelWindow } from "../packages/backend/convex/engine/policy";
import { pageCanonicalCall } from "./qa-browser";
import { assert } from "./qa-shared";
import { canonicalSuccessValue, qaPageA } from "./qa-transport";

export type AccountEmailTemplate =
  | "reservation.confirmed"
  | "reservation.rescheduled"
  | "reservation.cancelled"
  | "reservation.escalated";
export type AccountFlowHooks = {
  readonly capture: <T>(
    template: AccountEmailTemplate,
    trigger: () => Promise<T>,
  ) => Promise<T>;
};

export function accountCancellationTemplate(
  startMs: number,
): AccountEmailTemplate {
  return isInsideCancelWindow(startMs, Date.now())
    ? "reservation.escalated"
    : "reservation.cancelled";
}

export async function capturedCanonicalSuccess(
  request: Parameters<typeof pageCanonicalCall>[1],
  label: string,
  template: AccountEmailTemplate,
  hooks?: AccountFlowHooks,
): Promise<unknown> {
  if (hooks === undefined) {
    return await canonicalSuccessValue(qaPageA(), request, label);
  }
  const result = await hooks.capture(template, () =>
    pageCanonicalCall(qaPageA(), request),
  );
  if (result.kind === "failure") {
    assert(false, `${label} failed with ${result.error}`);
  }
  return result.value;
}
