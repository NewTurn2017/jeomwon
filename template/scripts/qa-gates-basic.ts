import fs from "node:fs";
import path from "node:path";
import {
  createConfirmedReservation,
  runConfirmTriad,
  waitForEmailCapture,
} from "./qa-booking";
import {
  artifactDir,
  assert,
  assertRecord,
  findRawReservationIdLeaks,
  forbiddenPublicMarkers,
  isPublicReservationNumber,
  type QaResult,
  readPath,
  root,
  writeJson,
} from "./qa-shared";
import {
  availabilityRequest,
  insideCancelFeasible,
  insideCancelRequest,
} from "./qa-time";
import { postChat, requestJson } from "./qa-transport";

export async function qaHappyPath(): Promise<QaResult> {
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

export async function qaCancelWindow(): Promise<QaResult> {
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
  const cancellation = await waitForEmailCapture(
    threadId,
    "reservation.escalated",
    () => postChat(threadId, "취소해줘"),
  );
  const cancelled = cancellation.triggerResult;
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

export async function qaConfirmationGuardrail(): Promise<QaResult> {
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

export async function qaRelevanceGuardrail(): Promise<QaResult> {
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

export async function qaMalformedInput(): Promise<QaResult> {
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

export async function qaPrivacy(): Promise<QaResult> {
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
