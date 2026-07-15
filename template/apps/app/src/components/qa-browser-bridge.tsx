"use client";

import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import type { QaBrowserBridgeContract } from "@jeomwon/backend/src/qa-browser-contract";
import { qaBrowserBridgeKey } from "@jeomwon/backend/src/qa-browser-contract";
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
    const bridge = {
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
    } satisfies QaBrowserBridgeContract;

    Object.defineProperty(window, qaBrowserBridgeKey, {
      configurable: true,
      value: bridge,
    });
    return () => {
      Reflect.deleteProperty(window, qaBrowserBridgeKey);
    };
  }, [convex]);

  return null;
}
