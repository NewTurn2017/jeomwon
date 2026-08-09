"use client";

import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { useMutation } from "convex/react";
import type { OperatorCalendarGateway } from "./operator-calendar-controller";

export function useOperatorCalendarGateway(): OperatorCalendarGateway {
  const createSession = useMutation(jeomwonConvex.admin.createSession);
  const updateSession = useMutation(jeomwonConvex.admin.updateSession);
  const rescheduleCustomerReservation = useMutation(
    jeomwonConvex.admin.rescheduleCustomerReservation,
  );
  const deleteSession = useMutation(jeomwonConvex.admin.deleteSession);

  return {
    createSession,
    updateSession,
    rescheduleCustomerReservation,
    deleteSession,
  };
}
