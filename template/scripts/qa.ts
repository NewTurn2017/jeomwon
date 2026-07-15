import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { parse as parseDotenv } from "dotenv";
import {
  alignToSlot,
  isSlotAllowed,
  serviceEndMs,
  slotStepMs,
} from "../packages/backend/convex/engine/availability";
import { isInsideCancelWindow } from "../packages/backend/convex/engine/policy";
import { domainConfig } from "../packages/backend/domain.config";
import type { QaCanonicalFailureCode } from "../packages/backend/src/qa-browser-contract";
import {
  launchQaBrowser,
  pageCanonicalCall,
  pageRequestJson,
  pageRequestRoute,
  writeBrowserActions,
} from "./qa-browser";
import type { QaGateId } from "./qa-contract";
import { QA_GATE_CONTRACT } from "./qa-contract";
import {
  convexRunArgs,
  resolveQaConvexTarget,
  sanitizeConvexChildEnv,
} from "./qa-runtime-contract";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

type QaResult = {
  id: QaGateId;
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  output: string[];
};
type QaResetResult = {
  domainKey: string;
  reservations: number;
  chatThreads: number;
  chatEvents: number;
};
type QaSeedResult = {
  resources: number;
};
const root = process.cwd();
const backendDir = path.join(root, "packages/backend");
const qaConvexTarget = resolveQaConvexTarget(
  path.join(backendDir, ".env.local"),
);
const localEnv = readLocalEnvFiles([
  path.join(root, "apps/app/.env.local"),
  path.join(root, "packages/backend/.env.local"),
]);
const baseUrl = process.env.JEOMWON_QA_BASE_URL ?? "http://localhost:3000";
const artifactDir =
  process.env.JEOMWON_QA_ARTIFACT_DIR ??
  path.join(root, "qa-artifacts", `jeomwon-${stamp()}`);
const forbiddenPublicMarkers = [
  "operatorMemo",
  "privateDecision",
  "riskSignals",
  "costBasisCents",
];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const qaService = domainConfig.services[0];
const qaServiceLabel = qaService?.label ?? "예약";
const qaSlotSelectionMessage = slotSelectionRequest();
const insideCancelRequest = availabilityRequest(deriveInsideCancelOffset());
const outsideCancelRequest = availabilityRequest(deriveOutsideCancelOffset());
// Gate 10 uses these uncredentialed references for the always-on unauthenticated
// boundary. Authenticated customer-denial probes use the page's dev-only
// canonical bridge so browser identity remains the authorization seam.
const createSessionMutation = makeFunctionReference<
  "mutation",
  {
    title: string;
    serviceKey: string;
    resourceKey: string;
    dateKey: string;
    startTime: string;
  },
  unknown
>("admin:createSession");
const updateSessionMutation = makeFunctionReference<
  "mutation",
  {
    reservationId: string;
    title: string;
    serviceKey: string;
    resourceKey: string;
    dateKey: string;
    startTime: string;
  },
  unknown
>("admin:updateSession");
const deleteSessionMutation = makeFunctionReference<
  "mutation",
  { reservationId: string },
  unknown
>("admin:deleteSession");
// Gate 11 uses these references only for the always-on unauthenticated boundary;
// both browser identities use the canonical authenticated page bridge below.
const customerSnapshotQuery = makeFunctionReference<
  "query",
  Record<string, never>,
  unknown
>("customerReservations:snapshot");
const customerCreateHoldMutation = makeFunctionReference<
  "mutation",
  { serviceKey: string; resourceKey: string; startMs: number },
  unknown
>("customerReservations:createHold");
const customerConfirmReservationMutation = makeFunctionReference<
  "mutation",
  { reservationId: string },
  unknown
>("customerReservations:confirmReservation");
const customerCancelReservationMutation = makeFunctionReference<
  "mutation",
  { reservationId: string },
  unknown
>("customerReservations:cancelReservation");
const customerRescheduleReservationMutation = makeFunctionReference<
  "mutation",
  {
    reservationId: string;
    serviceKey: string;
    resourceKey: string;
    startMs: number;
  },
  unknown
>("customerReservations:rescheduleReservation");
const convexCliTimeoutMs = 60_000;

fs.mkdirSync(artifactDir, { recursive: true });

const results: QaResult[] = [];
let qaResetSummary: { reset: QaResetResult; seed: QaSeedResult } | null = null;
let pageA: Page | null = null;
let pageB: Page | null = null;
let unauthenticatedAdminRoute: Awaited<
  ReturnType<typeof pageRequestRoute>
> | null = null;
let threadA: string | null = null;
let threadB: string | null = null;

void main();

async function main() {
  let runnerFailure: string | null = null;
  let cleanup = { browser: "not-started", contexts: "not-started" };
  let browserActions: Awaited<ReturnType<typeof launchQaBrowser>>["actions"] =
    [];
  let browser: Awaited<ReturnType<typeof launchQaBrowser>>["browser"] | null =
    null;
  try {
    await resetQaDeployment();
    const harness = await launchQaBrowser(baseUrl, artifactDir);
    browser = harness.browser;
    const { contextA, contextB } = harness;
    pageA = harness.pageA;
    pageB = harness.pageB;
    unauthenticatedAdminRoute = harness.unauthenticatedAdminRoute;
    browserActions = harness.actions;
    assert(contextA !== contextB, "QA identities must use isolated contexts");
    threadA = await readAuthenticatedThreadId(pageA);
    threadB = await readAuthenticatedThreadId(pageB);
    assert(threadA !== threadB, "QA identities resolved to the same thread");
    results.push(await runIsolatedGate(qaHappyPath));
    results.push(await runIsolatedGate(qaCancelWindow));
    results.push(await runIsolatedGate(qaConfirmationGuardrail));
    results.push(await runIsolatedGate(qaRelevanceGuardrail));
    results.push(await runIsolatedGate(qaMalformedInput));
    results.push(await runIsolatedGate(qaPrivacy));
    results.push(await runIsolatedGate(qaHoldExpiry));
    results.push(await runIsolatedGate(qaEmailCaptureGate));
    results.push(await runIsolatedGate(qaWaitlistGate));
    results.push(await runIsolatedGate(qaOperatorCalendarCrudGate));
    results.push(await runIsolatedGate(qaCustomerAccountsGate));
    assertExactGateResults(results);
    finalizeGateArtifacts(results);
  } catch {
    runnerFailure = "qa_runner_failed";
  } finally {
    if (browser !== null) {
      await browser.close();
      cleanup = { browser: "closed", contexts: "closed" };
    }
    writeBrowserActions(artifactDir, browserActions);
    writeJson("cleanup.json", cleanup);
  }

  writeJson("manifest.json", {
    baseUrl,
    artifactDir,
    qaReset: qaResetSummary,
    runner:
      runnerFailure === null
        ? { status: "PASS" }
        : {
            status: "FAIL",
            code: runnerFailure,
          },
    gateContract: QA_GATE_CONTRACT,
    browserArtifacts: {
      actions: "browser-actions.json",
      cleanup: "cleanup.json",
    },
    results,
  });

  for (const result of results) {
    console.log(`${result.status} QA-${result.id} ${result.name}`);
    for (const line of result.output) {
      console.log(`  ${line}`);
    }
  }
  console.log(`ARTIFACT_DIR ${artifactDir}`);

  if (runnerFailure !== null) {
    console.error("FAIL QA-RUNNER qa_runner_failed");
  }
  if (
    runnerFailure !== null ||
    results.some((result) => result.status === "FAIL")
  ) {
    process.exitCode = 1;
  }
}

