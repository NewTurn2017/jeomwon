import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { handleChatRequest, normalizeRuntimeMode } from "@pension-stay/agents";
import { domainConfig } from "@pension-stay/backend/domain.config";
import type { NextRequest } from "next/server";
import { env } from "@/env.mjs";

export const runtime = "nodejs";

const authRequired = {
  error: {
    code: "auth_required",
    details: ["Authentication required."],
  },
};

export async function POST(request: NextRequest) {
  // The route file ships in every generated app (the kit copies template/
  // wholesale), but it only means anything when customer accounts are on. With
  // the flag off, apps/app has no customer chat surface, so this endpoint behaves
  // as if it did not exist — a 404, exactly what a flags-off pack returned before
  // this file was added. `domainConfig.features.customerAccounts` is a
  // compile-time constant, so this is not a runtime branch, it is dead code.
  if (!domainConfig.features.customerAccounts) {
    return new Response("Not Found", { status: 404 });
  }

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
