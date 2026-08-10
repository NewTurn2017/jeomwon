import { ConvexHttpClient } from "convex/browser";
import { domainConfig } from "../packages/backend/domain.config";
import { runAuthenticatedAccountFlow } from "./qa-account-flow";
import { waitForEmailCapture } from "./qa-booking";
import { qaConvexTarget } from "./qa-convex-runner";
import {
  assert,
  customerCancelReservationMutation,
  customerConfirmReservationMutation,
  customerCreateHoldMutation,
  customerRescheduleReservationMutation,
  customerSnapshotQuery,
  DAY_MS,
  type QaResult,
  qaService,
  writeJson,
} from "./qa-shared";
import {
  expectMutationRejects,
  qaPageA,
  threadIdForPage,
} from "./qa-transport";

export async function qaCustomerAccountsGate(): Promise<QaResult> {
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
  const threadId = threadIdForPage(qaPageA());
  const authenticated = await runAuthenticatedAccountFlow(service, resource, {
    capture: async (template, trigger) =>
      (await waitForEmailCapture(threadId, template, trigger)).triggerResult,
  });
  writeJson("11-customer-accounts.json", {
    snapshotRejected,
    unauthenticatedWrites,
    ...authenticated,
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