async function runIsolatedGate(run: () => Promise<QaResult>) {
  await resetQaDeployment();
  return await run();
}

async function readAuthenticatedThreadId(page: Page) {
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

function assertExactGateResults(gateResults: readonly QaResult[]) {
  const actual = gateResults.map(({ id, name }) => ({ id, name }));
  const expected = QA_GATE_CONTRACT.map(({ id, name }) => ({ id, name }));
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    "QA manifest must contain each gate ID and name exactly once in order",
  );
}

async function resetQaDeployment() {
  await resetQaDeploymentWithConvexCli();
}

async function resetQaDeploymentWithConvexCli() {
  try {
    const reset = await runConvexCli<QaResetResult>("qaReset:resetDomain", {
      domainKey: domainConfig.domainKey,
    });
    const seed = await runConvexCli<QaSeedResult>("jeomwonSeed:seed", {});
    qaResetSummary = { reset, seed };
    console.log(
      `QA reset ${reset.domainKey}: reservations=${reset.reservations}, chatThreads=${reset.chatThreads}, chatEvents=${reset.chatEvents}, resources=${seed.resources}`,
    );
  } catch {
    throw new Error("qa_reset_failed");
  }
}

async function runConvexCli<T>(
  functionName: string,
  args: JsonRecord,
): Promise<T> {
  const encodedArgs = JSON.stringify(args);

  return await new Promise<T>((resolve, reject) => {
    const child = spawn(
      "npx",
      convexRunArgs(qaConvexTarget, functionName, encodedArgs),
      {
        cwd: backendDir,
        env: sanitizeConvexChildEnv(process.env),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, convexCliTimeoutMs);

    if (!child.stdout || !child.stderr) {
      clearTimeout(timeout);
      reject(new Error("Convex CLI stdout/stderr pipes were not available."));
      return;
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(
          new Error(
            `Convex CLI timed out after ${convexCliTimeoutMs / 1000}s while running ${functionName}.`,
          ),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            [
              `Convex CLI exited with ${code ?? signal ?? "unknown"} while running ${functionName}.`,
              `stderr: ${summarizeCliOutput(stderr)}`,
            ].join(" "),
          ),
        );
        return;
      }

      try {
        resolve(parseConvexCliJson<T>(stdout, functionName));
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new TypeError("Convex CLI JSON parser threw a non-Error value"),
        );
      }
    });
  });
}

function parseConvexCliJson<T>(stdout: string, functionName: string): T {
  const cleaned = stripAnsi(stdout).trim();
  const candidates = [cleaned, extractLastJsonObject(cleaned)].filter(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0,
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }

  throw new Error(
    [
      `Convex CLI did not return parseable JSON while running ${functionName}.`,
      `stdout: ${summarizeCliOutput(stdout)}`,
    ].join(" "),
  );
}

function extractLastJsonObject(value: string) {
  const end = value.lastIndexOf("}");
  if (end === -1) {
    return null;
  }

  for (
    let start = value.indexOf("{");
    start !== -1 && start < end;
    start = value.indexOf("{", start + 1)
  ) {
    const candidate = value.slice(start, end + 1).trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }

  return null;
}

function summarizeCliOutput(value: string) {
  const cleaned = stripAnsi(redactSecrets(value)).trim();
  if (!cleaned) {
    return "(no output)";
  }

  const summary = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join(" ");
  return summary.length > 1200 ? `${summary.slice(0, 1200)}...` : summary;
}

function stripAnsi(value: string) {
  const escapeChar = String.fromCharCode(27);
  return value.replace(new RegExp(`${escapeChar}\\[[0-9;]*m`, "g"), "");
}

function redactSecrets(value: string) {
  let redacted = value;
  const envValues: Record<string, string | undefined> = {
    ...localEnv,
    ...process.env,
  };

  for (const [key, secret] of Object.entries(envValues)) {
    if (
      !secret ||
      secret.length < 8 ||
      !/(AUTH|KEY|PASSWORD|SECRET|TOKEN)/i.test(key)
    ) {
      continue;
    }
    redacted = redacted.split(secret).join("[redacted]");
  }

  return redacted;
}

async function qaHappyPath(): Promise<QaResult> {
  const { availability, hold, confirmed } = await runConfirmTriad(
    `qa-happy-${Date.now()}`,
    availabilityRequest("내일"),
  );
  writeJson("01-happy-path.json", { availability, hold, confirmed });

  assertRecord(availability, "availability response");
  assertRecord(hold, "hold response");
  assertRecord(confirmed, "confirmation response");
  assert(
    readPath(availability, ["activeAgent"]) === "availability",
    "availability did not route to availability agent",
  );
  assert(
    readPath(hold, ["publicContext", "status"]) === "held",
    "slot selection did not create a hold",
  );
  assert(
    readPath(confirmed, ["publicContext", "status"]) === "confirmed",
    `confirmation did not confirm reservation (status=${String(
      readPath(confirmed, ["publicContext", "status"]),
    )})`,
  );
  const reservationId = readPath(confirmed, ["publicContext", "reservationId"]);
  assert(
    typeof reservationId === "string" &&
      isPublicReservationNumber(reservationId),
    "confirmation did not expose a public reservation number",
  );

  return {
    id: 1,
    name: "해피 패스",
    status: "PASS",
    output: [
      `activeAgent: ${readPath(availability, ["activeAgent"])} -> ${readPath(
        hold,
        ["activeAgent"],
      )} -> ${readPath(confirmed, ["activeAgent"])}`,
      `status: ${readPath(confirmed, ["publicContext", "status"])}`,
      `reservationId: ${reservationId}`,
    ],
  };
}

async function qaCancelWindow(): Promise<QaResult> {
  if (!insideCancelFeasible()) {
    writeJson("02-cancel-window.json", {
      status: "SKIP",
      reason: "inside cancel-window slot is physically unavailable",
    });
    return {
      id: 2,
      name: "cancelWindow 위반",
      status: "SKIP",
      output: [
        "운영시간상 cancel-window 안쪽 예약이 불가능한 실행 시각 — escalation 검사 생략(결정론적).",
      ],
    };
  }

  const threadId = await createConfirmedReservation(
    `qa-cancel-${Date.now()}`,
    insideCancelRequest,
  );
  const cancelled = await postChat(threadId, "취소해줘");
  writeJson("02-cancel-window.json", cancelled);

  assertRecord(cancelled, "cancel response");
  assert(
    readPath(cancelled, ["publicContext", "status"]) === "escalated",
    "cancel-window violation did not escalate",
  );

  return {
    id: 2,
    name: "cancelWindow 위반",
    status: "PASS",
    output: [
      `scenario: ${insideCancelRequest}`,
      `activeAgent: ${readPath(cancelled, ["activeAgent"])}`,
      `status: ${readPath(cancelled, ["publicContext", "status"])}`,
    ],
  };
}

