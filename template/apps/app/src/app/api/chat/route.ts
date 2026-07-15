import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import {
  createConvexAgentToolbox,
  handleChatRequest,
  normalizeRuntimeMode,
} from "@jeomwon/agents";
import type { NextRequest } from "next/server";
import { env } from "@/env.mjs";

export const runtime = "nodejs";

const authRequired = {
  error: {
    code: "auth_required",
    details: ["Authentication required."],
  },
};

const threadIdRequired = {
  error: {
    code: "invalid_request",
    details: ["thread_id is required."],
  },
};

export async function GET(request: Request) {
  const token = await convexAuthNextjsToken();
  if (!token) {
    return Response.json(authRequired, { status: 401 });
  }

  const rawThreadId = new URL(request.url).searchParams.get("thread_id");
  const threadId = rawThreadId?.trim();
  if (rawThreadId !== null && !threadId) {
    return Response.json(threadIdRequired, { status: 422 });
  }

  const tools = createConvexAgentToolbox(env.NEXT_PUBLIC_CONVEX_URL, token);
  return Response.json(await tools.publicState(threadId));
}

export async function POST(request: NextRequest) {
  // The logged-in operator/customer's Convex token, read from the auth cookie
  // set by ConvexAuthNextjsServerProvider. Proven mechanism: the dashboard
  // layout authenticates its server-side Convex calls the same way
  // (apps/app/src/app/[locale]/(dashboard)/layout.tsx:13-14).
  const token = await convexAuthNextjsToken();
  if (!token) {
    // A real 401 JSON envelope — NOT a redirect. The proxy matcher excludes
    // /api so an unauthenticated fetch reaches this handler instead of being
    // 307'd to /login.
    return Response.json(authRequired, { status: 401 });
  }

  // The client thread_id is passed through untrusted: Convex re-derives the
  // caller's own thread from this forwarded token and rejects a foreign one.
  const runtimeMode = normalizeRuntimeMode(process.env.AGENT_RUNTIME);
  const { status, body } = await handleChatRequest(request, {
    convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
    runtimeMode,
    authToken: token,
  });
  return Response.json(body, { status });
}
