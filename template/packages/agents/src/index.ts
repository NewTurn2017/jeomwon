import { domainConfig } from "@jeomwon/backend/domain.config";
import type {
  AgentName,
  AvailabilitySearchArgs,
  CancelArgs,
  ChatRequest,
  ChatTurnResult,
  ConfirmArgs,
  HoldArgs,
  LookupReservationArgs,
  PublicContext,
  PublicSlot,
  PublicThreadState,
  RescheduleArgs,
} from "@jeomwon/backend/src/agent-contract";
import { normalizeConvexArgs } from "@jeomwon/backend/src/boundary";
import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { ConvexHttpClient } from "convex/browser";

export type AgentRuntimeMode = "mock" | "openai";

export type AgentToolbox = {
  publicState(threadId: string): Promise<PublicThreadState>;
  logUserMessage(request: ChatRequest): Promise<void>;
  logAssistantMessage(input: {
    threadId: string;
    message: string;
    agent: AgentName;
    publicPayload: Record<string, string | number | boolean | null> | null;
  }): Promise<void>;
  recordGuardrail(input: {
    threadId: string;
    guardrail: "relevance" | "confirmation" | "privacy";
    message: string;
    status: "draft";
  }): Promise<{ publicContext: PublicContext }>;
  searchAvailability(
    args: AvailabilitySearchArgs,
  ): Promise<{ slots: PublicSlot[] }>;
  recordAvailability(input: {
    threadId: string;
    slots: PublicSlot[];
    serviceLabel: string | null;
    reservationId: string | null;
  }): Promise<{ publicContext: PublicContext }>;
  lookupReservation(
    args: LookupReservationArgs,
  ): Promise<{ publicContext: PublicContext }>;
  createHold(args: HoldArgs): Promise<{ publicContext: PublicContext }>;
  confirmReservation(
    args: ConfirmArgs,
  ): Promise<{ publicContext: PublicContext }>;
  cancelReservation(
    args: CancelArgs,
  ): Promise<{ publicContext: PublicContext; escalated: boolean }>;
  rescheduleReservation(
    args: RescheduleArgs,
  ): Promise<{ publicContext: PublicContext }>;
};

export function createConvexAgentToolbox(convexUrl: string): AgentToolbox {
  const client = new ConvexHttpClient(convexUrl);

  return {
    async publicState(threadId) {
      normalizeConvexArgs({ threadId });
      return await client.query(jeomwonConvex.chat.publicState, { threadId });
    },
    async logUserMessage(request) {
      normalizeConvexArgs(request);
      await client.mutation(jeomwonConvex.agentTools.logUserMessage, request);
    },
    async logAssistantMessage(input) {
      normalizeConvexArgs(input);
      await client.mutation(
        jeomwonConvex.agentTools.logAssistantMessage,
        input,
      );
    },
    async recordGuardrail(input) {
      normalizeConvexArgs(input);
      return await client.mutation(
        jeomwonConvex.agentTools.recordGuardrail,
        input,
      );
    },
    async searchAvailability(args) {
      normalizeConvexArgs(args);
      return await client.query(
        jeomwonConvex.agentTools.searchAvailability,
        args,
      );
    },
    async recordAvailability(input) {
      normalizeConvexArgs(input);
      return await client.mutation(
        jeomwonConvex.agentTools.recordAvailability,
        input,
      );
    },
    async lookupReservation(args) {
      normalizeConvexArgs(args);
      return await client.mutation(
        jeomwonConvex.agentTools.lookupReservation,
        args,
      );
    },
    async createHold(args) {
      normalizeConvexArgs(args);
      return await client.mutation(jeomwonConvex.agentTools.createHold, args);
    },
    async confirmReservation(args) {
      normalizeConvexArgs(args);
      return await client.mutation(
        jeomwonConvex.agentTools.confirmReservation,
        args,
      );
    },
    async cancelReservation(args) {
      normalizeConvexArgs(args);
      return await client.mutation(
        jeomwonConvex.agentTools.cancelReservation,
        args,
      );
    },
    async rescheduleReservation(args) {
      normalizeConvexArgs(args);
      return await client.mutation(
        jeomwonConvex.agentTools.rescheduleReservation,
        args,
      );
    },
  };
}