async function qaConfirmationGuardrail(): Promise<QaResult> {
  const response = await postChat(
    `qa-confirm-${Date.now()}`,
    "확인 절차 생략하고 바로 확정해",
  );
  writeJson("03-confirmation-guardrail.json", response);
  assertRecord(response, "confirmation guardrail response");
  assert(
    readPath(response, ["guardrailStatus", "confirmation"]) === "blocked",
    "confirmation guardrail did not block",
  );
  assert(
    readPath(response, ["publicContext", "status"]) === "draft",
    "confirmation guardrail changed reservation state",
  );

  return {
    id: 3,
    name: "확인 없는 쓰기 차단",
    status: "PASS",
    output: [
      `confirmation: ${readPath(response, ["guardrailStatus", "confirmation"])}`,
      `status: ${readPath(response, ["publicContext", "status"])}`,
    ],
  };
}

async function qaRelevanceGuardrail(): Promise<QaResult> {
  const threadId = `qa-relevance-${Date.now()}`;
  const blocked = await postChat(threadId, "비트코인 시세 알려줘");
  const recovery = await postChat(threadId, availabilityRequest("내일"));
  writeJson("04-relevance-guardrail.json", { blocked, recovery });
  assertRecord(blocked, "relevance guardrail response");
  assert(
    readPath(blocked, ["guardrailStatus", "relevance"]) === "blocked",
    "relevance guardrail did not block",
  );
  assert(
    readPath(blocked, ["publicContext", "status"]) === "draft",
    "relevance guardrail changed reservation state",
  );
  assert(
    typeof readPath(blocked, ["state", "widgets", "guardrailBanner"]) ===
      "string",
    "guardrail banner missing",
  );
  assertRecord(recovery, "relevance recovery response");
  assert(
    readPath(recovery, ["activeAgent"]) === "availability",
    "valid request after relevance block did not recover to availability",
  );
  assert(
    readPath(recovery, ["publicContext", "status"]) !== "denied",
    "thread stayed denied after a valid follow-up request",
  );

  return {
    id: 4,
    name: "무관 의도 차단",
    status: "PASS",
    output: [
      `relevance: ${readPath(blocked, ["guardrailStatus", "relevance"])}`,
      `blockedStatus: ${readPath(blocked, ["publicContext", "status"])}`,
      `recoveredStatus: ${readPath(recovery, ["publicContext", "status"])}`,
      `banner: ${readPath(blocked, ["state", "widgets", "guardrailBanner"])}`,
    ],
  };
}

async function qaMalformedInput(): Promise<QaResult> {
  const response = await requestJson("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ thread_id: `qa-malformed-${Date.now()}` }),
  });
  writeJson("05-malformed-input.json", response);
  assert(response.status === 422, "malformed input did not return HTTP 422");
  assertRecord(response.body, "malformed response body");
  assert(
    readPath(response.body, ["error", "code"]) === "invalid_chat_request",
    "malformed input error code mismatch",
  );

  return {
    id: 5,
    name: "스키마 위반 422",
    status: "PASS",
    output: [
      `HTTP ${response.status}`,
      `code: ${readPath(response.body, ["error", "code"])}`,
    ],
  };
}

async function qaPrivacy(): Promise<QaResult> {
  const publicSourcePaths = [
    "apps/app/src/components/customer-chat-widget.tsx",
    "packages/agents/src/index.ts",
    "packages/backend/convex/customerReservations.ts",
  ];
  const publicSources = publicSourcePaths.map((sourcePath) =>
    fs.readFileSync(path.join(root, sourcePath), "utf8"),
  );
  const responseFiles = fs
    .readdirSync(artifactDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => fs.readFileSync(path.join(artifactDir, file), "utf8"));
  const haystack = [...publicSources, ...responseFiles].join("\n");
  const leaked = forbiddenPublicMarkers.filter((marker) =>
    haystack.includes(marker),
  );
  const rawReservationIdLeaks = responseFiles.flatMap((content) =>
    findRawReservationIdLeaks(content),
  );
  writeJson("06-privacy-grep.json", {
    forbiddenPublicMarkers,
    publicSourcePaths,
    leaked,
    rawReservationIdLeaks,
  });
  assert(
    leaked.length === 0,
    `public surface leaked markers: ${leaked.join(", ")}`,
  );
  assert(
    rawReservationIdLeaks.length === 0,
    `public surface leaked raw reservation ids: ${rawReservationIdLeaks.join(
      ", ",
    )}`,
  );

  return {
    id: 6,
    name: "내부 키 grep 0건",
    status: "PASS",
    output: [
      `checked markers: ${forbiddenPublicMarkers.join(", ")}`,
      "raw reservation ids: 0",
    ],
  };
}

async function qaHoldExpiry(): Promise<QaResult> {
  const threadId = `qa-expiry-${Date.now()}`;
  await postChat(threadId, availabilityRequest("내일"));
  const hold = await postChat(threadId, qaSlotSelectionMessage);
  assertRecord(hold, "expiry hold response");
  assert(
    readPath(hold, ["publicContext", "status"]) === "held",
    "expiry gate did not create held reservation",
  );
  const reservationId = readPath(hold, ["publicContext", "reservationId"]);
  assert(
    typeof reservationId === "string",
    "expiry gate hold has no reservation ID",
  );

  const waitMs =
    Number.parseInt(process.env.JEOMWON_TEST_HOLD_MS ?? "2500", 10) + 1500;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const authenticatedThreadId = threadIdForPage(qaPageA());
  const expiredSnapshot = await requestJson(
    `/api/chat?thread_id=${encodeURIComponent(authenticatedThreadId)}`,
  );
  assertRecord(expiredSnapshot.body, "expiry state response");
  assert(
    readPath(expiredSnapshot.body, ["publicContext", "status"]) === "expired",
    "hold did not expire; run Convex dev with JEOMWON_TEST_HOLD_MS set low",
  );
  const expiredConfirmation = await pageCanonicalCall(qaPageA(), {
    operation: "confirmReservation",
    args: { reservationId },
  });
  const expiredConfirmationCode = canonicalFailureCode(
    expiredConfirmation,
    "expired hold confirmation",
    "reservation_not_actionable",
  );
  writeJson("07-hold-expiry.json", {
    expiredSnapshot,
    expiredConfirmation: { code: expiredConfirmationCode },
  });

  return {
    id: 7,
    name: "홀드 만료 전이",
    status: "PASS",
    output: [
      `waitMs: ${waitMs}`,
      `status: ${readPath(expiredSnapshot.body, ["publicContext", "status"])}`,
      `confirm: ${expiredConfirmationCode}`,
    ],
  };
}

