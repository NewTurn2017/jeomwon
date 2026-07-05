import type { ReservationEmailKind } from "@jeomwon/email/reservation";
import { domainConfig } from "../domain.config";
import type { PublicContext } from "../src/agent-contract";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

export async function scheduleReservationEmail(
  ctx: MutationCtx,
  input: {
    readonly kind: ReservationEmailKind;
    readonly threadId: string;
    readonly publicContext: PublicContext;
  },
) {
  if (!domainConfig.features.email) {
    return;
  }

  await ctx.scheduler.runAfter(
    0,
    internal.email.reservationActions.sendReservationEmail,
    {
      kind: input.kind,
      threadId: input.threadId,
      to: domainConfig.notificationEmail,
      publicContext: input.publicContext,
    },
  );
}
