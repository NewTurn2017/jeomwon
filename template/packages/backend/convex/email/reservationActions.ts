"use node";

import {
  type ReservationEmailKind,
  renderReservationEmail,
} from "@jeomwon/email/reservation";
import { v } from "convex/values";
import { domainConfig } from "../../domain.config";
import type { PublicContext } from "../../src/agent-contract";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { env } from "../env";
import { reservationEmailMode } from "./deliveryMode";
import { sendEmail } from "./index";

type DeliveryMode = "capture" | "sent";
type Prepared =
  | { readonly state: "noop" }
  | { readonly state: "invalid" }
  | {
      readonly state: "ready";
      readonly audience: "operator" | "customer";
      readonly template: ReservationEmailKind;
      readonly recipient: string;
      readonly idempotencyKey: string;
      readonly threadId: string;
      readonly publicReservationId: string;
      readonly publicContext: PublicContext;
    };

type DeliveryDependencies = {
  readonly mode: DeliveryMode;
  readonly render: typeof renderDelivery;
  readonly send: (input: {
    readonly to: string;
    readonly subject: string;
    readonly html: string;
    readonly text: string;
    readonly idempotencyKey: string;
  }) => Promise<unknown>;
};

export const sendReservationEmail = internalAction({
  args: { deliveryId: v.id("reservationEmailDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await executeReservationEmailDelivery(ctx, args, productionDependencies());
    return null;
  },
});

export async function executeReservationEmailDelivery(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: { readonly deliveryId: Id<"reservationEmailDeliveries"> },
  dependencies: DeliveryDependencies,
) {
  const prepared: Prepared = await ctx.runQuery(
    internal.reservationEmailScheduler.prepareReservationEmailDelivery,
    { deliveryId: args.deliveryId },
  );
  if (prepared.state === "noop") return;
  if (prepared.state === "invalid") {
    await ctx.runMutation(
      internal.reservationEmailScheduler.invalidateReservationEmailDelivery,
      { deliveryId: args.deliveryId },
    );
    return;
  }

  const content = await dependencies.render(prepared);
  if (dependencies.mode === "sent") {
    await dependencies.send({
      to: prepared.recipient,
      subject: content.subject,
      html: content.html,
      text: content.text,
      idempotencyKey: prepared.idempotencyKey,
    });
  }
  await ctx.runMutation(
    internal.reservationEmailScheduler.completeReservationEmailDelivery,
    { deliveryId: args.deliveryId, mode: dependencies.mode },
  );
}

function productionDependencies(): DeliveryDependencies {
  return {
    mode: reservationEmailMode({
      resendApiKey: env.RESEND_API_KEY,
      qaResetFlag: process.env.JEOMWON_QA_RESET,
      demoResetFlag: process.env.JEOMWON_DEMO_RESET,
    }),
    render: renderDelivery,
    send: sendEmail,
  };
}

async function renderDelivery(prepared: Extract<Prepared, { state: "ready" }>) {
  return await renderReservationEmail({
    kind: prepared.template,
    context: {
      storeName: domainConfig.storeName,
      displayName: prepared.publicContext.displayName,
      reservationId: prepared.publicContext.reservationId,
      serviceLabel: prepared.publicContext.serviceLabel,
      resourceLabel: prepared.publicContext.resourceLabel,
      timeWindow: prepared.publicContext.timeWindow,
      policySummary: prepared.publicContext.policySummary,
      nextStep: prepared.publicContext.nextStep,
      copy: {
        confirmed: domainConfig.copy.confirmed,
        rescheduled: domainConfig.copy.rescheduled,
        cancelled: domainConfig.copy.cancelled,
        cancelEscalated: domainConfig.copy.cancelEscalated,
      },
    },
  });
}