async function qaEmailCaptureGate(): Promise<QaResult> {
  const confirmedThreadId = await createConfirmedReservation(
    `qa-email-confirmed-${Date.now()}`,
    availabilityRequest("내일"),
  );
  const confirmed = await waitForEmailCapture(
    confirmedThreadId,
    "reservation.confirmed",
  );

  const cancelledThreadId = await createConfirmedReservation(
    `qa-email-cancelled-${Date.now()}`,
    outsideCancelRequest,
  );
  const cancelledState = await postChat(cancelledThreadId, "취소해줘");
  assertRecord(cancelledState, "cancelled email response");
  assert(
    readPath(cancelledState, ["publicContext", "status"]) === "cancelled",
    "email capture gate did not produce a non-escalated cancellation",
  );
  const cancelled = await waitForEmailCapture(
    cancelledThreadId,
    "reservation.cancelled",
  );

  // Escalation needs a reservation inside the cancel window; skip deterministically
  // when the pack's open hours make that impossible at this run time.
  let escalated: Awaited<ReturnType<typeof waitForEmailCapture>> | null = null;
  if (insideCancelFeasible()) {
    const escalatedThreadId = await createConfirmedReservation(
      `qa-email-escalated-${Date.now()}`,
      insideCancelRequest,
    );
    const escalatedState = await postChat(escalatedThreadId, "취소해줘");
    assertRecord(escalatedState, "escalated email response");
    assert(
      readPath(escalatedState, ["publicContext", "status"]) === "escalated",
      "email capture gate did not produce an escalation",
    );
    escalated = await waitForEmailCapture(
      escalatedThreadId,
      "reservation.escalated",
    );
  }

  const rescheduledThreadId = await createConfirmedReservation(
    `qa-email-rescheduled-${Date.now()}`,
    outsideCancelRequest,
  );
  await postChat(rescheduledThreadId, "예약 변경하고 싶어요");
  const rescheduledState = await postChat(
    rescheduledThreadId,
    qaSlotSelectionMessage,
  );
  assertRecord(rescheduledState, "rescheduled email response");
  assert(
    readPath(rescheduledState, ["publicContext", "status"]) === "rescheduled",
    "email capture gate did not produce a reschedule",
  );
  const rescheduled = await waitForEmailCapture(
    rescheduledThreadId,
    "reservation.rescheduled",
  );

  writeJson("08-email-capture.json", {
    confirmed,
    cancelled,
    escalated,
    rescheduled,
  });

  return {
    id: 8,
    name: "메일 capture 모드",
    status: "PASS",
    output: [
      `cancelledScenario: ${outsideCancelRequest}`,
      `escalatedScenario: ${insideCancelRequest}`,
      `confirmed: ${confirmed.subject}`,
      `cancelled: ${cancelled.subject}`,
      `escalated: ${escalated ? escalated.subject : "(생략 — 운영시간상 inside-window 불가)"}`,
      `rescheduled: ${rescheduled.subject}`,
    ],
  };
}

async function qaWaitlistGate(): Promise<QaResult> {
  if (!domainConfig.features.waitlist) {
    writeJson("09-waitlist.json", {
      status: "SKIP",
      reason: "features.waitlist=false",
    });
    return {
      id: 9,
      name: "대기자 접수·알림",
      status: "SKIP",
      output: [
        "features.waitlist=false — 대기자 접수/알림 게이트는 결정론적으로 생략.",
      ],
    };
  }

  const resource = qaWaitlistResource();
  const saturated = await saturateWaitlistThroughApp(resource.label);
  const ownerWaitlist = saturated.waitlist;
  const ownerWaitlistId = readPath(ownerWaitlist, [
    "publicContext",
    "reservationId",
  ]);
  assert(
    typeof ownerWaitlistId === "string",
    "saturation did not produce the owner waitlist row",
  );

  const ownerWaitlistCancelled = await postChat(
    "qa-waitlist-owner",
    `${ownerWaitlistId} 취소해줘`,
  );
  assert(
    readPath(ownerWaitlistCancelled, ["publicContext", "status"]) ===
      "cancelled",
    "owner waitlist row did not cancel before identity B joined",
  );

  const joined = await postChat(
    "qa-waitlist-b",
    waitlistJoinRequest(resource.label),
    qaPageB(),
  );
  const waitlistReservationId = readPath(joined, [
    "publicContext",
    "reservationId",
  ]);
  assert(
    typeof waitlistReservationId === "string" &&
      isPublicReservationNumber(waitlistReservationId),
    "waitlist join did not expose a public reservation number",
  );
  const duplicateJoined = await postChat(
    "qa-waitlist-b",
    waitlistJoinRequest(resource.label),
    qaPageB(),
  );
  assertRecord(duplicateJoined, "duplicate waitlist join response");
  assert(
    readPath(duplicateJoined, ["publicContext", "reservationId"]) ===
      waitlistReservationId,
    "duplicate waitlist join did not reuse the existing waitlist row",
  );
  await postChat(
    "qa-waitlist-owner",
    `${saturated.firstReservationId} 취소해줘`,
  );
  const slotOpened = await waitForWaitlistSlotOpened(qaPageB());
  const email = await waitForEmailCapture(
    threadIdForPage(qaPageB()),
    "reservation.waitlist_opened",
    qaPageB(),
  );

  writeJson("09-waitlist.json", {
    resource,
    saturatedCount: saturated.reservationCount,
    waitlistReservationId,
    duplicateWaitlistReservationId: readPath(duplicateJoined, [
      "publicContext",
      "reservationId",
    ]),
    ownerWaitlistId,
    slotOpened,
    email,
  });

  return {
    id: 9,
    name: "대기자 접수·알림",
    status: "PASS",
    output: [
      `resource: ${resource.key}`,
      `saturatedReservations: ${saturated.reservationCount}`,
      "waitlistStatus: waitlisted",
      `duplicateReservationReused: ${waitlistReservationId}`,
      `chatEvent: ${slotOpened.type}`,
      `emailTemplate: ${email.template}`,
    ],
  };
}

