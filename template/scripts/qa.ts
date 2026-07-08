import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { parse as parseDotenv } from "dotenv";
import { domainConfig } from "../packages/backend/domain.config";
import type {
  PublicContext,
  PublicSlot,
} from "../packages/backend/src/agent-contract";
import {
  alignToSlot,
  isSlotAllowed,
  serviceEndMs,
  slotStepMs,
} from "../packages/backend/convex/engine/availability";
import { isInsideCancelWindow } from "../packages/backend/convex/engine/policy";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

type QaResult = {
  id: number;
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
type ConvexHttpAdminClient = ConvexHttpClient & {
  setAdminAuth(token: string): void;
};

const root = process.cwd();
const localEnv = readLocalEnvFiles([
  path.join(root, "apps/web/.env.local"),
  path.join(root, "apps/app/.env.local"),
  path.join(root, "packages/backend/.env.local"),
]);
const baseUrl = process.env.JEOMWON_QA_BASE_URL ?? "http://localhost:3001";
const artifactDir = path.join(root, "qa-artifacts", `jeomwon-${stamp()}`);
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
const qaResetMutation = makeFunctionReference<
  "mutation",
  { domainKey: string },
  QaResetResult
>("qaReset:resetDomain");
const qaSeedMutation = makeFunctionReference<
  "mutation",
  Record<string, never>,
  QaSeedResult
>("jeomwonSeed:seed");
const searchAvailabilityQuery = makeFunctionReference<
  "query",
  {
    threadId: string;
    serviceKey: string | null;
    resourceKey: string | null;
    preferredStartMs: number | null;
    count: number;
  },
  { slots: PublicSlot[] }
>("agentTools:searchAvailability");
const joinWaitlistMutation = makeFunctionReference<
  "mutation",
  {
    threadId: string;
    serviceKey: string | null;
    resourceKey: string | null;
    preferredStartMs: number | null;
  },
  { publicContext: PublicContext }
>("agentTools:joinWaitlist");
const createHoldMutation = makeFunctionReference<
  "mutation",
  {
    threadId: string;
    displayName: string | null;
    serviceKey: string;
    resourceKey: string;
    startMs: number;
    endMs: number;
  },
  { publicContext: PublicContext; holdExpiresAtMs: number }
>("agentTools:createHold");
const confirmReservationMutation = makeFunctionReference<
  "mutation",
  { threadId: string; reservationId: string; confirmed: boolean },
  { publicContext: PublicContext }
>("agentTools:confirmReservation");
const cancelReservationMutation = makeFunctionReference<
  "mutation",
  { threadId: string; reservationId: string; requestedAtMs: number },
  { publicContext: PublicContext; escalated: boolean }
>("agentTools:cancelReservation");
const lookupReservationMutation = makeFunctionReference<
  "mutation",
  { threadId: string; reservationId: string },
  { publicContext: PublicContext }
>("agentTools:lookupReservation");
const convexCliTimeoutMs = 60_000;

fs.mkdirSync(artifactDir, { recursive: true });

const results: QaResult[] = [];
let qaResetSummary: { reset: QaResetResult; seed: QaSeedResult } | null = null;

void main();

async function main() {
  try {
    await resetQaDeployment();
    results.push(await qaHappyPath());
    results.push(await qaCancelWindow());
    results.push(await qaConfirmationGuardrail());
    results.push(await qaRelevanceGuardrail());
    results.push(await qaMalformedInput());
    results.push(await qaPrivacy());
    results.push(await qaHoldExpiry());
    results.push(await qaEmailCaptureGate());
    results.push(await qaWaitlistGate());
  } catch (error) {
    results.push({
      id: 99,
      name: "runner",
      status: "FAIL",
      output: [error instanceof Error ? error.message : "Unknown QA failure"],
    });
  }

  writeJson("manifest.json", {
    baseUrl,
    artifactDir,
    qaReset: qaResetSummary,
    results,
  });

  for (const result of results) {
    console.log(`${result.status} QA-${result.id} ${result.name}`);
    for (const line of result.output) {
      console.log(`  ${line}`);
    }
  }
  console.log(`ARTIFACT_DIR ${artifactDir}`);

  if (results.some((result) => result.status === "FAIL")) {
    process.exitCode = 1;
  }
}

async function resetQaDeployment() {
  const adminToken =
    resolveQaEnv("CONVEX_DEPLOY_KEY") ??
    resolveQaEnv("CONVEX_ADMIN_KEY") ??
    resolveQaEnv("CONVEX_SELF_HOSTED_ADMIN_KEY");
  if (!adminToken) {
    await resetQaDeploymentWithConvexCli();
    return;
  }

  const convexUrl =
    resolveQaEnv("NEXT_PUBLIC_CONVEX_URL") ?? resolveQaEnv("CONVEX_URL");
  if (!convexUrl) {
    throw new Error(
      [
        "QA reset requires a Convex URL when using deploy key auth.",
        "Set NEXT_PUBLIC_CONVEX_URL or CONVEX_URL, or keep it in apps/web/.env.local or packages/backend/.env.local.",
      ].join(" "),
    );
  }

  await resetQaDeploymentWithAdminKey(convexUrl, adminToken);
}

async function resetQaDeploymentWithAdminKey(
  convexUrl: string,
  adminToken: string,
) {
  const client = new ConvexHttpClient(convexUrl, { logger: false });
  if (!hasConvexAdminAuth(client)) {
    throw new Error(
      "The installed ConvexHttpClient runtime does not expose setAdminAuth, so QA reset cannot call the internal mutation.",
    );
  }
  client.setAdminAuth(adminToken);

  try {
    const reset = await client.mutation(
      qaResetMutation,
      { domainKey: domainConfig.domainKey },
      { skipQueue: true },
    );
    const seed = await client.mutation(qaSeedMutation, {}, { skipQueue: true });
    qaResetSummary = { reset, seed };
    console.log(
      `QA reset ${reset.domainKey}: reservations=${reset.reservations}, chatThreads=${reset.chatThreads}, chatEvents=${reset.chatEvents}, resources=${seed.resources}`,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      [
        `QA reset failed before scenario execution: ${detail}`,
        "Confirm the Convex deployment has JEOMWON_QA_RESET=1 and the local CONVEX_DEPLOY_KEY targets that same dev deployment.",
      ].join(" "),
    );
  }
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      [
        `QA reset failed before scenario execution: ${detail}`,
        "No Convex deploy/admin key env was found, so the runner used CLI auth via `npx convex run` from packages/backend.",
        "Run `npx convex login` for the target account and confirm the dev deployment has JEOMWON_QA_RESET=1.",
      ].join(" "),
    );
  }
}

