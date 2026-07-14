import type { CustomerReservation } from "@jeomwon/backend/src/agent-contract";
import type { CustomerReservationAction } from "./customer-reservation-controller";
import type { CustomerReservationFlow } from "./customer-reservation-flow";
import type { CustomerReservationCopy } from "./customer-reservation-view";

type ReservationActionButtonProps = {
  readonly action: CustomerReservationAction;
  readonly reservation: CustomerReservation;
  readonly flow: CustomerReservationFlow;
  readonly copy: CustomerReservationCopy;
  readonly disabled: boolean;
};

export function ReservationActionButton(props: ReservationActionButtonProps) {
  const { action, copy, disabled, flow, reservation } = props;
  const run = () => {
    switch (action) {
      case "confirm":
        void flow.confirmExisting(
          reservation.id,
          reservation.holdExpiresAtMs,
          Date.now(),
        );
        return;
      case "edit":
        flow.openEdit(reservation);
        return;
      case "cancel":
        flow.openCancel(reservation.id);
        return;
      default:
        return assertNever(action);
    }
  };
  return (
    <button
      className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
      disabled={disabled}
      onClick={run}
      type="button"
    >
      {actionLabel(copy, action)}
    </button>
  );
}

function actionLabel(
  copy: CustomerReservationCopy,
  action: CustomerReservationAction,
): string {
  switch (action) {
    case "confirm":
      return copy.confirm;
    case "edit":
      return copy.edit;
    case "cancel":
      return copy.cancel;
    default:
      return assertNever(action);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected reservation action: ${String(value)}`);
}
