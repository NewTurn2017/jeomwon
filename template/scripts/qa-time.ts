import {
  alignToSlot,
  isSlotAllowed,
  serviceEndMs,
  slotStepMs,
} from "../packages/backend/convex/engine/availability";
import { isInsideCancelWindow } from "../packages/backend/convex/engine/policy";
import { domainConfig } from "../packages/backend/domain.config";
import { DAY_MS, HOUR_MS, qaService, qaServiceLabel } from "./qa-shared";

export function availabilityRequest(relativeDate: string): string {
  return `${relativeDate} ${qaServiceLabel} 가능한 시간 알려줘`;
}

export function waitlistJoinRequest(resourceLabel: string): string {
  return `${qaServiceLabel} 가능한 시간 알려줘 ${resourceLabel}`;
}

export function nextAllowedSlotStart(afterMs: number): number | null {
  const service = qaService ?? domainConfig.services[0];
  if (!service) return null;
  const step = slotStepMs(service);
  const horizonMs = afterMs + 21 * DAY_MS;
  for (
    let cursor = alignToSlot(afterMs, service);
    cursor < horizonMs;
    cursor += step
  ) {
    const start = alignToSlot(cursor, service);
    if (isSlotAllowed(start, serviceEndMs(service, start), service))
      return start;
  }
  return null;
}

export function insideCancelFeasible(nowMs: number = Date.now()): boolean {
  const slot = nextAllowedSlotStart(nowMs + HOUR_MS);
  return slot !== null && isInsideCancelWindow(slot, nowMs);
}

export function exactStateTimeoutMs(): number {
  const holdMs = Number.parseInt(
    process.env.JEOMWON_TEST_HOLD_MS ?? "5000",
    10,
  );
  return Math.max(90_000, holdMs + 30_000);
}

function cancelWindowOffset(
  kind: "inside" | "outside",
  nowMs: number = Date.now(),
): string {
  const service = qaService ?? domainConfig.services[0];
  const cancelWindowMs = domainConfig.policies.cancelWindowHours * HOUR_MS;
  const afterMs =
    kind === "outside" ? nowMs + cancelWindowMs + 6 * HOUR_MS : nowMs + HOUR_MS;
  const slotStart = nextAllowedSlotStart(afterMs);
  if (slotStart === null) {
    return kind === "outside"
      ? `${Math.ceil(domainConfig.policies.cancelWindowHours / 24) + 2}일 뒤`
      : `${Math.max(1, Math.floor(domainConfig.policies.cancelWindowHours / 2))}시간 뒤`;
  }
  const deltaMs = slotStart - nowMs;
  const round = kind === "inside" ? Math.floor : Math.ceil;
  if (service?.slotUnit === "day") {
    return `${Math.max(1, round(deltaMs / DAY_MS))}일 뒤`;
  }
  return `${Math.max(1, round(deltaMs / HOUR_MS))}시간 뒤`;
}

function slotSelectionRequest(): string {
  const noun = deriveQaResourceNoun();
  return `두 번째 ${noun}${koreanDirectionParticle(noun)} 잡아줘`;
}

function deriveQaResourceNoun(): string {
  const resourceKind =
    qaService?.resourceKind ?? domainConfig.resources[0]?.kind;
  const matchingResources = domainConfig.resources.filter(
    (resource) => resource.kind === resourceKind,
  );
  const commonLabel = commonResourceLabelNoun(matchingResources);
  if (commonLabel !== null) return commonLabel;
  const firstLabel = matchingResources[0]?.label;
  if (firstLabel) {
    const labelTokens = resourceLabelTokens(firstLabel);
    if (labelTokens.length > 0) return labelTokens.slice(-2).join(" ");
  }
  const fallbackByKind: Record<string, string> = {
    person: "담당자",
    room: "회의실",
    seat: "좌석",
    unit: "리소스",
  };
  return resourceKind ? (fallbackByKind[resourceKind] ?? "리소스") : "리소스";
}

function commonResourceLabelNoun(
  resources: typeof domainConfig.resources,
): string | null {
  const firstResource = resources[0];
  if (!firstResource) return null;
  const restResources = resources.slice(1);
  const commonTokens = resourceLabelTokens(firstResource.label).filter(
    (token) =>
      restResources.every((resource) =>
        resourceLabelTokens(resource.label).includes(token),
      ),
  );
  return commonTokens.length === 0 ? null : commonTokens.slice(-2).join(" ");
}

function resourceLabelTokens(label: string): readonly string[] {
  return (label.match(/[0-9A-Za-z가-힣]+/g) ?? []).filter(
    (token) =>
      token.length >= 2 && !/^\d+$/.test(token) && !/^[a-z]$/i.test(token),
  );
}

function koreanDirectionParticle(noun: string): string {
  const lastChar = [...noun.trim()].at(-1);
  if (!lastChar) return "로";
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "로";
  const finalConsonant = (code - 0xac00) % 28;
  return finalConsonant === 0 || finalConsonant === 8 ? "로" : "으로";
}

export const qaSlotSelectionMessage = slotSelectionRequest();
export const insideCancelRequest = availabilityRequest(
  cancelWindowOffset("inside"),
);
export const outsideCancelRequest = availabilityRequest(
  cancelWindowOffset("outside"),
);
