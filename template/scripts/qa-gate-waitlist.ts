import { domainConfig } from "../packages/backend/domain.config";
import {
  findEmailCapture,
  qaWaitlistResource,
  saturateWaitlistThroughApp,
} from "./qa-booking";
import { subscribeQaPublicState } from "./qa-browser-state-wait";
import {
  assert,
  assertRecord,
  isPublicReservationNumber,
  type QaResult,
  readPath,
  writeJson,
} from "./qa-shared";
import { exactStateTimeoutMs, waitlistJoinRequest } from "./qa-time";
import {
  findWaitlistSlotOpened,
  postChat,
  qaPageB,
  threadIdForPage,
} from "./qa-transport";

export async function qaWaitlistGate(): Promise<QaResult> {
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
  const waitlistEvidence = await subscribeQaPublicState(
    qaPageB(),
    {
      kind: "messages",
      messages: [
        { type: "waitlist.slotOpened" },
        {
          type: "email.captured",
          template: "reservation.waitlist_opened",
          reservationId: waitlistReservationId,
        },
      ],
    },
    exactStateTimeoutMs(),
  );
  let waitlistState: Awaited<typeof waitlistEvidence.result>;
  try {
    await postChat(
      "qa-waitlist-owner",
      `${saturated.firstReservationId} 취소해줘`,
    );
    waitlistState = await waitlistEvidence.result;
  } finally {
    await waitlistEvidence.cancel();
  }
  const slotOpened = findWaitlistSlotOpened(waitlistState);
  assert(slotOpened !== null, "waitlist.slotOpened subscription lost evidence");
  const email = findEmailCapture(
    waitlistState,
    threadIdForPage(qaPageB()),
    "reservation.waitlist_opened",
  );
  assert(email !== null, "waitlist email subscription lost evidence");

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
