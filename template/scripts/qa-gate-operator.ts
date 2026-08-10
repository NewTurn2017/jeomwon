import { ConvexHttpClient } from "convex/browser";
import { domainConfig } from "../packages/backend/domain.config";
import { pageCanonicalCall, pageRequestRoute } from "./qa-browser";
import { qaConvexTarget } from "./qa-convex-runner";
import {
  assert,
  createSessionMutation,
  deleteSessionMutation,
  type QaResult,
  qaService,
  qaState,
  updateSessionMutation,
  writeJson,
} from "./qa-shared";
import {
  canonicalFailureCode,
  expectMutationRejects,
  qaPageA,
} from "./qa-transport";

export async function qaOperatorCalendarCrudGate(): Promise<QaResult> {
  assert(
    qaState.unauthenticatedAdminRoute !== null &&
      qaState.unauthenticatedAdminRoute.kind === "redirect",
    "unauthenticated /admin did not deny access with a redirect",
  );
  const authenticatedCustomerAdminRoute = await pageRequestRoute(
    qaPageA(),
    "/admin",
  );
  console.log(
    `QA operator routes: unauthenticated=${qaState.unauthenticatedAdminRoute.kind}, authenticated=${authenticatedCustomerAdminRoute.kind}${authenticatedCustomerAdminRoute.kind === "response" ? `:${authenticatedCustomerAdminRoute.status}` : ""}`,
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
      unauthenticatedAdminRoute: qaState.unauthenticatedAdminRoute,
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
    unauthenticatedAdminRoute: qaState.unauthenticatedAdminRoute,
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
