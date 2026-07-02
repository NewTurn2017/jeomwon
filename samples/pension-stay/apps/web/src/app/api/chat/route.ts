import {
  createConvexAgentToolbox,
  normalizeRuntimeMode,
  runAgentTurn,
} from "@pension-stay/agents";
import {
  BoundaryError,
  invalidRequest,
  normalizeConvexArgs,
  readStringField,
} from "@pension-stay/backend/src/boundary";
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
  let payload: ReturnType<typeof normalizeConvexArgs>;

  try {
    payload = normalizeConvexArgs(await request.json());
  } catch (error) {
    const details =
      error instanceof BoundaryError
        ? error.details
        : ["Request body must be valid JSON."];
    return Response.json(invalidRequest(details), { status: 422 });
  }

  const message = readStringField(payload, "message");
  const requestedThreadId =
    readStringField(payload, "thread_id") ??
    readStringField(payload, "threadId");
  const details: string[] = [];

  if (!message) {
    details.push("message is required.");
  }

  if (details.length > 0) {
    return Response.json(invalidRequest(details), { status: 422 });
  }

  // This is an anonymous conversation key for continuity, not an auth identity.
  const threadId = requestedThreadId ?? crypto.randomUUID();
  const chatMessage = message ?? "";
  const runtimeMode = normalizeRuntimeMode(process.env.AGENT_RUNTIME);
  const tools = createConvexAgentToolbox(env.NEXT_PUBLIC_CONVEX_URL);

  try {
    const result = await runAgentTurn({
      request: {
        threadId,
        message: chatMessage,
      },
      runtimeMode,
      tools,
    });
    return Response.json({
      ...result,
      thread_id: result.threadId,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Agent runtime failed.";
    return Response.json(
      {
        error: {
          code: "agent_runtime_failed",
          details: [detail],
        },
      },
      { status: 500 },
    );
  }
}
