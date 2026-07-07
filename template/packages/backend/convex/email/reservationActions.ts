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
    // During QA (dev deployment env JEOMWON_QA_RESET=1) always capture instead
    // of sending: keeps the 8-gate email check deterministic and never fires a
    // real Resend send, so a production RESEND_API_KEY can stay configured.
    const captureMode =
      !env.RESEND_API_KEY || process.env.JEOMWON_QA_RESET === "1";
    const payload = {
      mode: captureMode ? "capture" : "sent",
      to: args.to,
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