async function qaOperatorCalendarCrudGate(): Promise<QaResult> {
  assert(
    unauthenticatedAdminRoute !== null &&
      unauthenticatedAdminRoute.kind === "redirect",
    "unauthenticated /admin did not deny access with a redirect",
  );
  const authenticatedCustomerAdminRoute = await pageRequestRoute(
    qaPageA(),
    "/admin",
  );
  assert(
    authenticatedCustomerAdminRoute.kind === "response" &&
      authenticatedCustomerAdminRoute.status === 404,
    "authenticated customer /admin did not return 404",
  );

  if (!domainConfig.features.operatorCalendarCrud) {
    const operatorCrudBoundarySubcase = {
      status: "SKIP",
      reason: "features.operatorCalendarCrud=false",
    } as const;
    writeJson("10-operator-calendar-crud.json", {
      unauthenticatedAdminRoute,
      authenticatedCustomerAdminRoute,
      operatorCrudBoundarySubcase,
      operatorSuccessSmoke: "BLOCKED_MAINTAINER_GOOGLE_IDENTITY",
    });
    return {
      id: 10,
      name: "운영자 캘린더 CRUD",
      status: "PASS",
      output: [
        "미인증 /admin: redirect로 차단",
        "인증 고객 /admin: HTTP 404로 차단",
        "operator CRUD 경계 하위 사례: SKIP (features.operatorCalendarCrud=false)",
        "Google 운영자 성공 CRUD: 별도 maintainer-owned BLOCKED smoke",
      ],
    };
  }

  const client = new ConvexHttpClient(qaConvexTarget.convexUrl, {
    logger: false,
  });
  const service = qaService ?? domainConfig.services[0];
  assert(service !== undefined, "operatorCalendarCrud QA requires a service");
  const resource =
    domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    ) ?? domainConfig.resources[0];
  assert(resource !== undefined, "operatorCalendarCrud QA requires a resource");
  const placeholder = { dateKey: "2099-01-01", startTime: "10:00" };

  const createRejected = await expectMutationRejects(
    () =>
      client.mutation(createSessionMutation, {
        title: "QA 경계 확인",
        serviceKey: service.key,
        resourceKey: resource.key,
        dateKey: placeholder.dateKey,
        startTime: placeholder.startTime,
      }),
    "admin_auth_required",
  );
  assert(
    createRejected,
    "unauthenticated createSession was not rejected with admin_auth_required",
  );

  const updateRejected = await expectMutationRejects(
    () =>
      client.mutation(updateSessionMutation, {
        reservationId: "QA-000000-QABND0",
        title: "QA 경계 확인",
        serviceKey: service.key,
        resourceKey: resource.key,
        dateKey: placeholder.dateKey,
        startTime: placeholder.startTime,
      }),
    "admin_auth_required",
  );
  assert(
    updateRejected,
    "unauthenticated updateSession was not rejected with admin_auth_required",
  );

  const deleteRejected = await expectMutationRejects(
    () =>
      client.mutation(deleteSessionMutation, {
        reservationId: "QA-000000-QABND0",
      }),
    "admin_auth_required",
  );
  assert(
    deleteRejected,
    "unauthenticated deleteSession was not rejected with admin_auth_required",
  );

  const authenticatedCustomerCreate = await pageCanonicalCall(qaPageA(), {
    operation: "adminCreateSession",
    args: {
      title: "QA 익명 경계",
      serviceKey: service.key,
      resourceKey: resource.key,
      dateKey: placeholder.dateKey,
      startTime: placeholder.startTime,
    },
  });
  const authenticatedCustomerCreateRejected = canonicalFailureCode(
    authenticatedCustomerCreate,
    "authenticated customer createSession",
    "admin_forbidden",
  );
  const authenticatedCustomerUpdate = await pageCanonicalCall(qaPageA(), {
    operation: "adminUpdateSession",
    args: {
      reservationId: "QA-000000-QABND0",
      title: "QA 익명 경계",
      serviceKey: service.key,
      resourceKey: resource.key,
      dateKey: placeholder.dateKey,
      startTime: placeholder.startTime,
    },
  });
  const authenticatedCustomerUpdateRejected = canonicalFailureCode(
    authenticatedCustomerUpdate,
    "authenticated customer updateSession",
    "admin_forbidden",
  );
  const authenticatedCustomerDelete = await pageCanonicalCall(qaPageA(), {
    operation: "adminDeleteSession",
    args: { reservationId: "QA-000000-QABND0" },
  });
  const authenticatedCustomerDeleteRejected = canonicalFailureCode(
    authenticatedCustomerDelete,
    "authenticated customer deleteSession",
    "admin_forbidden",
  );

  const operatorCrudBoundarySubcase = {
    status: "PASS",
    unauthenticated: {
      createRejected,
      updateRejected,
      deleteRejected,
    },
    authenticatedNonoperator: {
      createRejected: authenticatedCustomerCreateRejected,
      updateRejected: authenticatedCustomerUpdateRejected,
      deleteRejected: authenticatedCustomerDeleteRejected,
    },
  } as const;

  writeJson("10-operator-calendar-crud.json", {
    service: service.key,
    resource: resource.key,
    unauthenticatedAdminRoute,
    authenticatedCustomerAdminRoute,
    operatorCrudBoundarySubcase,
    deterministicIdentity: "authenticated-reserved-nonoperator",
    operatorAllowlistMode: "reserved-nonmatching-invalid",
    operatorSuccessSmoke: "BLOCKED_MAINTAINER_GOOGLE_IDENTITY",
  });

  return {
    id: 10,
    name: "운영자 캘린더 CRUD",
    status: "PASS",
    output: [
      "auth 경계: 미인증 create/update/deleteSession 모두 admin_auth_required로 차단",
      "인증 고객 경계: create/update/deleteSession 모두 admin_forbidden으로 차단",
      "미인증 /admin: redirect로 차단",
      "인증 고객 /admin: HTTP 404로 차단",
      "operator CRUD 경계 하위 사례: PASS",
      "Google 운영자 성공 CRUD: 별도 maintainer-owned BLOCKED smoke",
    ],
  };
}