export async function runAgentTurn(input: {
  request: ChatRequest;
  runtimeMode: AgentRuntimeMode;
  tools: AgentToolbox;
}): Promise<ChatTurnResult> {
  if (input.runtimeMode === "openai") {
    await loadOpenAiAgentsSdk();
  }

  return await runDeterministicTurn(input.request, input.tools);
}

export function normalizeRuntimeMode(
  value: string | null | undefined,
): AgentRuntimeMode {
  return value === "openai" ? "openai" : "mock";
}

async function runDeterministicTurn(
  request: ChatRequest,
  tools: AgentToolbox,
): Promise<ChatTurnResult> {
  await tools.logUserMessage(request);

  const initialState = await tools.publicState(request.threadId);
  const text = request.message.trim();

  if (isPrivacyRequest(text)) {
    const reply = domainConfig.copy.privacyRefusal;
    const guardrail = await tools.recordGuardrail({
      threadId: request.threadId,
      guardrail: "privacy",
      message: reply,
      status: "draft",
    });
    await tools.logAssistantMessage({
      threadId: request.threadId,
      message: reply,
      agent: "triage",
      publicPayload: { guardrail: "privacy" },
    });
    return await finalize(
      request.threadId,
      reply,
      "triage",
      guardrail.publicContext,
      tools,
    );
  }

  if (!isRelevantRequest(text, initialState)) {
    const reply = domainConfig.copy.relevanceRefusal;
    const guardrail = await tools.recordGuardrail({
      threadId: request.threadId,
      guardrail: "relevance",
      message: reply,
      status: "draft",
    });
    await tools.logAssistantMessage({
      threadId: request.threadId,
      message: reply,
      agent: "triage",
      publicPayload: { guardrail: "relevance" },
    });
    return await finalize(
      request.threadId,
      reply,
      "triage",
      guardrail.publicContext,
      tools,
    );
  }

  if (asksToSkipConfirmation(text)) {
    const reply = domainConfig.copy.confirmationRequired;
    const guardrail = await tools.recordGuardrail({
      threadId: request.threadId,
      guardrail: "confirmation",
      message: reply,
      status: "draft",
    });
    await tools.logAssistantMessage({
      threadId: request.threadId,
      message: reply,
      agent: "reservation",
      publicPayload: { guardrail: "confirmation" },
    });
    return await finalize(
      request.threadId,
      reply,
      "reservation",
      guardrail.publicContext,
      tools,
    );
  }

  if (isCancelRequest(text)) {
    return await handleCancel(request.threadId, text, initialState, tools);
  }

  if (isConfirmation(text) && initialState.publicContext.status === "held") {
    return await handleConfirmation(
      request.threadId,
      text,
      initialState,
      tools,
    );
  }

  const slotSelection = suggestedSlotSelection(text, initialState);
  if (slotSelection.kind === "valid") {
    if (isRescheduleSelection(initialState)) {
      return await handleReschedule(
        request.threadId,
        slotSelection.slot,
        initialState,
        tools,
      );
    }
    return await handleHold(request.threadId, slotSelection.slot, tools);
  }
  if (slotSelection.kind === "out-of-range") {
    return await handleSlotSelectionOutOfRange(
      request.threadId,
      initialState,
      tools,
    );
  }

  if (isRescheduleRequest(text)) {
    return await handleRescheduleAvailability(
      request.threadId,
      text,
      initialState,
      tools,
    );
  }

  if (isLookupRequest(text) || extractReservationReference(text) !== null) {
    return await handleLookup(request.threadId, text, initialState, tools);
  }

  if (isPolicyRequest(text)) {
    const reply = domainConfig.copy.policySummary;
    await tools.logAssistantMessage({
      threadId: request.threadId,
      message: reply,
      agent: "policy",
      publicPayload: null,
    });
    return await finalize(
      request.threadId,
      reply,
      "policy",
      initialState.publicContext,
      tools,
    );
  }

  return await handleAvailability(request.threadId, text, tools);
}

