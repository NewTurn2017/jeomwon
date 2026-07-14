import type { CustomerSnapshot } from "@jeomwon/backend/src/agent-contract";
import { useRef } from "react";
import {
  compatibleResourceKey,
  compatibleResources,
  isHoldExpired,
} from "./customer-reservation-controller";
import { DialogShell } from "./customer-reservation-dialog-shell";
import type {
  BookingDraft,
  CustomerReservationFlow,
  CustomerReservationFlowState,
} from "./customer-reservation-flow";
import type { CustomerReservationCopy } from "./customer-reservation-view";

type DialogProps = {
  readonly snapshot: CustomerSnapshot;
  readonly state: CustomerReservationFlowState;
  readonly flow: CustomerReservationFlow;
  readonly copy: CustomerReservationCopy;
  readonly nowMs: number;
};

export function CustomerReservationDialogs(props: DialogProps) {
  const { dialog } = props.state;
  switch (dialog.kind) {
    case "closed":
      return null;
    case "cancel":
      return <CancelDialog {...props} />;
    case "create":
    case "edit":
      return <BookingDialog {...props} dialog={dialog} />;
    default:
      return assertNever(dialog);
  }
}

function BookingDialog({
  copy,
  dialog,
  flow,
  nowMs,
  snapshot,
  state,
}: DialogProps & { readonly dialog: BookingDraft }) {
  const initialFocus = useRef<HTMLSelectElement>(null);
  const titleId = `customer-${dialog.kind}-title`;
  const resources = compatibleResources(snapshot.domain, dialog.serviceKey);
  const holdExpired =
    dialog.hold !== null && isHoldExpired(dialog.hold.expiresAtMs, nowMs);

  return (
    <DialogShell
      closeLabel={copy.close}
      flow={flow}
      initialFocusRef={initialFocus}
      labelledBy={titleId}
      pending={state.pending}
    >
      <h2 className="font-semibold text-lg" id={titleId} tabIndex={-1}>
        {bookingTitle(copy, dialog)}
      </h2>
      <label className="grid gap-1 text-sm">
        <span>{copy.service}</span>
        <select
          disabled={state.pending || dialog.hold !== null}
          onChange={(event) => {
            const serviceKey = event.currentTarget.value;
            flow.updateBooking(
              serviceKey,
              compatibleResourceKey(
                snapshot.domain,
                serviceKey,
                dialog.resourceKey,
              ),
            );
          }}
          ref={initialFocus}
          value={dialog.serviceKey}
        >
          {snapshot.domain.services.map((service) => (
            <option key={service.key} value={service.key}>
              {service.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>{copy.resource}</span>
        <select
          disabled={state.pending || dialog.hold !== null}
          onChange={(event) =>
            flow.updateBooking(
              dialog.serviceKey,
              event.currentTarget.value || null,
            )
          }
          value={dialog.resourceKey ?? ""}
        >
          <option value="">{copy.allResources}</option>
          {resources.map((resource) => (
            <option key={resource.key} value={resource.key}>
              {resource.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="rounded-md border px-3 py-2 text-sm"
        disabled={state.pending || dialog.hold !== null}
        onClick={() => void flow.searchAvailability(snapshot.domain)}
        type="button"
      >
        {state.pending ? copy.pending : copy.search}
      </button>
      {dialog.slots.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.noSlots}</p>
      ) : (
        <fieldset className="grid max-h-48 gap-2 overflow-y-auto">
          <legend className="sr-only">{copy.search}</legend>
          {dialog.slots.map((slot) => (
            <button
              aria-pressed={dialog.selectedSlot?.startMs === slot.startMs}
              className="rounded-md border p-3 text-left text-sm"
              disabled={state.pending || dialog.hold !== null}
              key={`${slot.resourceKey}-${slot.startMs}`}
              onClick={() => flow.selectSlot(slot)}
              type="button"
            >
              {slot.timeWindow} · {slot.resourceLabel}
            </button>
          ))}
        </fieldset>
      )}
      {dialog.kind === "create" ? (
        <CreateFooter
          copy={copy}
          dialog={dialog}
          domain={snapshot.domain}
          flow={flow}
          holdExpired={holdExpired}
          pending={state.pending}
        />
      ) : (
        <button
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={state.pending || dialog.selectedSlot === null}
          onClick={() => void flow.reschedule()}
          type="button"
        >
          {state.pending ? copy.pending : copy.reschedule}
        </button>
      )}
    </DialogShell>
  );
}

type CreateFooterProps = {
  readonly dialog: BookingDraft;
  readonly flow: CustomerReservationFlow;
  readonly copy: CustomerReservationCopy;
  readonly pending: boolean;
  readonly holdExpired: boolean;
  readonly domain: CustomerSnapshot["domain"];
};

function CreateFooter(props: CreateFooterProps) {
  const { copy, dialog, domain, flow, holdExpired, pending } = props;
  if (dialog.hold === null) {
    return (
      <button
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        disabled={pending || dialog.selectedSlot === null}
        onClick={() => void flow.createHold()}
        type="button"
      >
        {pending ? copy.pending : copy.createHold}
      </button>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        {holdExpired ? copy.expiredPrompt : copy.holdCreated}
      </p>
      <button
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        disabled={pending || holdExpired}
        onClick={() => void flow.confirmHold(Date.now())}
        type="button"
      >
        {pending ? copy.pending : copy.confirmHold}
      </button>
      {holdExpired ? (
        <button
          className="rounded-md border px-3 py-2 text-sm"
          onClick={() => void retryExpiredHold(flow, dialog, domain)}
          type="button"
        >
          {copy.search}
        </button>
      ) : null}
    </div>
  );
}

export async function retryExpiredHold(
  flow: CustomerReservationFlow,
  dialog: BookingDraft,
  domain: CustomerSnapshot["domain"],
) {
  flow.updateBooking(dialog.serviceKey, dialog.resourceKey);
  await flow.searchAvailability(domain);
}

function CancelDialog({ copy, flow, state }: DialogProps) {
  const initialFocus = useRef<HTMLButtonElement>(null);
  return (
    <DialogShell
      closeLabel={copy.close}
      flow={flow}
      initialFocusRef={initialFocus}
      labelledBy="customer-cancel-title"
      pending={state.pending}
    >
      <h2
        className="font-semibold text-lg"
        id="customer-cancel-title"
        tabIndex={-1}
      >
        {copy.cancelTitle}
      </h2>
      <p className="text-sm">{copy.cancelPrompt}</p>
      <button
        className="rounded-md bg-destructive px-4 py-2 text-destructive-foreground disabled:opacity-50"
        disabled={state.pending}
        onClick={() => void flow.cancel()}
        ref={initialFocus}
        type="button"
      >
        {state.pending ? copy.pending : copy.cancel}
      </button>
    </DialogShell>
  );
}

function bookingTitle(copy: CustomerReservationCopy, dialog: BookingDraft) {
  switch (dialog.kind) {
    case "create":
      return copy.createTitle;
    case "edit":
      return copy.editTitle;
    default:
      return assertNever(dialog.kind);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected dialog: ${String(value)}`);
}