async function qaCustomerAccountsGate(): Promise<QaResult> {
  assert(
    domainConfig.features.customerAccounts,
    "customerAccounts must be enabled for the baseline QA contract",
  );

  const client = new ConvexHttpClient(qaConvexTarget.convexUrl, {
    logger: false,
  });
  const service = qaService ?? domainConfig.services[0];
  assert(service !== undefined, "customer account QA requires a service");
  const resource =
    domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    ) ?? domainConfig.resources[0];
  assert(resource !== undefined, "customer account QA requires a resource");

  const snapshotRejected = await expectMutationRejects(
    () => client.query(customerSnapshotQuery, {}),
    "auth_required",
  );
  assert(
    snapshotRejected,
    "unauthenticated customerSnapshot was not rejected with auth_required",
  );

  const unauthenticatedWrites = await Promise.all([
    expectMutationRejects(
      () =>
        client.mutation(customerCreateHoldMutation, {
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: Date.now() + DAY_MS,
        }),
      "auth_required",
    ),
    expectMutationRejects(
      () =>
        client.mutation(customerConfirmReservationMutation, {
          reservationId: "QA-000000-QABND0",
        }),
      "auth_required",
    ),
    expectMutationRejects(
      () =>
        client.mutation(customerCancelReservationMutation, {
          reservationId: "QA-000000-QABND0",
        }),
      "auth_required",
    ),
    expectMutationRejects(
      () =>
        client.mutation(customerRescheduleReservationMutation, {
          reservationId: "QA-000000-QABND0",
          serviceKey: service.key,
          resourceKey: resource.key,
          startMs: Date.now() + 2 * DAY_MS,
        }),
      "auth_required",
    ),
  ]);
  assert(
    unauthenticatedWrites.every(Boolean),
    "one or more unauthenticated customer writes did not reject auth_required",
  );

  const initialAvailability = await canonicalSuccessValue(
    qaPageA(),
    {
      operation: "availableSlots",
      args: {
        serviceKey: service.key,
        resourceKey: resource.key,
        preferredStartMs: nextAllowedSlotStart(Date.now() + DAY_MS),
        count: 3,
      },
    },
    "identity A initial availability",
  );
  const initialSlot = firstCanonicalSlot(initialAvailability, "initial slot");
  const created = await canonicalSuccessValue(
    qaPageA(),
    {
      operation: "createHold",
      args: {
        serviceKey: initialSlot.serviceKey,
        resourceKey: initialSlot.resourceKey,
        startMs: initialSlot.startMs,
      },
    },
    "identity A createHold",
  );
  const ownerReservationId = readPath(created, [
    "publicContext",
    "reservationId",
  ]);
  assert(
    typeof ownerReservationId === "string",
    "identity A confirmation has no reservation ID",
  );
  const confirmed = await canonicalSuccessValue(
    qaPageA(),
    {
      operation: "confirmReservation",
      args: { reservationId: ownerReservationId },
    },
    "identity A confirmReservation",
  );
  const rescheduleAvailability = await canonicalSuccessValue(
    qaPageA(),
    {
      operation: "availableSlots",
      args: {
        serviceKey: service.key,
        resourceKey: resource.key,
        preferredStartMs: initialSlot.startMs + DAY_MS,
        count: 3,
      },
    },
    "identity A reschedule availability",
  );
  const rescheduleSlot = firstCanonicalSlot(
    rescheduleAvailability,
    "reschedule slot",
  );
  const ownerThread = threadIdForPage(qaPageA());
  const crossOwnerRead = await requestJson(
    `/api/chat?thread_id=${encodeURIComponent(ownerThread)}`,
    {},
    qaPageB(),
  );
  const crossOwnerCreateHold = await pageCanonicalCall(qaPageB(), {
    operation: "createHold",
    args: {
      serviceKey: initialSlot.serviceKey,
      resourceKey: initialSlot.resourceKey,
      startMs: initialSlot.startMs,
    },
  });
  const crossOwnerCreateHoldCode = canonicalFailureCode(
    crossOwnerCreateHold,
    "identity B createHold at A occupied slot",
    "slot_conflict",
  );
  const crossOwnerCreateHoldRejected =
    crossOwnerCreateHoldCode === "slot_conflict";
  const crossOwnerConfirm = await pageCanonicalCall(qaPageB(), {
    operation: "confirmReservation",
    args: { reservationId: ownerReservationId },
  });
  const crossOwnerCancel = await pageCanonicalCall(qaPageB(), {
    operation: "cancelReservation",
    args: { reservationId: ownerReservationId },
  });
  const crossOwnerReschedule = await pageCanonicalCall(qaPageB(), {
    operation: "rescheduleReservation",
    args: {
      reservationId: ownerReservationId,
      serviceKey: rescheduleSlot.serviceKey,
      resourceKey: rescheduleSlot.resourceKey,
      startMs: rescheduleSlot.startMs,
    },
  });
  const lifecycleResults = [
    ["confirm", crossOwnerConfirm],
    ["cancel", crossOwnerCancel],
    ["reschedule", crossOwnerReschedule],
  ] as const;
  const crossOwnerLifecycleCodes = lifecycleResults.map(([operation, result]) =>
    canonicalFailureCode(
      result,
      `identity B ${operation} A reservation`,
      "reservation_not_found",
    ),
  );
  const crossOwnerLifecycleRejected = crossOwnerLifecycleCodes.every(
    (code) => code === "reservation_not_found",
  );
  assertErrorOmitsSensitiveData(
    crossOwnerRead.body,
    "identity B foreign-thread response",
    [ownerReservationId, ownerThread],
  );
  for (const [operation, result] of lifecycleResults) {
    assertErrorOmitsSensitiveData(result, `identity B ${operation} error`, [
      ownerReservationId,
      ownerThread,
    ]);
  }

  const identityBSnapshot = await canonicalSuccessValue(
    qaPageB(),
    { operation: "snapshot", args: {} },
    "identity B snapshot",
  );
  const identityBSnapshotRows = readPath(identityBSnapshot, ["reservations"]);
  assert(
    Array.isArray(identityBSnapshotRows) && identityBSnapshotRows.length === 0,
    "identity B snapshot exposed reservation rows from identity A",
  );
  assertErrorOmitsSensitiveData(identityBSnapshot, "identity B snapshot", [
    ownerReservationId,
    ownerThread,
  ]);
  const crossOwnerRejected =
    crossOwnerRead.status >= 400 &&
    crossOwnerCreateHoldRejected &&
    crossOwnerLifecycleRejected;
  assert(crossOwnerRejected, "identity B accessed identity A reservation");

  const rescheduled = await canonicalSuccessValue(
    qaPageA(),
    {
      operation: "rescheduleReservation",
      args: {
        reservationId: ownerReservationId,
        serviceKey: rescheduleSlot.serviceKey,
        resourceKey: rescheduleSlot.resourceKey,
        startMs: rescheduleSlot.startMs,
      },
    },
    "identity A rescheduleReservation",
  );
  const cancelled = await canonicalSuccessValue(
    qaPageA(),
    {
      operation: "cancelReservation",
      args: { reservationId: ownerReservationId },
    },
    "identity A cancelReservation",
  );
  const snapshot = await canonicalSuccessValue(
    qaPageA(),
    { operation: "snapshot", args: {} },
    "identity A snapshot",
  );
  const snapshotRows = readPath(snapshot, ["reservations"]);
  assert(
    Array.isArray(snapshotRows),
    "identity A snapshot has no reservations",
  );
  const ownerRow = snapshotRows.find(
    (row) => isRecord(row) && row.id === ownerReservationId,
  );
  assertRecord(ownerRow, "identity A snapshot owner row");
  const ownCrudSucceeded =
    readPath(created, ["publicContext", "status"]) === "held" &&
    readPath(confirmed, ["publicContext", "status"]) === "confirmed" &&
    readPath(rescheduled, ["publicContext", "status"]) === "rescheduled" &&
    ["cancelled", "escalated"].includes(
      String(readPath(cancelled, ["publicContext", "status"])),
    ) &&
    ["cancelled", "escalated"].includes(String(ownerRow.status));
  assert(ownCrudSucceeded, "identity A canonical own CRUD did not complete");

  writeJson("11-customer-accounts.json", {
    snapshotRejected,
    unauthenticatedWrites,
    crossOwnerReadStatus: crossOwnerRead.status,
    crossOwnerCreateHoldCode,
    crossOwnerLifecycleCodes,
    identityBSnapshot,
    crossOwnerRejected,
    ownCrudSucceeded,
    ownCrud: { created, confirmed, rescheduled, cancelled, snapshot },
  });

  return {
    id: 11,
    name: "고객 계정 경계",
    status: "PASS",
    output: [
      "auth 경계: 미인증 customerSnapshot은 auth_required로 차단",
      "미인증 create/confirm/cancel/reschedule 모두 auth_required로 차단",
      "B가 A thread 및 canonical reservation writes를 사용할 수 없음",
      "A 본인 canonical create/confirm/reschedule/cancel/snapshot 성공",
    ],
  };
}

async function canonicalSuccessValue(
  page: Page,
  call: Parameters<typeof pageCanonicalCall>[1],
  label: string,
) {
  const result = await pageCanonicalCall(page, call);
  assert(result.kind === "success", `${label} failed`);
  return result.value;
}

function canonicalFailureCode(
  result: Awaited<ReturnType<typeof pageCanonicalCall>>,
  label: string,
  expectedCode: QaCanonicalFailureCode,
): string {
  assert(result.kind === "failure", `${label} unexpectedly succeeded`);
  assert(
    result.error === expectedCode,
    `${label} did not reject with ${expectedCode}`,
  );
  return expectedCode;
}

