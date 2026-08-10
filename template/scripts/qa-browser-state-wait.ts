import type { Page } from "@playwright/test";
import type { PublicThreadState } from "../packages/backend/src/agent-contract";
import type { QaPublicStateExpectation } from "../packages/backend/src/qa-browser-contract";
import { qaBrowserBridgeKey } from "../packages/backend/src/qa-browser-contract";

export type QaPublicStateWait = {
  readonly result: Promise<PublicThreadState>;
  readonly cancel: () => Promise<void>;
};

let waitSequence = 0;

export async function subscribeQaPublicState(
  page: Page,
  expectation: QaPublicStateExpectation,
  timeoutMs = 15_000,
): Promise<QaPublicStateWait> {
  waitSequence += 1;
  const id = `qa-state-${waitSequence}`;
  await page.evaluate(
    ({ bridgeKey, expectation, id, timeoutMs }) => {
      const bridgeValue: unknown = Reflect.get(window, bridgeKey);
      if (
        bridgeValue === null ||
        typeof bridgeValue !== "object" ||
        !("startPublicStateWait" in bridgeValue) ||
        typeof bridgeValue.startPublicStateWait !== "function"
      ) {
        throw new Error("qa_browser_bridge_unavailable");
      }
      bridgeValue.startPublicStateWait(id, expectation, timeoutMs);
    },
    { bridgeKey: qaBrowserBridgeKey, expectation, id, timeoutMs },
  );
  const result = page
    .evaluate(
      async ({ bridgeKey, id }) => {
        const bridgeValue: unknown = Reflect.get(window, bridgeKey);
        if (
          bridgeValue === null ||
          typeof bridgeValue !== "object" ||
          !("finishPublicStateWait" in bridgeValue) ||
          typeof bridgeValue.finishPublicStateWait !== "function"
        ) {
          throw new Error("qa_browser_bridge_unavailable");
        }
        return await bridgeValue.finishPublicStateWait(id);
      },
      { bridgeKey: qaBrowserBridgeKey, id },
    )
    .then((value) => {
      if (!isPublicThreadState(value)) {
        throw new Error("qa_public_state_invalid");
      }
      return value;
    });
  return {
    result,
    cancel: async () => {
      const settled = result.then(
        () => undefined,
        (error: unknown) => {
          if (
            error instanceof Error &&
            error.message.includes("exact_signal_cancelled")
          ) {
            return;
          }
          throw error;
        },
      );
      await page.evaluate(
        ({ bridgeKey, id }) => {
          const bridgeValue: unknown = Reflect.get(window, bridgeKey);
          if (
            bridgeValue !== null &&
            typeof bridgeValue === "object" &&
            "cancelPublicStateWait" in bridgeValue &&
            typeof bridgeValue.cancelPublicStateWait === "function"
          ) {
            bridgeValue.cancelPublicStateWait(id);
          }
        },
        { bridgeKey: qaBrowserBridgeKey, id },
      );
      await settled;
    },
  };
}

function isPublicThreadState(value: unknown): value is PublicThreadState {
  if (
    value === null ||
    typeof value !== "object" ||
    !("publicContext" in value) ||
    !("messages" in value)
  ) {
    return false;
  }
  const publicContext = value.publicContext;
  return (
    publicContext !== null &&
    typeof publicContext === "object" &&
    "status" in publicContext &&
    typeof publicContext.status === "string" &&
    Array.isArray(value.messages)
  );
}
