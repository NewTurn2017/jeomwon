"use client";

import type { PublicThreadState } from "@jeomwon/backend/src/agent-contract";
import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import type { QaBrowserBridgeContract } from "@jeomwon/backend/src/qa-browser-contract";
import {
  matchesQaPublicState,
  qaBrowserBridgeKey,
} from "@jeomwon/backend/src/qa-browser-contract";
import {
  createExactSignalWait,
  type ExactSignalWait,
} from "@jeomwon/backend/src/qa-exact-wait";
import { useConvex } from "convex/react";
import { useEffect } from "react";

export function QaBrowserBridge() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return <QaBrowserBridgeDevelopment />;
}

function QaBrowserBridgeDevelopment() {
  const convex = useConvex();

  useEffect(() => {
    const publicStateWaits = new Map<
      string,
      ExactSignalWait<PublicThreadState>
    >();
    const bridge = {
      startPublicStateWait: (id, expectation, timeoutMs) => {
        if (publicStateWaits.has(id)) {
          throw new Error("qa_public_state_wait_duplicate");
        }
        const watch = convex.watchQuery(jeomwonConvex.chat.publicState, {});
        const wait = createExactSignalWait<PublicThreadState>(
          (listener) =>
            watch.onUpdate(() => {
              const state = watch.localQueryResult();
              if (state !== undefined) listener(state);
            }),
          (state) => matchesQaPublicState(state, expectation),
          timeoutMs,
        );
        publicStateWaits.set(id, wait);
      },
      finishPublicStateWait: async (id) => {
        const wait = publicStateWaits.get(id);
        if (wait === undefined) {
          throw new Error("qa_public_state_wait_missing");
        }
        try {
          return await wait.result;
        } finally {
          publicStateWaits.delete(id);
        }
      },
      cancelPublicStateWait: (id) => {
        publicStateWaits.get(id)?.cancel();
        publicStateWaits.delete(id);
      },
      snapshot: (args) =>
        convex.query(jeomwonConvex.customerReservations.snapshot, args),
      availableSlots: (args) =>
        convex.query(jeomwonConvex.customerReservations.availableSlots, args),
      createHold: (args) =>
        convex.mutation(jeomwonConvex.customerReservations.createHold, args),
      confirmReservation: (args) =>
        convex.mutation(
          jeomwonConvex.customerReservations.confirmReservation,
          args,
        ),
      cancelReservation: (args) =>
        convex.mutation(
          jeomwonConvex.customerReservations.cancelReservation,
          args,
        ),
      rescheduleReservation: (args) =>
        convex.mutation(
          jeomwonConvex.customerReservations.rescheduleReservation,
          args,
        ),
      adminCreateSession: (args) =>
        convex.mutation(jeomwonConvex.admin.createSession, args),
      adminUpdateSession: (args) =>
        convex.mutation(jeomwonConvex.admin.updateSession, args),
      adminDeleteSession: (args) =>
        convex.mutation(jeomwonConvex.admin.deleteSession, args),
      adminMarkReservationNoShow: (args) =>
        convex.mutation(jeomwonConvex.admin.markReservationNoShow, args),
    } satisfies QaBrowserBridgeContract;

    Object.defineProperty(window, qaBrowserBridgeKey, {
      configurable: true,
      value: bridge,
    });
    return () => {
      for (const wait of publicStateWaits.values()) wait.cancel();
      publicStateWaits.clear();
      Reflect.deleteProperty(window, qaBrowserBridgeKey);
    };
  }, [convex]);

  return null;
}