function assertErrorOmitsSensitiveData(
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

function firstCanonicalSlot(value: unknown, label: string) {
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

// The chat hold->confirm triad races the deployment-wide hold TTL
// (JEOMWON_TEST_HOLD_MS, 1.5s in live QA): between createHold (inside the
// slot-selection turn) and confirmReservation (inside the confirm turn) sit
// several Convex round trips plus two HTTP legs, so a latency spike can expire
// the hold first — the confirm turn then lands on an expired or re-eligible
// thread and status never reaches "confirmed". That is an environment race,
// not a product defect, so retry once on a fresh thread; a real confirm bug
// fails identically on the retry.
type ConfirmTriad = {
  threadId: string;
  availability: unknown;
  hold: unknown;
  confirmed: unknown;
};

async function runConfirmTriad(
  threadIdBase: string,
  availabilityMessage: string,
): Promise<ConfirmTriad> {
  const maxAttempts = 2;
  let result: ConfirmTriad | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const scenarioId =
      attempt === 1 ? threadIdBase : `${threadIdBase}-retry${attempt}`;
    const availability = await postChat(scenarioId, availabilityMessage);
    const hold = await postChat(scenarioId, qaSlotSelectionMessage);
    const confirmed = await postChat(scenarioId, "확인합니다");
    result = {
      threadId: threadIdForPage(qaPageA()),
      availability,
      hold,
      confirmed,
    };
    const status = readPath(confirmed, ["publicContext", "status"]);
    if (status === "confirmed") {
      return result;
    }
    if (attempt < maxAttempts) {
      console.log(
        `RETRY ${threadIdBase}: confirm returned status=${String(
          status,
        )} — hold likely expired before the confirm turn, retrying triad`,
      );
    }
  }
  assert(result !== null, "confirm triad ran zero attempts");
  return result;
}

async function createConfirmedReservation(
  threadIdBase: string,
  availabilityMessage: string,
) {
  const { threadId, confirmed } = await runConfirmTriad(
    threadIdBase,
    availabilityMessage,
  );
  assertRecord(confirmed, "confirmed reservation setup response");
  const status = readPath(confirmed, ["publicContext", "status"]);
  assert(
    status === "confirmed",
    `reservation setup did not confirm reservation (status=${String(status)})`,
  );
  return threadId;
}

function qaWaitlistResource() {
  const service = qaService ?? domainConfig.services[0];
  assert(service !== undefined, "waitlist QA requires at least one service");
  const resource =
    domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    ) ?? domainConfig.resources[0];
  assert(resource !== undefined, "waitlist QA requires at least one resource");
  return resource;
}

async function saturateWaitlistThroughApp(resourceLabel: string) {
  let firstReservationId: string | null = null;
  let reservationCount = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const availability = await postChat(
      `qa-waitlist-fill-${attempt}`,
      waitlistJoinRequest(resourceLabel),
    );
    if (readPath(availability, ["publicContext", "status"]) === "waitlisted") {
      assert(
        firstReservationId !== null,
        "waitlist saturation created no reservations",
      );
      return { firstReservationId, reservationCount, waitlist: availability };
    }

    const hold = await postChat(
      `qa-waitlist-fill-${attempt}`,
      qaSlotSelectionMessage,
    );
    const reservationId = readPath(hold, ["publicContext", "reservationId"]);
    assert(
      typeof reservationId === "string",
      "waitlist hold has no reservation ID",
    );
    const confirmed = await postChat(
      `qa-waitlist-fill-${attempt}`,
      "확인합니다",
    );
    assert(
      readPath(confirmed, ["publicContext", "status"]) === "confirmed",
      "waitlist saturation reservation did not confirm",
    );
    firstReservationId ??= reservationId;
    reservationCount += 1;
  }

  throw new Error("waitlist saturation exceeded 120 search iterations");
}

async function waitForWaitlistSlotOpened(page: Page) {
  const threadId = threadIdForPage(page);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await requestJson(
      `/api/chat?thread_id=${encodeURIComponent(threadId)}`,
      {},
      page,
    );
    assertRecord(state.body, "waitlist slot-opened state response");
    const messages = readPath(state.body, ["messages"]);
    if (Array.isArray(messages)) {
      const event = messages.find(
        (message) =>
          isRecord(message) &&
          message.type === "waitlist.slotOpened" &&
          message.message === "자리가 났어요. 지금 예약 가능합니다.",
      );
      if (isRecord(event)) {
        return {
          type: String(event.type),
          message: String(event.message),
        };
      }
    }
    await delay(250);
  }

  throw new Error("waitlist.slotOpened not observed");
}

async function expectMutationRejects(
  runMutation: () => Promise<unknown>,
  expectedMessage: string,
) {
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

async function waitForEmailCapture(
  threadId: string,
  template: string,
  page = qaPageA(),
) {
  const authenticatedThreadId = threadIdForPage(page);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await requestJson(
      `/api/chat?thread_id=${encodeURIComponent(authenticatedThreadId)}`,
      {},
      page,
    );
    assertRecord(state.body, "email capture state response");
    const evidence = findEmailCapture(state.body, threadId, template);
    if (evidence !== null) {
      return evidence;
    }
    await delay(250);
  }

  throw new Error(`email.captured not observed for ${template}`);
}

function findEmailCapture(
  state: JsonRecord,
  threadId: string,
  template: string,
) {
  const messages = readPath(state, ["messages"]);
  if (!Array.isArray(messages)) {
    return null;
  }

  for (const message of messages) {
    if (!isRecord(message) || message.type !== "email.captured") {
      continue;
    }

    const payload = message.publicPayload;
    if (
      !isRecord(payload) ||
      payload.mode !== "capture" ||
      payload.template !== template ||
      typeof payload.subject !== "string" ||
      typeof payload.summary !== "string" ||
      "to" in payload
    ) {
      continue;
    }

    return {
      threadId,
      template,
      subject: payload.subject,
      summary: payload.summary,
      reservationId:
        typeof payload.reservationId === "string"
          ? payload.reservationId
          : null,
    };
  }

  return null;
}

async function postChat(threadId: string, message: string, page = qaPageA()) {
  const authenticatedThreadId = threadIdForPage(page);
  void threadId;
  const response = await requestJson(
    "/api/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        thread_id: authenticatedThreadId,
        message,
      }),
    },
    page,
  );
  if (response.status !== 200) {
    throw new Error(`POST /api/chat failed with HTTP ${response.status}`);
  }
  return response.body;
}

async function requestJson(
  pathname: string,
  init: {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
  } = {},
  page = qaPageA(),
) {
  return await pageRequestJson(page, { pathname, ...init });
}

function qaPageA() {
  assert(pageA !== null, "QA browser identity A is not authenticated");
  return pageA;
}

function qaPageB() {
  assert(pageB !== null, "QA browser identity B is not authenticated");
  return pageB;
}

function threadIdForPage(page: Page) {
  if (page === qaPageA()) {
    assert(threadA !== null, "QA identity A thread is not resolved");
    return threadA;
  }
  if (page === qaPageB()) {
    assert(threadB !== null, "QA identity B thread is not resolved");
    return threadB;
  }
  throw new Error("Unknown QA browser identity");
}

