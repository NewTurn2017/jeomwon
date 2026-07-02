import { v } from "convex/values";
import { domainConfig } from "../../domain.config";
import { internalMutation } from "../_generated/server";
import { emailEventPayloadValidator } from "./validators";

const emailEventTypeValidator = v.union(
  v.literal("email.captured"),
  v.literal("email.sent"),
);

const emailAgentValidator = v.union(
  v.literal("reservation"),
  v.literal("escalation"),
);

export const recordReservationEmailEvent = internalMutation({
  args: {
    threadId: v.string(),
    type: emailEventTypeValidator,
    agent: emailAgentValidator,
    publicPayload: emailEventPayloadValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("chatEvents", {
      domainKey: domainConfig.domainKey,
      threadId: args.threadId,
      type: args.type,
      role: "system",
      agent: args.agent,
      message:
        args.type === "email.captured"
          ? `메일 캡처: ${args.publicPayload.subject}`
          : `메일 발송: ${args.publicPayload.subject}`,
      publicPayload: args.publicPayload,
      createdAtMs: Date.now(),
    });

    return null;
  },
});