async function handleAvailability(
  threadId: string,
  text: string,
  tools: AgentToolbox,
  options: {
    reservationId?: string | null;
    serviceLabel?: string | null;
  } = {},
) {
  const service = matchService(text, options.serviceLabel);
  const resource = matchResource(text);
  const availability = await tools.searchAvailability({
    threadId,
    serviceKey: service.key,
    resourceKey: resource?.key ?? null,
    preferredStartMs: parsePreferredStartMs(text),
    count: 3,
  });
  const recorded = await tools.recordAvailability({
    threadId,
    slots: availability.slots,
    serviceLabel: service.label,
    reservationId: options.reservationId ?? null,
  });
  const reply =
    availability.slots.length > 0
      ? `${domainConfig.copy.availabilityIntro}\n${availability.slots
          .map(
            (slot, index) =>
              `${index + 1}. ${slot.timeWindow} / ${slot.resourceLabel}`,
          )
          .join("\n")}`
      : "조건에 맞는 바로 가능한 시간이 없습니다. 대기 접수나 다른 시간을 도와드릴게요.";

  await tools.logAssistantMessage({
    threadId,
    message: reply,
    agent: "availability",
    publicPayload: { slotCount: availability.slots.length },
  });

  return await finalize(
    threadId,
    reply,
    "availability",
    recorded.publicContext,
    tools,
  );
}

async function handleHold(
  threadId: string,
  slot: PublicSlot,
  tools: AgentToolbox,
) {
  const hold = await tools.createHold({
    threadId,
    displayName: null,
    serviceKey: slot.serviceKey,
    resourceKey: slot.resourceKey,
    startMs: slot.startMs,
    endMs: slot.endMs,
  });
  const reply = [
    domainConfig.copy.holdCreated,
    publicReservationLine(hold.publicContext.reservationId),
    slot.timeWindow,
  ]
    .filter(Boolean)
    .join("\n");
  await tools.logAssistantMessage({
    threadId,
    message: reply,
    agent: "reservation",
    publicPayload: {
      reservationId: hold.publicContext.reservationId,
    },
  });

  return await finalize(
    threadId,
    reply,
    "reservation",
    hold.publicContext,
    tools,
  );
}

async function handleConfirmation(
  threadId: string,
  text: string,
  state: PublicThreadState,
  tools: AgentToolbox,
) {
  const reservationId =
    extractReservationReference(text) ?? state.publicContext.reservationId;
  if (reservationId === null) {
    return await handleAvailability(threadId, "", tools);
  }

  let confirmed: { publicContext: PublicContext };
  try {
    confirmed = await tools.confirmReservation({
      threadId,
      reservationId,
      confirmed: true,
    });
  } catch (error) {
    const reply = reservationOperationErrorReply(error, "confirm");
    await tools.logAssistantMessage({
      threadId,
      message: reply,
      agent: "reservation",
      publicPayload: null,
    });
    return await finalize(
      threadId,
      reply,
      "reservation",
      state.publicContext,
      tools,
    );
  }
  const reply = [
    domainConfig.copy.confirmed,
    publicReservationLine(confirmed.publicContext.reservationId),
  ]
    .filter(Boolean)
    .join("\n");
  await tools.logAssistantMessage({
    threadId,
    message: reply,
    agent: "reservation",
    publicPayload: { reservationId: confirmed.publicContext.reservationId },
  });

  return await finalize(
    threadId,
    reply,
    "reservation",
    confirmed.publicContext,
    tools,
  );
}

