import { isHoldExpired } from "./customer-reservation-controller";
import { normalizeCustomerReservationError } from "./customer-reservation-errors";
import type * as FlowContract from "./customer-reservation-flow-contract";
import { createIdleFlowState } from "./customer-reservation-flow-state";
import { customerResult } from "./customer-reservation-result";

export type * from "./customer-reservation-flow-contract";

const ACTION_FAILED_ERROR = new TypeError("action_failed");

export function createCustomerReservationFlow(
  gateway: FlowContract.CustomerReservationGateway,
): FlowContract.CustomerReservationFlow {
  let state = createIdleFlowState({ kind: "closed" });
  const listeners = new Set<() => void>();

  const emit = () =>
    listeners.forEach((listener) => {
      listener();
    });
  const setState = (next: FlowContract.CustomerReservationFlowState) => {
    state = next;
    emit();
  };
  const setBooking = (dialog: FlowContract.BookingDraft) => {
    setState({ ...state, dialog });
  };
  const startRequest = (): boolean => {
    if (state.pending) return false;
    setState({ ...state, pending: true, error: null, notice: null });
    return true;
  };
  const finishRequest = (
    next: Pick<FlowContract.CustomerReservationFlowState, "dialog" | "notice">,
  ) => {
    setState({ ...state, ...next, pending: false, error: null });
  };
  const failRequest = (error: unknown) => {
    setState({
      ...state,
      pending: false,
      error: normalizeCustomerReservationError(error),
    });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openCreate: (serviceKey, resourceKey) => {
      setState(
        createIdleFlowState({
          kind: "create",
          reservationId: null,
          serviceKey,
          resourceKey,
          preferredStartMs: null,
          slots: [],
          selectedSlot: null,
          hold: null,
        }),
      );
    },
    openEdit: (reservation) => {
      setState(
        createIdleFlowState({
          kind: "edit",
          reservationId: reservation.id,
          serviceKey: reservation.serviceKey,
          resourceKey: reservation.resourceKey,
          preferredStartMs: reservation.startMs,
          slots: [],
          selectedSlot: null,
          hold: null,
        }),
      );
    },
    openCancel: (reservationId) => {
      setState(createIdleFlowState({ kind: "cancel", reservationId }));
    },
    close: () => {
      if (state.pending) return;
      setState({ ...state, dialog: { kind: "closed" }, error: null });
    },
    updateBooking: (serviceKey, resourceKey) => {
      const dialog = state.dialog;
      if (dialog.kind !== "create" && dialog.kind !== "edit") return;
      setBooking({
        ...dialog,
        serviceKey,
        resourceKey,
        slots: [],
        selectedSlot: null,
        hold: null,
      });
    },
    selectSlot: (slot) => {
      const dialog = state.dialog;
      if (dialog.kind !== "create" && dialog.kind !== "edit") return;
      setBooking({ ...dialog, selectedSlot: slot, hold: null });
    },
    searchAvailability: async (domain) => {
      const dialog = state.dialog;
      if (
        (dialog.kind !== "create" && dialog.kind !== "edit") ||
        !startRequest()
      ) {
        return;
      }
      try {
        const result = customerResult.availability(
          await gateway.availableSlots({
            serviceKey: dialog.serviceKey,
            resourceKey: dialog.resourceKey,
            preferredStartMs: dialog.preferredStartMs,
            count: 8,
          }),
        );
        assertAvailabilityCoherence(result.slots, dialog, domain);
        finishRequest({
          dialog: {
            ...dialog,
            slots: result.slots,
            selectedSlot: null,
            hold: null,
          },
          notice: null,
        });
      } catch (error) {
        setState({
          ...state,
          dialog: {
            ...dialog,
            slots: [],
            selectedSlot: null,
            hold: null,
          },
          pending: false,
          error: normalizeCustomerReservationError(
            error instanceof Error ? error : ACTION_FAILED_ERROR,
          ),
        });
      }
    },
    createHold: async () => {
      const dialog = state.dialog;
      if (
        dialog.kind !== "create" ||
        dialog.selectedSlot === null ||
        !startRequest()
      ) {
        return;
      }
      try {
        const result = customerResult.hold(
          await gateway.createHold({
            serviceKey: dialog.selectedSlot.serviceKey,
            resourceKey: dialog.selectedSlot.resourceKey,
            startMs: dialog.selectedSlot.startMs,
          }),
        );
        finishRequest({
          dialog: {
            ...dialog,
            hold: {
              reservationId: result.publicContext.reservationId,
              expiresAtMs: result.holdExpiresAtMs,
            },
          },
          notice: "hold_created",
        });
      } catch (error) {
        failRequest(error instanceof Error ? error : ACTION_FAILED_ERROR);
      }
    },
    confirmHold: async (nowMs) => {
      const dialog = state.dialog;
      if (dialog.kind !== "create" || dialog.hold === null) return;
      if (isHoldExpired(dialog.hold.expiresAtMs, nowMs)) {
        recoverExpiredHold(dialog);
        return;
      }
      if (!startRequest()) return;
      try {
        customerResult.confirm(
          await gateway.confirmReservation({
            reservationId: dialog.hold.reservationId,
          }),
        );
        finishRequest({ dialog: { kind: "closed" }, notice: "confirmed" });
      } catch (error) {
        const normalized = normalizeCustomerReservationError(error);
        if (
          normalized === "hold_expired" ||
          normalized === "reservation_not_actionable"
        ) {
          recoverExpiredHold(dialog);
        } else {
          failRequest(error instanceof Error ? error : ACTION_FAILED_ERROR);
        }
      }
    },
    confirmExisting: async (reservationId, holdExpiresAtMs, nowMs) => {
      if (isHoldExpired(holdExpiresAtMs, nowMs)) {
        setState({ ...state, error: "hold_expired", notice: null });
        return;
      }
      if (!startRequest()) return;
      try {
        customerResult.confirm(
          await gateway.confirmReservation({ reservationId }),
        );
        finishRequest({ dialog: { kind: "closed" }, notice: "confirmed" });
      } catch (error) {
        const normalized = normalizeCustomerReservationError(error);
        if (
          normalized === "hold_expired" ||
          normalized === "reservation_not_actionable"
        ) {
          setState({
            ...state,
            pending: false,
            error: "hold_expired",
            notice: null,
          });
        } else {
          failRequest(error instanceof Error ? error : ACTION_FAILED_ERROR);
        }
      }
    },
    reschedule: async () => {
      const dialog = state.dialog;
      if (
        dialog.kind !== "edit" ||
        dialog.reservationId === null ||
        dialog.selectedSlot === null ||
        !startRequest()
      ) {
        return;
      }
      try {
        customerResult.reschedule(
          await gateway.rescheduleReservation({
            reservationId: dialog.reservationId,
            serviceKey: dialog.selectedSlot.serviceKey,
            resourceKey: dialog.selectedSlot.resourceKey,
            startMs: dialog.selectedSlot.startMs,
          }),
        );
        finishRequest({ dialog: { kind: "closed" }, notice: "rescheduled" });
      } catch (error) {
        failRequest(error instanceof Error ? error : ACTION_FAILED_ERROR);
      }
    },
    cancel: async () => {
      const dialog = state.dialog;
      if (dialog.kind !== "cancel" || !startRequest()) return;
      try {
        const result = customerResult.cancel(
          await gateway.cancelReservation({
            reservationId: dialog.reservationId,
          }),
        );
        finishRequest({
          dialog: { kind: "closed" },
          notice: result.escalated ? "cancel_escalated" : "cancelled",
        });
      } catch (error) {
        failRequest(error instanceof Error ? error : ACTION_FAILED_ERROR);
      }
    },
  };

  function recoverExpiredHold(dialog: FlowContract.BookingDraft) {
    setState({
      ...state,
      dialog: {
        ...dialog,
        slots: [],
        selectedSlot: null,
        hold: null,
      },
      pending: false,
      error: "hold_expired",
      notice: null,
    });
  }
}

function assertAvailabilityCoherence(
  slots: readonly import("@jeomwon/backend/src/agent-contract").PublicSlot[],
  request: FlowContract.BookingDraft,
  domain: import("@jeomwon/backend/src/agent-contract").DomainPublicSnapshot,
) {
  const service = domain.services.find(
    (entry) => entry.key === request.serviceKey,
  );
  if (!service) throw new TypeError("incoherent_availability_result");

  for (const slot of slots) {
    const resource = domain.resources.find(
      (entry) => entry.key === slot.resourceKey,
    );
    if (
      slot.serviceKey !== request.serviceKey ||
      (request.resourceKey !== null &&
        slot.resourceKey !== request.resourceKey) ||
      resource?.kind !== service.resourceKind
    ) {
      throw new TypeError("incoherent_availability_result");
    }
  }
}
