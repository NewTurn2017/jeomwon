import {
  createConvexAgentToolbox,
  handleChatRequest,
  normalizeRuntimeMode,
} from "@pension-stay/agents";
import { invalidRequest } from "@pension-stay/backend/src/boundary";
import type { NextRequest } from "next/server";
import { env } from "@/env";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const threadId = request.nextUrl.searchParams.get("thread_id")?.trim();
  if (!threadId) {
    return Response.json(invalidRequest(["thread_id is required."]), {
      status: 422,
    });
  }

  const tools = createConvexAgentToolbox(env.NEXT_PUBLIC_CONVEX_URL);
  const state = await tools.publicState(threadId);
  return Response.json(state);
}

export async function POST(request: NextRequest) {
  // The public site chat is anonymous: no token is forwarded, so the shared
  // handler behaves exactly as this route did before it was extracted.
  const runtimeMode = normalizeRuntimeMode(process.env.AGENT_RUNTIME);
  const { status, body } = await handleChatRequest(request, {
    convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
    runtimeMode,
  });
  return Response.json(body, { status });
}