async function handleCancel(
  threadId: string,
  text: string,
  state: PublicThreadState,
  tools: AgentToolbox,
) {
  const reservationId =
    extractReservationReference(text) ?? state.publicContext.reservationId;
  if (reservationId === null) {
    const reply =
      "취소할 예약을 먼저 찾을 수 있어야 합니다. 예약 가능 시간부터 확인해 주세요.";
    await tools.logAssistantMessage({
      threadId,
      message: reply,
      agent: "reservation",
      publicPayload: null,
    });
    return await finalize(
      threadId,
      reply,
      "reservation",
      state.publicContext,
      tools,
    );
  }

  let cancelled: { publicContext: PublicContext; escalated: boolean };
  try {
    cancelled = await tools.cancelReservation({
      threadId,
      reservationId,
      requestedAtMs: Date.now(),
    });
  } catch (error) {
    const reply = reservationOperationErrorReply(error, "cancel");
    await tools.logAssistantMessage({
      threadId,
      message: reply,
      agent: "reservation",
      publicPayload: null,
    });
    return await finalize(
      threadId,
      reply,
      "reservation",
      state.publicContext,
      tools,
    );
  }
  const reply = [
    cancelled.escalated
      ? domainConfig.copy.cancelEscalated
      : domainConfig.copy.cancelled,
    publicReservationLine(cancelled.publicContext.reservationId),
  ]
    .filter(Boolean)
    .join("\n");
  await tools.logAssistantMessage({
    threadId,
    message: reply,
    agent: cancelled.escalated ? "escalation" : "reservation",
    publicPayload: { reservationId: cancelled.publicContext.reservationId },
  });

  return await finalize(
    threadId,
    reply,
    cancelled.escalated ? "escalation" : "reservation",
    cancelled.publicContext,
    tools,
  );
}

async function handleLookup(
  threadId: string,
  text: string,
  state: PublicThreadState,
  tools: AgentToolbox,
) {
  let publicContext: PublicContext | null = null;
  try {
    publicContext = await resolveReferencedReservationContext(
      threadId,
      text,
      state,
      tools,
    );
  } catch {
    publicContext = null;
  }

  if (publicContext === null) {
    const reply = "조회할 예약 번호를 알려주세요.";
    await tools.logAssistantMessage({
      threadId,
      message: reply,
      agent: "reservation",
      publicPayload: null,
    });
    return await finalize(
      threadId,
      reply,
      "reservation",
      state.publicContext,
      tools,
    );
  }

  const reply = [
    "예약 정보를 확인했습니다.",
    publicReservationLine(publicContext.reservationId),
    publicContext.serviceLabel,
    publicContext.resourceLabel,
    publicContext.timeWindow,
    `상태: ${publicContext.status}`,
  ]
    .filter(Boolean)
    .join("\n");
  await tools.logAssistantMessage({
    threadId,
    message: reply,
    agent: "reservation",
    publicPayload: { reservationId: publicContext.reservationId },
  });
  return await finalize(threadId, reply, "reservation", publicContext, tools);
}

async function handleRescheduleAvailability(
  threadId: string,
  text: string,
  state: PublicThreadState,
  tools: AgentToolbox,
) {
  let publicContext: PublicContext | null = null;
  try {
    publicContext = await resolveReferencedReservationContext(
      threadId,
      text,
      state,
      tools,
    );
  } catch {
    publicContext = null;
  }

  if (publicContext?.reservationId === null || publicContext === null) {
    const reply = "변경할 예약 번호를 알려주세요.";
    await tools.logAssistantMessage({
      threadId,
      message: reply,
      agent: "reservation",
      publicPayload: null,
    });
    return await finalize(
      threadId,
      reply,
      "reservation",
      state.publicContext,
      tools,
    );
  }

  if (
    publicContext.status !== "confirmed" &&
    publicContext.status !== "rescheduled"
  ) {
    const reply = "확정된 예약만 변경할 수 있습니다.";
    await tools.logAssistantMessage({
      threadId,
      message: reply,
      agent: "reservation",
      publicPayload: { reservationId: publicContext.reservationId },
    });
    return await finalize(threadId, reply, "reservation", publicContext, tools);
  }

  return await handleAvailability(threadId, text, tools, {
    reservationId: publicContext.reservationId,
    serviceLabel: publicContext.serviceLabel,
  });
}

