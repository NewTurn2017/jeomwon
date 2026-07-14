import { domainConfig } from "../../domain.config";

export function isInsideCancelWindow(startMs: number, requestedAtMs: number) {
  const cancelWindowMs =
    domainConfig.policies.cancelWindowHours * 60 * 60 * 1000;
  return startMs - requestedAtMs < cancelWindowMs;
}