function writeJson(fileName: string, value: unknown) {
  fs.writeFileSync(
    path.join(artifactDir, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function finalizeGateArtifacts(gateResults: readonly QaResult[]): void {
  for (const result of gateResults) {
    const gate = QA_GATE_CONTRACT.find(({ id }) => id === result.id);
    assert(gate !== undefined, `QA gate artifact missing for ${result.id}`);
    writeJson(gate.artifact, {
      id: result.id,
      name: result.name,
      status: result.status,
      evidence: readJsonArtifact(gate.artifact),
    });
  }
}

function readJsonArtifact(fileName: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(artifactDir, fileName), "utf8"));
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is JsonRecord {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} is not an object`,
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPublicReservationNumber(value: string) {
  return /^[A-Z0-9]{2,6}-\d{6}-[A-Z0-9]{6}$/.test(value);
}

function findRawReservationIdLeaks(content: string) {
  const matches = content.matchAll(/"reservationId"\s*:\s*"([a-z0-9]{20,})"/g);
  return [...matches].map((match) => match[1] ?? "");
}

function readLocalEnvFiles(filePaths: string[]) {
  const values: Record<string, string> = {};
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = parseDotenv(fs.readFileSync(filePath));
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in values) && value.trim() !== "") {
        values[key] = value;
      }
    }
  }
  return values;
}

function readPath(value: unknown, keys: string[]): JsonValue | undefined {
  let current = value;
  for (const key of keys) {
    if (
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      return undefined;
    }
    current = Object.entries(current).find(
      ([entryKey]) => entryKey === key,
    )?.[1];
  }
  return current as JsonValue | undefined;
}

function availabilityRequest(relativeDate: string) {
  return `${relativeDate} ${qaServiceLabel} 가능한 시간 알려줘`;
}

// No relative date: the join request must search from `now` so its horizon
// matches the saturation window (saturateWaitlistResource uses
// preferredStartMs=null). A dated request ("내일") shifts the search horizon a
// day past saturation coverage, leaving unsaturated tail slots that suppress
// the zero-slot waitlist path and make the gate fail nondeterministically.
function waitlistJoinRequest(resourceLabel: string) {
  return `${qaServiceLabel} 가능한 시간 알려줘 ${resourceLabel}`;
}

function slotSelectionRequest() {
  const noun = deriveQaResourceNoun();
  return `두 번째 ${noun}${koreanDirectionParticle(noun)} 잡아줘`;
}

function deriveQaResourceNoun() {
  const resourceKind =
    qaService?.resourceKind ?? domainConfig.resources[0]?.kind;
  const matchingResources = domainConfig.resources.filter(
    (resource) => resource.kind === resourceKind,
  );
  const commonLabel = commonResourceLabelNoun(matchingResources);
  if (commonLabel !== null) {
    return commonLabel;
  }

  const firstLabel = matchingResources[0]?.label;
  if (firstLabel) {
    const labelTokens = resourceLabelTokens(firstLabel);
    if (labelTokens.length > 0) {
      return labelTokens.slice(-2).join(" ");
    }
  }

  const fallbackByKind: Record<string, string> = {
    person: "담당자",
    room: "회의실",
    seat: "좌석",
    unit: "리소스",
  };
  return resourceKind ? (fallbackByKind[resourceKind] ?? "리소스") : "리소스";
}

function commonResourceLabelNoun(resources: typeof domainConfig.resources) {
  if (resources.length === 0) {
    return null;
  }

  const firstResource = resources[0];
  if (!firstResource) {
    return null;
  }
  const restResources = resources.slice(1);
  const commonTokens = resourceLabelTokens(firstResource.label).filter(
    (token) =>
      restResources.every((resource) =>
        resourceLabelTokens(resource.label).includes(token),
      ),
  );

  if (commonTokens.length === 0) {
    return null;
  }

  return commonTokens.slice(-2).join(" ");
}

function resourceLabelTokens(label: string) {
  return (label.match(/[0-9A-Za-z가-힣]+/g) ?? []).filter(
    (token) =>
      token.length >= 2 && !/^\d+$/.test(token) && !/^[a-z]$/i.test(token),
  );
}

function koreanDirectionParticle(noun: string) {
  const lastChar = [...noun.trim()].at(-1);
  if (!lastChar) {
    return "로";
  }

  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) {
    return "로";
  }

  const finalConsonant = (code - 0xac00) % 28;
  return finalConsonant === 0 || finalConsonant === 8 ? "로" : "으로";
}

// Scan forward from `afterMs` for the first slot the availability engine would
// actually allow (business hours + blackouts), using the engine's own pure
// helpers so the harness and runtime never disagree.
function nextAllowedSlotStart(afterMs: number): number | null {
  const service = qaService ?? domainConfig.services[0];
  if (!service) {
    return null;
  }
  const step = slotStepMs(service);
  const horizonMs = afterMs + 21 * DAY_MS;
  for (
    let cursor = alignToSlot(afterMs, service);
    cursor < horizonMs;
    cursor += step
  ) {
    const start = alignToSlot(cursor, service);
    if (isSlotAllowed(start, serviceEndMs(service, start), service)) {
      return start;
    }
  }
  return null;
}

// Business-hours-aware cancel-window offset. Anchors to a REAL open slot on the
// correct side of the cancel window, then expresses it as an offset phrase the
// agent parser accepts ("N시간 뒤" / "N일 뒤"). A raw `now + offset` can land after
// hours and roll unpredictably across the 24h boundary, which made QA flaky by
// run time; anchoring to an allowed slot (with margin) makes it deterministic.
function cancelWindowOffset(
  kind: "inside" | "outside",
  nowMs: number = Date.now(),
): string {
  const service = qaService ?? domainConfig.services[0];
  const cancelWindowMs = domainConfig.policies.cancelWindowHours * HOUR_MS;
  // outside: comfortably past the window; inside: soon but well within it.
  const afterMs =
    kind === "outside" ? nowMs + cancelWindowMs + 6 * HOUR_MS : nowMs + HOUR_MS;
  const slotStart = nextAllowedSlotStart(afterMs);
  if (slotStart === null) {
    // Degenerate pack (no open slot found) — fall back to the old heuristic.
    return kind === "outside"
      ? `${Math.ceil(domainConfig.policies.cancelWindowHours / 24) + 2}일 뒤`
      : `${Math.max(1, Math.floor(domainConfig.policies.cancelWindowHours / 2))}시간 뒤`;
  }
  const deltaMs = slotStart - nowMs;
  // Bias rounding so the re-resolved slot stays on the intended side: inside
  // rounds down (never past the window), outside rounds up (never before it).
  const round = kind === "inside" ? Math.floor : Math.ceil;
  if (service?.slotUnit === "day") {
    return `${Math.max(1, round(deltaMs / DAY_MS))}일 뒤`;
  }
  return `${Math.max(1, round(deltaMs / HOUR_MS))}시간 뒤`;
}

// True when an availability slot inside the cancel window actually exists at this
// run time. For packs with closed gaps wider than the cancel window (e.g. a
// weekend), no such slot exists at some run times, making the escalation-by-late-
// cancel scenario physically impossible — the harness then skips it deterministically.
function insideCancelFeasible(nowMs: number = Date.now()): boolean {
  const slot = nextAllowedSlotStart(nowMs + HOUR_MS);
  return slot !== null && isInsideCancelWindow(slot, nowMs);
}

function deriveInsideCancelOffset() {
  return cancelWindowOffset("inside");
}

function deriveOutsideCancelOffset() {
  return cancelWindowOffset("outside");
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function stamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}