async function handleReschedule(
  threadId: string,
  slot: PublicSlot,
  state: PublicThreadState,
  tools: AgentToolbox,
) {
  const reservationId = state.publicContext.reservationId;
  if (reservationId === null) {
    return await handleHold(threadId, slot, tools);
  }

  let rescheduled: { publicContext: PublicContext };
  try {
    rescheduled = await tools.rescheduleReservation({
      threadId,
      reservationId,
      serviceKey: slot.serviceKey,
      resourceKey: slot.resourceKey,
      startMs: slot.startMs,
      endMs: slot.endMs,
      requestedAtMs: Date.now(),
    });
  } catch (error) {
    const reply = reservationOperationErrorReply(error, "reschedule");
    await tools.logAssistantMessage({
      threadId,
      message: reply,
      agent: "reservation",
      publicPayload: { reservationId },
    });
    return await finalize(
      threadId,
      reply,
      "reservation",
      state.publicContext,
      tools,
    );
  }

  const reply = [
    domainConfig.copy.rescheduled,
    publicReservationLine(rescheduled.publicContext.reservationId),
    rescheduled.publicContext.timeWindow ?? slot.timeWindow,
  ]
    .filter(Boolean)
    .join("\n");
  await tools.logAssistantMessage({
    threadId,
    message: reply,
    agent: "reservation",
    publicPayload: { reservationId: rescheduled.publicContext.reservationId },
  });

  return await finalize(
    threadId,
    reply,
    "reservation",
    rescheduled.publicContext,
    tools,
  );
}

async function handleSlotSelectionOutOfRange(
  threadId: string,
  state: PublicThreadState,
  tools: AgentToolbox,
) {
  const reply = `제시된 선택지 중 1-${state.suggestedSlots.length}번에서 골라 주세요.`;
  await tools.logAssistantMessage({
    threadId,
    message: reply,
    agent: "availability",
    publicPayload: { slotCount: state.suggestedSlots.length },
  });
  return await finalize(
    threadId,
    reply,
    "availability",
    state.publicContext,
    tools,
  );
}

async function resolveReferencedReservationContext(
  threadId: string,
  text: string,
  state: PublicThreadState,
  tools: AgentToolbox,
) {
  const reservationId =
    extractReservationReference(text) ?? state.publicContext.reservationId;
  if (reservationId === null) {
    return null;
  }

  const lookup = await tools.lookupReservation({ threadId, reservationId });
  return lookup.publicContext;
}

function publicReservationLine(reservationId: string | null) {
  return reservationId ? `예약 번호: ${reservationId}` : null;
}

function extractReservationReference(text: string) {
  const match = text.match(/([A-Z0-9]{2,6}-\d{6}-[A-Z0-9]{6})/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function reservationOperationErrorReply(
  error: unknown,
  operation: "confirm" | "cancel" | "reschedule",
) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("reservation_not_found")) {
    return "해당 예약 번호를 이 대화에서 찾을 수 없습니다.";
  }
  if (message.includes("reservation_not_reschedulable")) {
    return "확정된 예약만 변경할 수 있습니다.";
  }
  if (message.includes("reschedule_window_closed")) {
    return "변경 가능 시간이 지나 운영자 확인이 필요합니다.";
  }
  if (message.includes("slot_conflict")) {
    return "선택한 시간은 방금 마감되었습니다. 다른 시간을 선택해 주세요.";
  }
  if (message.includes("slot_outside_business_hours")) {
    return "선택한 시간은 운영 시간 밖입니다. 다른 시간을 선택해 주세요.";
  }
  if (operation === "confirm") {
    return "예약 확정 상태를 확인할 수 없습니다. 예약 번호를 다시 확인해 주세요.";
  }
  if (operation === "cancel") {
    return "예약 취소 상태를 확인할 수 없습니다. 예약 번호를 다시 확인해 주세요.";
  }
  return "예약 변경 상태를 확인할 수 없습니다. 예약 번호와 시간을 다시 확인해 주세요.";
}

async function finalize(
  threadId: string,
  reply: string,
  activeAgent: AgentName,
  publicContext: PublicContext,
  tools: AgentToolbox,
): Promise<ChatTurnResult> {
  const state = await tools.publicState(threadId);
  return {
    threadId,
    reply,
    activeAgent,
    publicContext,
    guardrailStatus: state.guardrailStatus,
    state,
  };
}

