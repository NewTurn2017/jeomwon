import { domainConfig } from "../packages/backend/domain.config";
import { subscribeQaPublicState } from "./qa-browser-state-wait";
import { assert, isRecord, qaService, readPath } from "./qa-shared";
import {
  exactStateTimeoutMs,
  qaSlotSelectionMessage,
  waitlistJoinRequest,
} from "./qa-time";
import { postChat, qaPageA, threadIdForPage } from "./qa-transport";

type ConfirmTriad = {
  readonly threadId: string;
  readonly availability: unknown;
  readonly hold: unknown;
  readonly confirmed: unknown;
};

export async function prepareHeldReservation(
  threadId: string,
  availabilityMessage: string,
) {
  const availability = await postChat(threadId, availabilityMessage);
  const hold = await postChat(threadId, qaSlotSelectionMessage);
  assert(
    readPath(hold, ["publicContext", "status"]) === "held",
    "reservation setup did not create a hold",
  );
  return { availability, hold };
}

export async function runConfirmTriad(
  threadIdBase: string,
  availabilityMessage: string,
): Promise<ConfirmTriad> {
  const { availability, hold } = await prepareHeldReservation(
    threadIdBase,
    availabilityMessage,
  );
  const confirmation = await waitForEmailCapture(
    threadIdBase,
    "reservation.confirmed",
    () => postChat(threadIdBase, "확인합니다"),
  );
  const confirmed = confirmation.triggerResult;
  return {
    threadId: threadIdForPage(qaPageA()),
    availability,
    hold,
    confirmed,
  };
}

export async function createConfirmedReservation(
  threadIdBase: string,
  availabilityMessage: string,
): Promise<string> {
  const { threadId, confirmed } = await runConfirmTriad(
    threadIdBase,
    availabilityMessage,
  );
  const status = readPath(confirmed, ["publicContext", "status"]);
  assert(
    status === "confirmed",
    `reservation setup did not confirm reservation (status=${String(status)})`,
  );
  return threadId;
}

export async function createConfirmedReservationWithEmail(
  threadId: string,
  availabilityMessage: string,
) {
  await prepareHeldReservation(threadId, availabilityMessage);
  const captured = await waitForEmailCapture(
    threadId,
    "reservation.confirmed",
    () => postChat(threadId, "확인합니다"),
  );
  assert(
    readPath(captured.triggerResult, ["publicContext", "status"]) ===
      "confirmed",
    "email setup did not confirm reservation",
  );
  return captured.evidence;
}

export function qaWaitlistResource() {
  const service = qaService ?? domainConfig.services[0];
  assert(service !== undefined, "waitlist QA requires at least one service");
  const resource =
    domainConfig.resources.find(
      (candidate) => candidate.kind === service.resourceKind,
    ) ?? domainConfig.resources[0];
  assert(resource !== undefined, "waitlist QA requires at least one resource");
  return resource;
}

export async function saturateWaitlistThroughApp(resourceLabel: string) {
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

export async function waitForEmailCapture<T>(
  threadId: string,
  template: string,
  trigger: () => Promise<T>,
  page = qaPageA(),
) {
  const wait = await subscribeQaPublicState(
    page,
    { kind: "messages", messages: [{ type: "email.captured", template }] },
    exactStateTimeoutMs(),
  );
  try {
    const triggerResult = await trigger();
    const state = await wait.result;
    const evidence = findEmailCapture(state, threadId, template);
    assert(
      evidence !== null,
      `email.captured evidence missing for ${template}`,
    );
    return { evidence, triggerResult };
  } finally {
    await wait.cancel();
  }
}

export function findEmailCapture(
  state: unknown,
  threadId: string,
  template: string,
) {
  const messages = readPath(state, ["messages"]);
  if (!Array.isArray(messages)) return null;
  for (const message of messages) {
    if (!isRecord(message) || message.type !== "email.captured") continue;
    const payload = message.publicPayload;
    if (
      !isRecord(payload) ||
      payload.mode !== "capture" ||
      payload.template !== template ||
      typeof payload.reservationId !== "string" ||
      "to" in payload ||
      "subject" in payload ||
      "summary" in payload
    ) {
      continue;
    }
    return {
      threadId,
      template,
      mode: payload.mode,
      audience:
        typeof payload.audience === "string" ? payload.audience : "unknown",
      reservationId: payload.reservationId,
    };
  }
  return null;
}
