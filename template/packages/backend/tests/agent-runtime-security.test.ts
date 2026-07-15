import { expect, mock, test } from "bun:test";
import type {
  AgentToolbox,
  handleChatRequest as HandleChatRequest,
} from "../../agents/src/index";
import { domainConfig } from "../../backend/domain.config";
import type {
  PublicContext,
  PublicThreadState,
} from "../../backend/src/agent-contract";

const internalFailureDetail =
  "deployment prod-example rejected provider-token-internal-only";
const internalOpenAiFailureDetail =
  "provider request failed with provider-token-server-only";
let capturedAuthToken = "";

class FailingConvexHttpClient {
  setAuth(authToken: string) {
    capturedAuthToken = authToken;
  }

  async mutation(): Promise<never> {
    throw new Error(internalFailureDetail);
  }

  async query(): Promise<never> {
    throw new Error(internalFailureDetail);
  }
}

mock.module("convex/browser", () => ({
  ConvexHttpClient: FailingConvexHttpClient,
}));

mock.module("@openai/agents", () => ({
  Agent: class {},
  run: async (): Promise<never> => {
    throw new Error(internalOpenAiFailureDetail);
  },
  tool: <Definition>(definition: Definition) => definition,
}));

const { handleChatRequest, runAgentTurn } = await import(
  "../../agents/src/index"
);

type ChatHandlerOptions = Parameters<typeof HandleChatRequest>[1];
type AuthTokenIsRequired = ChatHandlerOptions extends {
  readonly authToken: string;
}
  ? true
  : false;

const authTokenIsRequired: AuthTokenIsRequired = true;

test("runtime failure returns a generic envelope when an internal provider error is thrown", async () => {
  // Given
  capturedAuthToken = "";
  const request = new Request("https://app.example.invalid/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: "hello" }),
  });

  // When
  const response = await handleChatRequest(request, {
    convexUrl: "https://convex.example.invalid",
    runtimeMode: "mock",
    authToken: "authenticated-test-token",
  });

  // Then
  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).toBe(
    JSON.stringify({
      error: {
        code: "agent_runtime_failed",
        details: ["Agent runtime failed."],
      },
    }),
  );
  expect(JSON.stringify(response.body).includes(internalFailureDetail)).toBe(
    false,
  );
  expect(
    JSON.stringify(response.body).includes("provider-token-internal-only"),
  ).toBe(false);
  expect(capturedAuthToken).toBe("authenticated-test-token");
});

test("chat handler options require an authentication token at compile time", () => {
  // Given
  const expectedContract = true;

  // When
  const actualContract = authTokenIsRequired;

  // Then
  expect(actualContract).toBe(expectedContract);
});

test("OpenAI fallback logs no provider detail and preserves deterministic control flow", async () => {
  // Given
  const threadId = "user:users:security-review";
  const publicContext: PublicContext = {
    displayName: null,
    reservationId: null,
    serviceLabel: null,
    resourceLabel: null,
    timeWindow: null,
    status: "draft",
    policySummary: domainConfig.copy.policySummary,
    nextStep: domainConfig.copy.nextStepAvailability,
  };
  const publicState: PublicThreadState = {
    domain: domainConfig,
    threadId,
    activeAgent: "triage",
    publicContext,
    guardrailStatus: {
      relevance: "clear",
      confirmation: "clear",
      privacy: "clear",
    },
    guardrailBanner: null,
    suggestedSlots: [],
    messages: [],
    widgets: { reservationCard: publicContext, guardrailBanner: null },
  };
  let assistantLogCount = 0;
  const tools: AgentToolbox = {
    publicState: async () => publicState,
    logUserMessage: async () => {},
    logAssistantMessage: async () => {
      assistantLogCount += 1;
    },
    recordGuardrail: async () => ({ publicContext }),
    searchAvailability: async () => ({ slots: [] }),
    recordAvailability: async () => ({ publicContext }),
    joinWaitlist: async () => ({ publicContext }),
    lookupReservation: async () => ({ publicContext }),
    createHold: async () => ({ publicContext }),
    confirmReservation: async () => ({ publicContext }),
    cancelReservation: async () => ({ publicContext, escalated: false }),
    rescheduleReservation: async () => ({ publicContext }),
  };
  const warningCalls: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warningCalls.push(args);
  };

  try {
    // When
    const result = await runAgentTurn({
      request: { threadId, message: "예약 취소 정책을 알려주세요" },
      runtimeMode: "openai",
      tools,
    });

    // Then
    expect(result.threadId).toBe(threadId);
    expect(assistantLogCount).toBe(1);
    expect(
      JSON.stringify(warningCalls).includes(internalOpenAiFailureDetail),
    ).toBe(false);
    expect(
      JSON.stringify(warningCalls).includes("provider-token-server-only"),
    ).toBe(false);
    expect(JSON.stringify(warningCalls)).toBe(
      JSON.stringify([["[jeomwon] agent_runtime_fallback"]]),
    );
  } finally {
    console.warn = originalWarn;
  }
});
