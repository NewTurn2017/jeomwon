import type {
  CustomerReservation,
  CustomerSnapshot,
  ReservationStatus,
} from "@jeomwon/backend/src/agent-contract";
import { ReservationActionButton } from "./customer-reservation-actions";
import { useReservationNow } from "./customer-reservation-clock";
import {
  isHistoryStatus,
  reservationActions,
} from "./customer-reservation-controller";
import { CustomerReservationDialogs } from "./customer-reservation-dialogs";
import type {
  CustomerReservationFlow,
  CustomerReservationFlowState,
} from "./customer-reservation-flow";

export type CustomerReservationCopy = {
  readonly title: string;
  readonly newReservation: string;
  readonly activeTitle: string;
  readonly historyTitle: string;
  readonly empty: string;
  readonly historyEmpty: string;
  readonly confirm: string;
  readonly edit: string;
  readonly cancel: string;
  readonly createTitle: string;
  readonly editTitle: string;
  readonly cancelTitle: string;
  readonly service: string;
  readonly resource: string;
  readonly allResources: string;
  readonly search: string;
  readonly noSlots: string;
  readonly createHold: string;
  readonly confirmHold: string;
  readonly reschedule: string;
  readonly cancelPrompt: string;
  readonly close: string;
  readonly pending: string;
  readonly holdCreated: string;
  readonly expiredPrompt: string;
  readonly confirmedNotice: string;
  readonly rescheduledNotice: string;
  readonly cancelledNotice: string;
  readonly escalatedNotice: string;
  readonly collisionError: string;
  readonly unavailableError: string;
  readonly genericError: string;
  readonly status: Readonly<Record<ReservationStatus, string>>;
};

export type CustomerReservationViewProps = {
  readonly snapshot: CustomerSnapshot;
  readonly state: CustomerReservationFlowState;
  readonly flow: CustomerReservationFlow;
  readonly copy: CustomerReservationCopy;
};

export function CustomerReservationView({
  copy,
  flow,
  snapshot,
  state,
}: CustomerReservationViewProps) {
  const deadlines = snapshot.reservations.flatMap((reservation) =>
    reservation.status === "held" && reservation.holdExpiresAtMs !== null
      ? [reservation.holdExpiresAtMs]
      : [],
  );
  if (
    (state.dialog.kind === "create" || state.dialog.kind === "edit") &&
    state.dialog.hold !== null
  ) {
    deadlines.push(state.dialog.hold.expiresAtMs);
  }
  const nowMs = useReservationNow(snapshot.generatedAtMs, deadlines);
  const active = snapshot.reservations.filter(
    (reservation) => !isHistoryStatus(reservation.status),
  );
  const history = snapshot.reservations.filter((reservation) =>
    isHistoryStatus(reservation.status),
  );
  const firstService = snapshot.domain.services[0];

  return (
    <section aria-label={copy.title} className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-xl">{copy.title}</h2>
        <button
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50"
          disabled={firstService === undefined || state.pending}
          onClick={() =>
            firstService && flow.openCreate(firstService.key, null)
          }
          type="button"
        >
          {copy.newReservation}
        </button>
      </div>
      <StateMessage copy={copy} state={state} />
      <ReservationGroup
        copy={copy}
        empty={copy.empty}
        flow={flow}
        reservations={active}
        title={copy.activeTitle}
        nowMs={nowMs}
      />
      <ReservationGroup
        copy={copy}
        empty={copy.historyEmpty}
        flow={flow}
        reservations={history}
        title={copy.historyTitle}
        nowMs={nowMs}
      />
      <CustomerReservationDialogs
        copy={copy}
        flow={flow}
        snapshot={snapshot}
        state={state}
        nowMs={nowMs}
      />
    </section>
  );
}

type ReservationGroupProps = {
  readonly title: string;
  readonly empty: string;
  readonly reservations: readonly CustomerReservation[];
  readonly flow: CustomerReservationFlow;
  readonly copy: CustomerReservationCopy;
  readonly nowMs: number;
};

function ReservationGroup({
  copy,
  empty,
  flow,
  nowMs,
  reservations,
  title,
}: ReservationGroupProps) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <h3 className="border-border border-b px-4 py-3 font-semibold">
        {title}
      </h3>
      {reservations.length === 0 ? (
        <p className="px-4 py-8 text-center text-muted-foreground text-sm">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {reservations.map((reservation) => (
            <li
              className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={reservation.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">
                    {reservation.serviceLabel}
                  </p>
                  <span className="rounded-full border px-2 py-0.5 text-xs">
                    {copy.status[reservation.status]}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">
                  {reservation.timeWindow} · {reservation.resourceLabel}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {reservationActions(reservation, nowMs).map((action) => (
                  <ReservationActionButton
                    action={action}
                    copy={copy}
                    disabled={statePending(flow)}
                    flow={flow}
                    key={action}
                    reservation={reservation}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StateMessage({
  copy,
  state,
}: Pick<CustomerReservationViewProps, "copy" | "state">) {
  const message = state.error
    ? errorMessage(copy, state.error)
    : state.notice
      ? noticeMessage(copy, state.notice)
      : null;
  return message ? (
    <p
      aria-live="polite"
      className="rounded-md border border-border bg-card px-4 py-3 text-sm"
    >
      {message}
    </p>
  ) : null;
}

function errorMessage(copy: CustomerReservationCopy, error: string) {
  if (error === "hold_expired") return copy.expiredPrompt;
  if (error === "collision") return copy.collisionError;
  if (error === "service_not_found" || error === "resource_not_found")
    return copy.unavailableError;
  return copy.genericError;
}

function noticeMessage(copy: CustomerReservationCopy, notice: string) {
  if (notice === "confirmed") return copy.confirmedNotice;
  if (notice === "rescheduled") return copy.rescheduledNotice;
  if (notice === "cancelled") return copy.cancelledNotice;
  if (notice === "cancel_escalated") return copy.escalatedNotice;
  if (notice === "hold_created") return copy.holdCreated;
  return null;
}

function statePending(flow: CustomerReservationFlow): boolean {
  return flow.getState().pending;
}