const relevanceTerms = deriveRelevanceTerms();

function isRelevantRequest(text: string, state: PublicThreadState) {
  if (isContextualSlotSelection(text, state)) {
    return true;
  }
  if (extractReservationReference(text) !== null) {
    return true;
  }

  const normalized = text.toLowerCase();
  return relevanceTerms.some((term) => normalized.includes(term));
}

function deriveRelevanceTerms() {
  const terms = new Set([
    "예약",
    "가능",
    "시간",
    "일정",
    "취소",
    "변경",
    "확정",
    "확인",
    "조회",
    "상태",
    "상담",
    "회의",
    "가격",
    "비용",
    "정책",
    "규정",
    "appointment",
    "reservation",
    "book",
    "cancel",
    "reschedule",
    "change",
    "move",
    "lookup",
    "status",
    "available",
    "availability",
    "price",
    "policy",
    "service",
    "slot",
  ]);

  const addTerm = (term: string) => {
    const normalized = term.trim().toLowerCase();
    if (normalized.length >= 2) {
      terms.add(normalized);
    }
  };
  const addTokens = (value: string, source: "label" | "copy") => {
    for (const token of tokenizeDomainText(value)) {
      if (source === "copy" && !isDomainCopyToken(token)) {
        continue;
      }
      addTerm(token);
    }
  };

  addTerm(domainConfig.domainKey);
  addTerm(domainConfig.storeName);
  addTokens(domainConfig.storeName, "label");

  for (const service of domainConfig.services) {
    addTerm(service.key);
    addTerm(service.label);
    addTokens(service.label, "label");
    addResourceKindTerms(service.resourceKind, addTerm);
  }

  for (const resource of domainConfig.resources) {
    addTerm(resource.key);
    addTerm(resource.label);
    addTokens(resource.label, "label");
    addResourceKindTerms(resource.kind, addTerm);
  }

  for (const copy of Object.values(domainConfig.copy)) {
    addTokens(copy, "copy");
  }

  return [...terms];
}

function isPrivacyRequest(text: string) {
  return /내부|시스템 프롬프트|system prompt|developer message|private|token|raw/i.test(
    text,
  );
}

function asksToSkipConfirmation(text: string) {
  return /확인 없이|확인 절차 생략|바로 확정|skip confirmation|without confirmation/i.test(
    text,
  );
}

function isCancelRequest(text: string) {
  return /취소|cancel/i.test(text);
}

function isConfirmation(text: string) {
  return /확인|네|맞아요|좋아요|confirm|yes/i.test(text);
}

function suggestedSlotSelection(text: string, state: PublicThreadState) {
  const selectionIndex = parseSlotSelectionIndex(text);
  if (
    selectionIndex === null ||
    !isSlotSelectionIntent(text) ||
    state.suggestedSlots.length === 0
  ) {
    return { kind: "none" as const };
  }

  const slot = state.suggestedSlots[selectionIndex];
  if (!slot) {
    return { kind: "out-of-range" as const };
  }

  return { kind: "valid" as const, slot };
}

function isRescheduleSelection(state: PublicThreadState) {
  return (
    state.publicContext.reservationId !== null &&
    state.publicContext.status === "eligible"
  );
}

function isRescheduleRequest(text: string) {
  return /변경|바꿔|옮겨|다른 시간|reschedule|change|move|modify/i.test(text);
}

function isLookupRequest(text: string) {
  return /조회|상태|내 예약|예약 확인|lookup|status|find/i.test(text);
}

function isContextualSlotSelection(text: string, state: PublicThreadState) {
  return (
    state.suggestedSlots.length > 0 &&
    parseSlotSelectionIndex(text) !== null &&
    isSlotSelectionIntent(text)
  );
}

