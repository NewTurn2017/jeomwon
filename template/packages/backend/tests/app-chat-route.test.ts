import { expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

let authToken: string | undefined;
const handleCalls: Array<{
  readonly convexUrl: string;
  readonly runtimeMode: string;
  readonly authToken: string;
}> = [];
const toolboxCalls: Array<{
  readonly convexUrl: string;
  readonly authToken: string;
}> = [];
const publicStateCalls: Array<{ readonly threadId: string | undefined }> = [];

mock.module("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: async () => authToken,
}));

mock.module("@jeomwon/agents", () => ({
  createConvexAgentToolbox: (convexUrl: string, token: string) => {
    toolboxCalls.push({ convexUrl, authToken: token });
    return {
      publicState: async (threadId?: string) => {
        publicStateCalls.push({ threadId });
        if (threadId === "user:users:foreign") {
          throw new Error("thread_forbidden");
        }
        return { threadId: threadId ?? "user:users:own" };
      },
    };
  },
  handleChatRequest: async (
    _request: Request,
    options: {
      readonly convexUrl: string;
      readonly runtimeMode: string;
      readonly authToken: string;
    },
  ) => {
    handleCalls.push(options);
    return { status: 200, body: { ok: true } };
  },
  normalizeRuntimeMode: () => "mock",
}));

mock.module("@/env.mjs", () => ({
  env: { NEXT_PUBLIC_CONVEX_URL: "https://convex.example.invalid" },
}));

const routeModule = await import(
  `../../../apps/app/src/app/api/chat/route.ts?post-baseline=${Date.now()}`
);
const { POST } = routeModule;

type GetHandler = (request: Request) => Promise<Response>;

function getHandler(): GetHandler {
  const candidate = Reflect.get(routeModule, "GET");
  expect(typeof candidate).toBe("function");
  if (typeof candidate !== "function") {
    throw new Error("app_chat_get_handler_missing");
  }
  return candidate;
}

function resetFixture() {
  authToken = undefined;
  handleCalls.length = 0;
  toolboxCalls.length = 0;
  publicStateCalls.length = 0;
}

test("POST retains exact unauthenticated 401 and forwards an authenticated token", async () => {
  // Given
  resetFixture();
  const request = () =>
    new NextRequest("https://app.example.invalid/api/chat", {
      method: "POST",
      body: JSON.stringify({ thread_id: "user:users:a", message: "hello" }),
    });

  // When
  const unauthenticated = await POST(request());
  authToken = "authenticated-test-token";
  const authenticated = await POST(request());

  // Then
  expect(unauthenticated.status).toBe(401);
  expect(JSON.stringify(await unauthenticated.json())).toBe(
    JSON.stringify({
      error: {
        code: "auth_required",
        details: ["Authentication required."],
      },
    }),
  );
  expect(authenticated.status).toBe(200);
  expect(JSON.stringify(await authenticated.json())).toBe(
    JSON.stringify({ ok: true }),
  );
  expect(JSON.stringify(handleCalls)).toBe(
    JSON.stringify([
      {
        convexUrl: "https://convex.example.invalid",
        runtimeMode: "mock",
        authToken: "authenticated-test-token",
      },
    ]),
  );
});

test("GET returns the exact auth-required envelope before constructing a toolbox", async () => {
  // Given
  resetFixture();
  const request = new Request(
    "https://app.example.invalid/api/chat?thread_id=user%3Ausers%3Aa",
  );

  // When
  const response = await getHandler()(request);

  // Then
  expect(response.status).toBe(401);
  expect(JSON.stringify(await response.json())).toBe(
    JSON.stringify({
      error: {
        code: "auth_required",
        details: ["Authentication required."],
      },
    }),
  );
  expect(toolboxCalls.length).toBe(0);
});

test("GET derives the authenticated caller's own state when thread_id is omitted", async () => {
  // Given
  resetFixture();
  authToken = "authenticated-test-token";
  const request = new Request("https://app.example.invalid/api/chat");

  // When
  const response = await getHandler()(request);

  // Then
  expect(response.status).toBe(200);
  expect(JSON.stringify(await response.json())).toBe(
    JSON.stringify({ threadId: "user:users:own" }),
  );
  expect(JSON.stringify(toolboxCalls)).toBe(
    JSON.stringify([
      {
        convexUrl: "https://convex.example.invalid",
        authToken: "authenticated-test-token",
      },
    ]),
  );
  expect(publicStateCalls.length).toBe(1);
  expect(publicStateCalls[0]?.threadId).toBe(undefined);
});

test("GET rejects an explicit whitespace-only thread_id with exact 422", async () => {
  // Given
  resetFixture();
  authToken = "authenticated-test-token";
  const request = new Request(
    "https://app.example.invalid/api/chat?thread_id=%20%20%20",
  );

  // When
  const response = await getHandler()(request);

  // Then
  expect(response.status).toBe(422);
  expect(JSON.stringify(await response.json())).toBe(
    JSON.stringify({
      error: {
        code: "invalid_request",
        details: ["thread_id is required."],
      },
    }),
  );
  expect(toolboxCalls.length).toBe(0);
});

test("GET trims thread_id and delegates foreign-thread rejection to authenticated Convex state", async () => {
  // Given
  resetFixture();
  authToken = "authenticated-test-token";
  const request = new Request(
    "https://app.example.invalid/api/chat?thread_id=%20user%3Ausers%3Aforeign%20",
  );

  // When
  let errorMessage = "";
  try {
    await getHandler()(request);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  // Then
  expect(errorMessage).toBe("thread_forbidden");
  expect(JSON.stringify(toolboxCalls)).toBe(
    JSON.stringify([
      {
        convexUrl: "https://convex.example.invalid",
        authToken: "authenticated-test-token",
      },
    ]),
  );
  expect(JSON.stringify(publicStateCalls)).toBe(
    JSON.stringify([{ threadId: "user:users:foreign" }]),
  );
});
