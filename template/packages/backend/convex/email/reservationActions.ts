"use node";

import {
  type ReservationEmailKind,
  renderReservationEmail,
} from "@jeomwon/email/reservation";
import { v } from "convex/values";
import { domainConfig } from "../../domain.config";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { env } from "../env";
import { reservationEmailMode } from "./deliveryMode";
import { sendEmail } from "./index";
import {
  publicContextValidator,
  reservationEmailKindValidator,
} from "./validators";

export const sendReservationEmail = internalAction({
  args: {
    kind: reservationEmailKindValidator,
    threadId: v.string(),
    to: v.string(),
    publicContext: publicContextValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!domainConfig.features.email) {
      return null;
    }

    const content = await renderReservationEmail({
      kind: args.kind,
      context: {
        storeName: domainConfig.storeName,
        displayName: args.publicContext.displayName,
        reservationId: args.publicContext.reservationId,
        serviceLabel: args.publicContext.serviceLabel,
        resourceLabel: args.publicContext.resourceLabel,
        timeWindow: args.publicContext.timeWindow,
        policySummary: args.publicContext.policySummary,
        nextStep: args.publicContext.nextStep,
        copy: {
          confirmed: domainConfig.copy.confirmed,
          rescheduled: domainConfig.copy.rescheduled,
          cancelled: domainConfig.copy.cancelled,
          cancelEscalated: domainConfig.copy.cancelEscalated,
        },
      },
    });
    // QA and public demo deployments always capture instead of sending so a
    // configured production RESEND_API_KEY can never trigger a real delivery.
    const deliveryMode = reservationEmailMode({
      resendApiKey: env.RESEND_API_KEY,
      qaResetFlag: process.env.JEOMWON_QA_RESET,
      demoResetFlag: process.env.JEOMWON_DEMO_RESET,
    });
    const captureMode = deliveryMode === "capture";
    const payload = {
      mode: deliveryMode,
      subject: content.subject,
      summary: content.summary,
      reservationId: args.publicContext.reservationId,
      template: args.kind,
    } as const;

    if (captureMode) {
      await ctx.runMutation(
        internal.email.reservationEvents.recordReservationEmailEvent,
        {
          threadId: args.threadId,
          type: "email.captured",
          agent: agentForKind(args.kind),
          publicPayload: payload,
        },
      );
      return null;
    }

    await sendEmail({
      to: args.to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    await ctx.runMutation(
      internal.email.reservationEvents.recordReservationEmailEvent,
      {
        threadId: args.threadId,
        type: "email.sent",
        agent: agentForKind(args.kind),
        publicPayload: payload,
      },
    );

    return null;
  },
});

function agentForKind(kind: ReservationEmailKind) {
  switch (kind) {
    case "reservation.confirmed":
    case "reservation.rescheduled":
    case "reservation.cancelled":
    case "reservation.waitlist_opened":
      return "reservation";
    case "reservation.escalated":
      return "escalation";
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected reservation email kind: ${String(value)}`);
}