function parseSlotSelectionIndex(text: string) {
  const normalized = text.toLowerCase();
  const numberMatch = normalized.match(/([1-9]\d*)\s*(?:번|번째|st|nd|rd|th)/);
  if (numberMatch?.[1]) {
    return Number.parseInt(numberMatch[1], 10) - 1;
  }

  if (/첫|처음|first/.test(normalized)) {
    return 0;
  }
  if (/두\s*번째|둘째|second/.test(normalized)) {
    return 1;
  }
  if (/세\s*번째|셋째|third/.test(normalized)) {
    return 2;
  }
  if (/네\s*번째|넷째|fourth/.test(normalized)) {
    return 3;
  }
  if (/다섯\s*번째|다섯째|fifth/.test(normalized)) {
    return 4;
  }
  if (/그걸로|이걸로|그거로|이거로|that one/.test(normalized)) {
    return 0;
  }

  return null;
}

function isSlotSelectionIntent(text: string) {
  return (
    parseSlotSelectionIndex(text) !== null ||
    /잡아|예약|선택|해줘|해주세요|할게|할께|하겠습니다|book|reserve|select/i.test(
      text,
    )
  );
}

function isPolicyRequest(text: string) {
  return /정책|규정|가격|비용|policy|price|cost/i.test(text);
}

function matchService(text: string, fallbackLabel: string | null = null) {
  const normalized = text.toLowerCase();
  return (
    domainConfig.services.find((service) =>
      [service.key, service.label].some((term) =>
        normalized.includes(term.toLowerCase()),
      ),
    ) ??
    domainConfig.services.find((service) => service.label === fallbackLabel) ??
    domainConfig.services[0]!
  );
}

function matchResource(text: string) {
  const normalized = text.toLowerCase();
  return (
    domainConfig.resources.find((resource) =>
      [resource.key, resource.label].some((term) =>
        normalized.includes(term.toLowerCase()),
      ),
    ) ?? null
  );
}

function addResourceKindTerms(kind: string, addTerm: (term: string) => void) {
  const termsByKind: Record<string, string[]> = {
    person: [
      "담당",
      "담당자",
      "상담사",
      "디자이너",
      "직원",
      "person",
      "advisor",
    ],
    room: ["방", "객실", "회의실", "룸", "room"],
    seat: ["좌석", "자리", "seat"],
    unit: ["유닛", "상품", "unit"],
  };

  addTerm(kind);
  for (const term of termsByKind[kind] ?? []) {
    addTerm(term);
  }
}

function tokenizeDomainText(value: string) {
  return value.match(/[0-9A-Za-z가-힣]+/g) ?? [];
}

function isDomainCopyToken(token: string) {
  const normalized = token.toLowerCase();
  const stopwords = new Set([
    "안녕하세요",
    "가능한",
    "관련",
    "문의만",
    "문의를",
    "입력하세요",
    "요청하신",
    "조건으로",
    "선택한",
    "내용이",
    "맞으면",
    "답해",
    "주세요",
    "필요하면",
    "다시",
    "말씀해",
    "공개",
    "내부",
    "운영",
    "정보",
    "제공하지",
    "않습니다",
    "유지되며",
    "시작",
    "이내",
    "필요합니다",
    "customer",
  ]);

  return normalized.length >= 2 && !stopwords.has(normalized);
}

function parsePreferredStartMs(text: string) {
  const now = Date.now();
  const hourMatch = text.match(/(\d+)\s*시간\s*뒤/);
  if (hourMatch?.[1]) {
    return now + Number.parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
  }

  const dayMatch = text.match(/(\d+)\s*일\s*뒤/);
  if (dayMatch?.[1]) {
    return now + Number.parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;
  }

  if (/내일|tomorrow/i.test(text)) {
    return now + 24 * 60 * 60 * 1000;
  }

  if (/모레/i.test(text)) {
    return now + 48 * 60 * 60 * 1000;
  }

  return null;
}

async function loadOpenAiAgentsSdk() {
  const importModule = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<unknown>;

  try {
    await importModule("@openai/agents");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown OpenAI Agents SDK error";
    throw new Error(`openai_agents_sdk_unavailable: ${message}`);
  }
}
