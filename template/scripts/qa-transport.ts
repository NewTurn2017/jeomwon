import type { Page } from "@playwright/test";
import type {
  QaCanonicalCall,
  QaCanonicalFailureCode,
} from "../packages/backend/src/qa-browser-contract";
import {
  type PageJsonResponse,
  pageCanonicalCall,
  pageRequestJson,
} from "./qa-browser";
import { QaStableAssertionError } from "./qa-run-outcome";
import { assert, assertRecord, isRecord, qaState, readPath } from "./qa-shared";

export function qaPageA(): Page {
  assert(qaState.pageA !== null, "QA browser identity A is not authenticated");
  return qaState.pageA;
}

export function qaPageB(): Page {
  assert(qaState.pageB !== null, "QA browser identity B is not authenticated");
  return qaState.pageB;
}

export function threadIdForPage(page: Page): string {
  if (page === qaPageA()) {
    assert(qaState.threadA !== null, "QA identity A thread is not resolved");
    return qaState.threadA;
  }
  if (page === qaPageB()) {
    assert(qaState.threadB !== null, "QA identity B thread is not resolved");
    return qaState.threadB;
  }
  throw new Error("Unknown QA browser identity");
}

export async function requestJson(
  pathname: string,
  init: {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
  } = {},
  page = qaPageA(),
): Promise<PageJsonResponse> {
  return await pageRequestJson(page, { pathname, ...init });
}

export async function postChat(
  threadId: string,
  message: string,
  page = qaPageA(),
): Promise<unknown> {
  void threadId;
  const response = await requestJson(
    "/api/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        thread_id: threadIdForPage(page),
        message,
      }),
    },
    page,
  );
  if (response.status !== 200) {
    throw new QaStableAssertionError(`post_chat_http_${response.status}`);
  }
  return response.body;
}

export async function readAuthenticatedThreadId(page: Page): Promise<string> {
  const response = await requestJson("/api/chat", {}, page);
  assert(
    response.status === 200,
    "authenticated chat state did not return 200",
  );
  const threadId = readPath(response.body, ["threadId"]);
  assert(
    typeof threadId === "string" && threadId.length > 0,
    "authenticated chat state did not expose its derived thread",
  );
  return threadId;
}

export async function canonicalSuccessValue(
  page: Page,
  request: QaCanonicalCall,
  label: string,
): Promise<unknown> {
  const result = await pageCanonicalCall(page, request);
  if (result.kind === "success") return result.value;
  throw new Error(`${label} failed with ${result.error}`);
}

export function canonicalFailureCode(
  result: Awaited<ReturnType<typeof pageCanonicalCall>>,
  label: string,
  expected: QaCanonicalFailureCode,
): QaCanonicalFailureCode {
  assert(result.kind === "failure", `${label} unexpectedly succeeded`);
  assert(result.error === expected, `${label} returned ${result.error}`);
  return result.error;
}

export async function expectMutationRejects(
  runMutation: () => Promise<unknown>,
  expectedMessage: string,
): Promise<boolean> {
  try {
    await runMutation();
  } catch (error) {
    return (
      error instanceof Error &&
      error.message.toLowerCase().includes(expectedMessage.toLowerCase())
    );
  }
  return false;
}

export function assertErrorOmitsSensitiveData(
  value: unknown,
  label: string,
  sensitiveValues: readonly string[],
): void {
  const serialized = JSON.stringify(value);
  for (const sensitiveValue of sensitiveValues) {
    assert(
      !serialized.includes(sensitiveValue),
      `${label} exposed identity A reservation data`,
    );
  }
}

export function firstCanonicalSlot(value: unknown, label: string) {
  const slots = readPath(value, ["slots"]);
  assert(Array.isArray(slots), `${label} response has no slots`);
  const slot = slots[0];
  assertRecord(slot, label);
  assert(typeof slot.serviceKey === "string", `${label} has no serviceKey`);
  assert(typeof slot.resourceKey === "string", `${label} has no resourceKey`);
  assert(typeof slot.startMs === "number", `${label} has no startMs`);
  return {
    serviceKey: slot.serviceKey,
    resourceKey: slot.resourceKey,
    startMs: slot.startMs,
  };
}

export function findWaitlistSlotOpened(state: unknown) {
  const messages = readPath(state, ["messages"]);
  if (!Array.isArray(messages)) return null;
  const event = messages.find(
    (message) =>
      isRecord(message) &&
      message.type === "waitlist.slotOpened" &&
      message.message === "자리가 났어요. 지금 예약 가능합니다.",
  );
  return isRecord(event)
    ? { type: String(event.type), message: String(event.message) }
    : null;
}