async function runConvexCli<T>(
  functionName: string,
  args: JsonRecord,
): Promise<T> {
  const backendDir = path.join(root, "packages/backend");
  const encodedArgs = JSON.stringify(args);

  return await new Promise<T>((resolve, reject) => {
    const child = spawn("npx", ["convex", "run", functionName, encodedArgs], {
      cwd: backendDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

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
        reject(error);
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
    } catch {}
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
    } catch {}
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

function hasConvexAdminAuth(
  client: ConvexHttpClient,
): client is ConvexHttpAdminClient {
  return "setAdminAuth" in client && typeof client.setAdminAuth === "function";
}

async function qaHappyPath(): Promise<QaResult> {
  const threadId = `qa-happy-${Date.now()}`;
  const availability = await postChat(threadId, availabilityRequest("내일"));
  const hold = await postChat(threadId, qaSlotSelectionMessage);
  const confirmed = await postChat(threadId, "확인합니다");
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
    "confirmation did not confirm reservation",
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
    return {
      id: 2,
      name: "cancelWindow 위반",
      status: "SKIP",
      output: [
        "운영시간상 cancel-window 안쪽 예약이 불가능한 실행 시각 — escalation 검사 생략(결정론적).",
      ],
    };
  }

  const threadId = `qa-cancel-${Date.now()}`;
  await postChat(threadId, insideCancelRequest);
  await postChat(threadId, qaSlotSelectionMessage);
  await postChat(threadId, "확인합니다");
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
  const sourcePath = path.join(
    root,
    "apps/web/src/components/customer-chat-widget.tsx",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const responseFiles = fs
    .readdirSync(artifactDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => fs.readFileSync(path.join(artifactDir, file), "utf8"));
  const haystack = [source, ...responseFiles].join("\n");
  const leaked = forbiddenPublicMarkers.filter((marker) =>
    haystack.includes(marker),
  );
  const rawReservationIdLeaks = responseFiles.flatMap((content) =>
    findRawReservationIdLeaks(content),
  );
  writeJson("06-privacy-grep.json", {
    forbiddenPublicMarkers,
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

  const waitMs =
    Number.parseInt(process.env.JEOMWON_TEST_HOLD_MS ?? "2500", 10) + 1500;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const state = await requestJson(
    `/api/chat?thread_id=${encodeURIComponent(threadId)}`,
  );
  writeJson("07-hold-expiry.json", state);
  assertRecord(state.body, "expiry state response");
  assert(
    readPath(state.body, ["publicContext", "status"]) === "expired",
    "hold did not expire; run Convex dev with JEOMWON_TEST_HOLD_MS set low",
  );

  return {
    id: 7,
    name: "홀드 만료 전이",
    status: "PASS",
    output: [
      `waitMs: ${waitMs}`,
      `status: ${readPath(state.body, ["publicContext", "status"])}`,
    ],
  };
}

async function qaEmailCaptureGate(): Promise<QaResult> {
  const confirmedThreadId = `qa-email-confirmed-${Date.now()}`;
  await createConfirmedReservation(
    confirmedThreadId,
    availabilityRequest("내일"),
  );
  const confirmed = await waitForEmailCapture(
    confirmedThreadId,
    "reservation.confirmed",
  );

  const cancelledThreadId = `qa-email-cancelled-${Date.now()}`;
  await createConfirmedReservation(cancelledThreadId, outsideCancelRequest);
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
    const escalatedThreadId = `qa-email-escalated-${Date.now()}`;
    await createConfirmedReservation(escalatedThreadId, insideCancelRequest);
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

  const rescheduledThreadId = `qa-email-rescheduled-${Date.now()}`;
  await createConfirmedReservation(rescheduledThreadId, outsideCancelRequest);
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
    return {
      id: 9,
      name: "대기자 접수·알림",
      status: "SKIP",
      output: [
        "features.waitlist=false — 대기자 접수/알림 게이트는 결정론적으로 생략.",
      ],
    };
  }

  const convexUrl =
    resolveQaEnv("NEXT_PUBLIC_CONVEX_URL") ?? resolveQaEnv("CONVEX_URL");
  if (!convexUrl) {
    throw new Error(
      "waitlist QA requires NEXT_PUBLIC_CONVEX_URL or CONVEX_URL for direct saturation mutations",
    );
  }

  const client = new ConvexHttpClient(convexUrl, { logger: false });
  const resource = qaWaitlistResource();
  const saturated = await saturateWaitlistResource(client, resource.key);
  const zeroSlots = await client.query(searchAvailabilityQuery, {
    threadId: `qa-waitlist-zero-${Date.now()}`,
    serviceKey: qaService?.key ?? null,
    resourceKey: resource.key,
    preferredStartMs: null,
    count: 1,
  });
  assert(
    zeroSlots.slots.length === 0,
    `waitlist saturation left ${zeroSlots.slots.length} available slot(s)`,
  );

  const waitlistThreadId = `qa-waitlist-${Date.now()}`;
  const joined = await postChat(
    waitlistThreadId,
    `${availabilityRequest("내일")} ${resource.label}`,
  );
  assertRecord(joined, "waitlist join response");
  assert(
    readPath(joined, ["publicContext", "status"]) === "waitlisted",
    "waitlist join did not expose waitlisted status",
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
    waitlistThreadId,
    `${availabilityRequest("내일")} ${resource.label}`,
  );
  assertRecord(duplicateJoined, "duplicate waitlist join response");
  assert(
    readPath(duplicateJoined, ["publicContext", "reservationId"]) ===
      waitlistReservationId,
    "duplicate waitlist join did not reuse the existing waitlist row",
  );
  const lookup = await client.mutation(lookupReservationMutation, {
    threadId: waitlistThreadId,
    reservationId: waitlistReservationId,
  });
  assert(
    lookup.publicContext.status === "waitlisted",
    "waitlist row lookup did not return status waitlisted",
  );

  const invalidKeyRejected = await expectMutationRejects(
    () =>
      client.mutation(joinWaitlistMutation, {
        threadId: `qa-waitlist-invalid-${Date.now()}`,
        serviceKey: "__missing_service__",
        resourceKey: resource.key,
        preferredStartMs: null,
      }),
    "not_found",
  );
  const availableResource =
    domainConfig.resources.find(
      (candidate) => candidate.key !== resource.key,
    ) ?? null;
  let availabilityExistsRejected = "SKIP";
  if (availableResource !== null) {
    availabilityExistsRejected = (await expectMutationRejects(
      () =>
        client.mutation(joinWaitlistMutation, {
          threadId: `qa-waitlist-available-${Date.now()}`,
          serviceKey: qaService?.key ?? null,
          resourceKey: availableResource.key,
          preferredStartMs: null,
        }),
      "availability_exists",
    ))
      ? "PASS"
      : "FAIL";
    assert(
      availabilityExistsRejected === "PASS",
      "waitlist join did not reject a resource with available slots",
    );
  }

  const secondWaitlistThreadId = `qa-waitlist-second-${Date.now()}`;
  const secondJoined = await postChat(
    secondWaitlistThreadId,
    `${availabilityRequest("내일")} ${resource.label}`,
  );
  assertRecord(secondJoined, "second waitlist join response");
  const secondWaitlistReservationId = readPath(secondJoined, [
    "publicContext",
    "reservationId",
  ]);
  assert(
    typeof secondWaitlistReservationId === "string" &&
      isPublicReservationNumber(secondWaitlistReservationId),
    "second waitlist join did not expose a public reservation number",
  );
  await client.mutation(cancelReservationMutation, {
    threadId: waitlistThreadId,
    reservationId: waitlistReservationId,
    requestedAtMs: Date.now(),
  });
  await assertNoWaitlistSlotOpened(secondWaitlistThreadId);

  await client.mutation(cancelReservationMutation, {
    threadId: saturated.first.threadId,
    reservationId: saturated.first.reservationId,
    requestedAtMs: Date.now(),
  });
  const slotOpened = await waitForWaitlistSlotOpened(secondWaitlistThreadId);
  const email = await waitForEmailCapture(
    secondWaitlistThreadId,
    "reservation.waitlist_opened",
  );

  writeJson("09-waitlist.json", {
    resource,
    saturatedCount: saturated.count,
    waitlistReservationId,
    duplicateWaitlistReservationId: readPath(duplicateJoined, [
      "publicContext",
      "reservationId",
    ]),
    secondWaitlistReservationId,
    invalidKeyRejected,
    availabilityExistsRejected,
    slotOpened,
    email,
  });

  return {
    id: 9,
    name: "대기자 접수·알림",
    status: "PASS",
    output: [
      `resource: ${resource.key}`,
      `saturatedReservations: ${saturated.count}`,
      `waitlistStatus: ${lookup.publicContext.status}`,
      `duplicateReservationReused: ${waitlistReservationId}`,
      `invalidKeyRejected: ${invalidKeyRejected}`,
      `availabilityExistsRejected: ${availabilityExistsRejected}`,
      `chatEvent: ${slotOpened.type}`,
      `emailTemplate: ${email.template}`,
    ],
  };
}

async function createConfirmedReservation(
  threadId: string,
  availabilityMessage: string,
) {
  await postChat(threadId, availabilityMessage);
  await postChat(threadId, qaSlotSelectionMessage);
  const confirmed = await postChat(threadId, "확인합니다");
  assertRecord(confirmed, "confirmed email setup response");
  assert(
    readPath(confirmed, ["publicContext", "status"]) === "confirmed",
    "email capture setup did not confirm reservation",
  );
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

async function saturateWaitlistResource(
  client: ConvexHttpClient,
  resourceKey: string,
) {
  const confirmed: { threadId: string; reservationId: string }[] = [];
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const availability = await client.query(searchAvailabilityQuery, {
      threadId: `qa-waitlist-scan-${Date.now()}-${attempt}`,
      serviceKey: qaService?.key ?? null,
      resourceKey,
      preferredStartMs: null,
      count: 10,
    });
    if (availability.slots.length === 0) {
      const first = confirmed[0];
      assert(
        first !== undefined,
        "waitlist saturation created no reservations",
      );
      return { count: confirmed.length, first };
    }

    for (const [index, slot] of availability.slots.entries()) {
      const threadId = `qa-waitlist-fill-${Date.now()}-${attempt}-${index}`;
      const hold = await client.mutation(createHoldMutation, {
        threadId,
        displayName: null,
        serviceKey: slot.serviceKey,
        resourceKey: slot.resourceKey,
        startMs: slot.startMs,
        endMs: slot.endMs,
      });
      const reservationId = hold.publicContext.reservationId;
      assert(
        typeof reservationId === "string",
        "waitlist saturation hold did not return reservationId",
      );
      const confirmedReservation = await client.mutation(
        confirmReservationMutation,
        {
          threadId,
          reservationId,
          confirmed: true,
        },
      );
      assert(
        confirmedReservation.publicContext.status === "confirmed",
        "waitlist saturation did not confirm reservation",
      );
      confirmed.push({ threadId, reservationId });
    }
  }

  throw new Error("waitlist saturation exceeded 120 search iterations");
}

async function waitForWaitlistSlotOpened(threadId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await requestJson(
      `/api/chat?thread_id=${encodeURIComponent(threadId)}`,
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

async function assertNoWaitlistSlotOpened(threadId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = await requestJson(
      `/api/chat?thread_id=${encodeURIComponent(threadId)}`,
    );
    assertRecord(state.body, "waitlist no-slot-opened state response");
    const messages = readPath(state.body, ["messages"]);
    if (Array.isArray(messages)) {
      const event = messages.find(
        (message) =>
          isRecord(message) && message.type === "waitlist.slotOpened",
      );
      assert(
        event === undefined,
        "waitlisted row cancellation emitted waitlist.slotOpened",
      );
    }
    await delay(250);
  }
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

async function waitForEmailCapture(threadId: string, template: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await requestJson(
      `/api/chat?thread_id=${encodeURIComponent(threadId)}`,
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

async function postChat(threadId: string, message: string) {
  const response = await requestJson("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      message,
    }),
  });
  if (response.status !== 200) {
    throw new Error(`POST /api/chat failed with HTTP ${response.status}`);
  }
  return response.body;
}

async function requestJson(pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const body: unknown = await response.json();
  return {
    status: response.status,
    body,
  };
}

function writeJson(fileName: string, value: unknown) {
  fs.writeFileSync(
    path.join(artifactDir, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
  );
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

function resolveQaEnv(name: string) {
  const processValue = process.env[name]?.trim();
  if (processValue) {
    return processValue;
  }
  const localValue = localEnv[name]?.trim();
  return localValue ? localValue : undefined;
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
