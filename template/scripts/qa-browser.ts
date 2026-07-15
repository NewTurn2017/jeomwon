import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import type {
  QaBrowserBridgeContract,
  QaCanonicalCall,
  QaCanonicalCallResult,
} from "../packages/backend/src/qa-browser-contract";
import {
  classifyQaManualRouteResponse,
  QA_CANONICAL_FAILURE_CODES,
  qaBrowserBridgeKey,
} from "../packages/backend/src/qa-browser-contract";

type QaBrowserAction = {
  readonly identity: "A" | "B";
  readonly action: "login" | "screenshot";
  readonly artifact: string | null;
};

type PageRequest = {
  readonly pathname: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
};

export type PageJsonResponse = {
  readonly status: number;
  readonly body: unknown;
};

export type QaBrowserHarness = {
  readonly browser: Browser;
  readonly contextA: BrowserContext;
  readonly contextB: BrowserContext;
  readonly pageA: Page;
  readonly pageB: Page;
  readonly unauthenticatedAdminRoute: ReturnType<
    typeof classifyQaManualRouteResponse
  >;
  readonly actions: readonly QaBrowserAction[];
};

const anonymousButtonName = /비회원으로 시작|Continue as a guest/;

export async function launchQaBrowser(
  baseUrl: string,
  artifactDir: string,
): Promise<QaBrowserHarness> {
  const actions: QaBrowserAction[] = [];
  const browser = await chromium.launch();
  try {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto(`${baseUrl}/login`);
    const unauthenticatedAdminRoute = await pageRequestRoute(pageA, "/admin");
    await pageA.getByRole("button", { name: anonymousButtonName }).click();
    await waitForAuthenticatedRoot(pageA);
    await waitForQaBridge(pageA);
    actions.push({ identity: "A", action: "login", artifact: null });

    await pageB.goto(`${baseUrl}/login`);
    await pageB.getByRole("button", { name: anonymousButtonName }).click();
    await waitForAuthenticatedRoot(pageB);
    await waitForQaBridge(pageB);
    actions.push({ identity: "B", action: "login", artifact: null });

    const screenshotA = "browser-a-login.png";
    const screenshotB = "browser-b-login.png";
    await pageA.screenshot({
      path: join(artifactDir, screenshotA),
      fullPage: true,
    });
    await pageB.screenshot({
      path: join(artifactDir, screenshotB),
      fullPage: true,
    });
    actions.push({
      identity: "A",
      action: "screenshot",
      artifact: screenshotA,
    });
    actions.push({
      identity: "B",
      action: "screenshot",
      artifact: screenshotB,
    });

    return {
      browser,
      contextA,
      contextB,
      pageA,
      pageB,
      unauthenticatedAdminRoute,
      actions,
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function pageRequestJson(
  page: Page,
  request: PageRequest,
): Promise<PageJsonResponse> {
  return await page.evaluate(async (request) => {
    const response = await fetch(request.pathname, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    const body: unknown = await response.text().then((text) => {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    });
    return { status: response.status, body };
  }, request);
}

export async function pageRequestRoute(page: Page, pathname: string) {
  const response = await page.evaluate(async (pathname) => {
    const response = await fetch(pathname, { redirect: "manual" });
    return { status: response.status, type: response.type };
  }, pathname);
  return classifyQaManualRouteResponse(response);
}

export async function pageCanonicalCall(
  page: Page,
  request: QaCanonicalCall,
): Promise<QaCanonicalCallResult> {
  return (await page.evaluate(
    async ({ bridgeKey, knownFailureCodes, request }) => {
      const bridgeValue: unknown = Reflect.get(window, bridgeKey);
      if (bridgeValue === null || typeof bridgeValue !== "object") {
        return { kind: "failure", error: "qa_browser_bridge_unavailable" };
      }
      const bridge = bridgeValue as QaBrowserBridgeContract;
      try {
        let value: unknown;
        switch (request.operation) {
          case "snapshot":
            value = await bridge.snapshot(request.args);
            break;
          case "availableSlots":
            value = await bridge.availableSlots(request.args);
            break;
          case "createHold":
            value = await bridge.createHold(request.args);
            break;
          case "confirmReservation":
            value = await bridge.confirmReservation(request.args);
            break;
          case "cancelReservation":
            value = await bridge.cancelReservation(request.args);
            break;
          case "rescheduleReservation":
            value = await bridge.rescheduleReservation(request.args);
            break;
          case "adminCreateSession":
            value = await bridge.adminCreateSession(request.args);
            break;
          case "adminUpdateSession":
            value = await bridge.adminUpdateSession(request.args);
            break;
          case "adminDeleteSession":
            value = await bridge.adminDeleteSession(request.args);
            break;
          default:
            request satisfies never;
            return {
              kind: "failure",
              error: "qa_browser_operation_unavailable",
            };
        }
        return { kind: "success", value };
      } catch (error) {
        const privateMessage =
          error instanceof Error ? error.message.toLowerCase() : "";
        const stableCode = knownFailureCodes.find((code) =>
          privateMessage.includes(code),
        );
        return {
          kind: "failure",
          error: stableCode ?? "canonical_call_failed",
        };
      }
    },
    {
      bridgeKey: qaBrowserBridgeKey,
      knownFailureCodes: QA_CANONICAL_FAILURE_CODES,
      request,
    },
  )) as QaCanonicalCallResult;
}

export function writeBrowserActions(
  artifactDir: string,
  actions: readonly QaBrowserAction[],
) {
  writeFileSync(
    join(artifactDir, "browser-actions.json"),
    `${JSON.stringify(actions, null, 2)}\n`,
  );
}

async function waitForAuthenticatedRoot(page: Page) {
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.waitForLoadState("networkidle");
}

async function waitForQaBridge(page: Page) {
  await page.waitForFunction(
    (bridgeKey) => typeof Reflect.get(window, bridgeKey) === "object",
    qaBrowserBridgeKey,
  );
}
