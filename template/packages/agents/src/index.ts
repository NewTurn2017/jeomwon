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
  WaitlistArgs,
} from "@jeomwon/backend/src/agent-contract";
import { normalizeConvexArgs } from "@jeomwon/backend/src/boundary";
import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { Agent, run, tool } from "@openai/agents";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

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
  joinWaitlist(args: WaitlistArgs): Promise<{ publicContext: PublicContext }>;
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
    async joinWaitlist(args) {
      normalizeConvexArgs(args);
      return await client.mutation(jeomwonConvex.agentTools.joinWaitlist, args);
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
    return await runOpenAiTurn(input.request, input.tools);
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
  return await runDeterministicCore(request, tools, initialState);
}

// Safety guardrails (privacy / relevance / confirmation) run deterministically
// in BOTH runtimes. A non-null result short-circuits before any LLM reasoning,
// so the openai runtime inherits the exact same guarantees as the mock engine.
async function runGuardrailChecks(
  request: ChatRequest,
  tools: AgentToolbox,
  initialState: PublicThreadState,
): Promise<ChatTurnResult | null> {
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

  return null;
}

async function runDeterministicCore(
  request: ChatRequest,
  tools: AgentToolbox,
  initialState: PublicThreadState,
): Promise<ChatTurnResult> {
  const guardrail = await runGuardrailChecks(request, tools, initialState);
  if (guardrail) {
    return guardrail;
  }

  const text = request.message.trim();

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
  let recorded = await tools.recordAvailability({
    threadId,
    slots: availability.slots,
    serviceLabel: service.label,
    reservationId: options.reservationId ?? null,
  });
  if (availability.slots.length === 0 && domainConfig.features.waitlist) {
    recorded = await tools.joinWaitlist({
      threadId,
      serviceKey: service.key,
      resourceKey: resource?.key ?? null,
      preferredStartMs: parsePreferredStartMs(text),
    });
  }
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

// ── OpenAI Agents SDK runtime (hybrid) ────────────────────────────────────
// Real LLM inference via the OpenAI Agents SDK. Safety guardrails still run
// deterministically (see runGuardrailChecks); the LLM only reasons over the
// booking flow, driving Convex through tools bound to the same AgentToolbox.
// The deterministic engine stays the default runtime AND the fallback here, so
// a model/API failure degrades to a working turn instead of a 500.
// Reads OPENAI_API_KEY from the environment (picked up by the SDK). Override the
// model with OPENAI_AGENT_MODEL; otherwise the SDK default is used.

async function runOpenAiTurn(
  request: ChatRequest,
  tools: AgentToolbox,
): Promise<ChatTurnResult> {
  await tools.logUserMessage(request);
  const initialState = await tools.publicState(request.threadId);

  const guardrail = await runGuardrailChecks(request, tools, initialState);
  if (guardrail) {
    return guardrail;
  }

  try {
    return await runLlmTurn(request, tools, initialState);
  } catch (error) {
    console.warn(
      `[jeomwon] openai runtime failed, falling back to deterministic: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return await runDeterministicCore(request, tools, initialState);
  }
}

async function runLlmTurn(
  request: ChatRequest,
  tools: AgentToolbox,
  initialState: PublicThreadState,
): Promise<ChatTurnResult> {
  const activeAgent: { name: AgentName } = { name: "triage" };
  const model = process.env.OPENAI_AGENT_MODEL;
  const agent = new Agent({
    name: domainConfig.storeName,
    instructions: buildAgentInstructions(initialState),
    tools: buildAgentTools(request.threadId, tools, activeAgent),
    ...(model ? { model } : {}),
  });

  const result = await run(agent, request.message);
  const reply =
    (typeof result.finalOutput === "string" ? result.finalOutput.trim() : "") ||
    domainConfig.copy.availabilityIntro;

  await tools.logAssistantMessage({
    threadId: request.threadId,
    message: reply,
    agent: activeAgent.name,
    publicPayload: null,
  });

  const state = await tools.publicState(request.threadId);
  return await finalize(
    request.threadId,
    reply,
    activeAgent.name,
    state.publicContext,
    tools,
  );
}

function buildAgentInstructions(state: PublicThreadState): string {
  const ctx = state.publicContext;
  const services = domainConfig.services
    .map((service) => `${service.key}: ${service.label}`)
    .join(", ");
  const resources = domainConfig.resources
    .map((resource) => `${resource.key}: ${resource.label}`)
    .join(", ");
  const suggested =
    state.suggestedSlots.length > 0
      ? state.suggestedSlots
          .map(
            (slot, index) =>
              `${index + 1}. ${slot.timeWindow} / ${slot.resourceLabel} ` +
              `(serviceKey=${slot.serviceKey}, resourceKey=${slot.resourceKey}, ` +
              `startMs=${slot.startMs}, endMs=${slot.endMs})`,
          )
          .join("\n")
      : "(아직 없음)";

  return [
    `너는 "${domainConfig.storeName}"의 예약 담당 AI 점원이다. 한국어로 간결하고 정중하게 답한다.`,
    "역할: 고객의 예약 조회·홀드·확정·변경·취소를 돕는다.",
    "",
    "규칙:",
    "- 예약 가능 시간은 반드시 find_availability 도구로 조회해 사실만 제시한다. 시간을 지어내지 않는다.",
    "- 고객이 특정 시간을 고르면 hold_slot으로 임시 홀드를 만든다.",
    ...(domainConfig.features.waitlist
      ? [
          "- 가능한 시간이 없고 고객이 대기를 원하면 join_waitlist로 대기 요청을 접수한다.",
        ]
      : []),
    "- confirm_reservation은 고객이 명시적으로 확정 의사를 밝힌 뒤에만 호출한다. 확인 없이 확정하지 않는다.",
    "- 변경은 reschedule_reservation, 취소는 cancel_reservation, 조회는 lookup_reservation을 사용한다.",
    "- 도구가 반환한 slot의 serviceKey·resourceKey·startMs·endMs 값을 그대로 다음 도구에 넘긴다.",
    "- 운영 메모·내부 결정·리스크·원가 등 내부 정보는 절대 언급하지 않는다.",
    `- 정책 요약: ${ctx.policySummary}`,
    "",
    `서비스(key: 라벨): ${services}`,
    `리소스(key: 라벨): ${resources}`,
    "",
    "현재 대화 상태:",
    `- 예약 번호: ${ctx.reservationId ?? "없음"}`,
    `- 상태: ${ctx.status}`,
    "- 최근 제시한 슬롯:",
    suggested,
  ].join("\n");
}

function buildAgentTools(
  threadId: string,
  tools: AgentToolbox,
  activeAgent: { name: AgentName },
) {
  const agentTools = [
    tool({
      name: "find_availability",
      description:
        "가능한 예약 시간을 조회해 고객에게 제시할 후보 슬롯을 반환한다. 예약을 잡기 전 반드시 먼저 호출한다.",
      parameters: z.object({
        serviceKey: z
          .string()
          .nullable()
          .describe("서비스 key. 모르면 null (첫 서비스 사용)."),
        resourceKey: z
          .string()
          .nullable()
          .describe("리소스 key. 지정 없으면 null."),
        whenHint: z
          .string()
          .nullable()
          .describe("희망 시점 표현. 예: '3일 뒤', '내일'. 없으면 null."),
      }),
      execute: async ({ serviceKey, resourceKey, whenHint }) => {
        const service =
          domainConfig.services.find((item) => item.key === serviceKey) ??
          domainConfig.services[0];
        if (!service) {
          return "등록된 서비스가 없습니다.";
        }
        const resource =
          domainConfig.resources.find((item) => item.key === resourceKey) ??
          null;
        const availability = await tools.searchAvailability({
          threadId,
          serviceKey: service.key,
          resourceKey: resource?.key ?? null,
          preferredStartMs: parsePreferredStartMs(whenHint ?? ""),
          count: 3,
        });
        await tools.recordAvailability({
          threadId,
          slots: availability.slots,
          serviceLabel: service.label,
          reservationId: null,
        });
        activeAgent.name = "availability";
        return JSON.stringify(
          availability.slots.map((slot, index) => ({
            index: index + 1,
            serviceKey: slot.serviceKey,
            resourceKey: slot.resourceKey,
            startMs: slot.startMs,
            endMs: slot.endMs,
            timeWindow: slot.timeWindow,
            resourceLabel: slot.resourceLabel,
          })),
        );
      },
    }),
    tool({
      name: "hold_slot",
      description:
        "고객이 고른 시간으로 임시 홀드를 만든다. find_availability가 반환한 슬롯 필드를 그대로 넣는다.",
      parameters: z.object({
        serviceKey: z.string(),
        resourceKey: z.string(),
        startMs: z.number(),
        endMs: z.number(),
      }),
      execute: async ({ serviceKey, resourceKey, startMs, endMs }) => {
        const hold = await tools.createHold({
          threadId,
          displayName: null,
          serviceKey,
          resourceKey,
          startMs,
          endMs,
        });
        activeAgent.name = "reservation";
        return JSON.stringify({
          reservationId: hold.publicContext.reservationId,
          status: hold.publicContext.status,
          timeWindow: hold.publicContext.timeWindow,
        });
      },
    }),
    tool({
      name: "confirm_reservation",
      description:
        "홀드된 예약을 확정한다. 고객이 확정 의사를 밝힌 뒤에만 호출한다.",
      parameters: z.object({ reservationId: z.string() }),
      execute: async ({ reservationId }) => {
        try {
          const confirmed = await tools.confirmReservation({
            threadId,
            reservationId,
            confirmed: true,
          });
          activeAgent.name = "reservation";
          return JSON.stringify({
            reservationId: confirmed.publicContext.reservationId,
            status: confirmed.publicContext.status,
          });
        } catch (error) {
          return reservationOperationErrorReply(error, "confirm");
        }
      },
    }),
    tool({
      name: "cancel_reservation",
      description:
        "예약을 취소한다. 취소창을 벗어나면 운영자 확인으로 에스컬레이션될 수 있다.",
      parameters: z.object({ reservationId: z.string() }),
      execute: async ({ reservationId }) => {
        try {
          const cancelled = await tools.cancelReservation({
            threadId,
            reservationId,
            requestedAtMs: Date.now(),
          });
          activeAgent.name = cancelled.escalated ? "escalation" : "reservation";
          return JSON.stringify({
            status: cancelled.publicContext.status,
            escalated: cancelled.escalated,
          });
        } catch (error) {
          return reservationOperationErrorReply(error, "cancel");
        }
      },
    }),
    tool({
      name: "reschedule_reservation",
      description:
        "확정된 예약을 다른 시간으로 변경한다. 새 슬롯은 find_availability로 먼저 조회한다.",
      parameters: z.object({
        reservationId: z.string(),
        serviceKey: z.string(),
        resourceKey: z.string(),
        startMs: z.number(),
        endMs: z.number(),
      }),
      execute: async ({
        reservationId,
        serviceKey,
        resourceKey,
        startMs,
        endMs,
      }) => {
        try {
          const rescheduled = await tools.rescheduleReservation({
            threadId,
            reservationId,
            serviceKey,
            resourceKey,
            startMs,
            endMs,
            requestedAtMs: Date.now(),
          });
          activeAgent.name = "reservation";
          return JSON.stringify({
            status: rescheduled.publicContext.status,
            timeWindow: rescheduled.publicContext.timeWindow,
          });
        } catch (error) {
          return reservationOperationErrorReply(error, "reschedule");
        }
      },
    }),
    tool({
      name: "lookup_reservation",
      description: "예약 번호로 현재 예약 상태를 조회한다.",
      parameters: z.object({ reservationId: z.string() }),
      execute: async ({ reservationId }) => {
        try {
          const lookup = await tools.lookupReservation({
            threadId,
            reservationId,
          });
          activeAgent.name = "reservation";
          const ctx = lookup.publicContext;
          return JSON.stringify({
            reservationId: ctx.reservationId,
            serviceLabel: ctx.serviceLabel,
            resourceLabel: ctx.resourceLabel,
            timeWindow: ctx.timeWindow,
            status: ctx.status,
          });
        } catch {
          return "해당 예약 번호를 이 대화에서 찾을 수 없습니다.";
        }
      },
    }),
  ];

  if (domainConfig.features.waitlist) {
    agentTools.push(
      tool({
        name: "join_waitlist",
        description:
          "가능한 시간이 없을 때 고객의 대기 요청을 접수한다. find_availability 후 슬롯이 없을 때만 사용한다.",
        parameters: z.object({
          serviceKey: z
            .string()
            .nullable()
            .describe("서비스 key. 모르면 null (첫 서비스 사용)."),
          resourceKey: z
            .string()
            .nullable()
            .describe("리소스 key. 지정 없으면 null."),
          whenHint: z
            .string()
            .nullable()
            .describe("희망 시점 표현. 예: '3일 뒤', '내일'. 없으면 null."),
        }),
        execute: async ({ serviceKey, resourceKey, whenHint }) => {
          try {
            const joined = await tools.joinWaitlist({
              threadId,
              serviceKey,
              resourceKey,
              preferredStartMs: parsePreferredStartMs(whenHint ?? ""),
            });
            activeAgent.name = "availability";
            return JSON.stringify({
              reservationId: joined.publicContext.reservationId,
              status: joined.publicContext.status,
              nextStep: joined.publicContext.nextStep,
            });
          } catch (error) {
            if (error instanceof Error && error.message.includes("disabled")) {
              return "대기 접수 기능이 비활성화되어 있습니다.";
            }
            if (
              error instanceof Error &&
              error.message.includes("availability_exists")
            ) {
              return "현재 가능한 시간이 있습니다. 먼저 가능한 시간을 안내해 주세요.";
            }
            if (error instanceof Error && error.message.includes("not_found")) {
              return "요청한 서비스나 리소스를 확인할 수 없습니다. 가능한 항목을 다시 조회해 주세요.";
            }
            return "대기 접수 상태를 확인할 수 없습니다. 다른 시간을 다시 확인해 주세요.";
          }
        },
      }),
    );
  }

  return agentTools;
}
