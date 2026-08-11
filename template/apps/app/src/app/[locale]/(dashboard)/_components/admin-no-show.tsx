"use client";

import type {
  AdminNoShowResult,
  AdminReservation,
  AdminReservationRef,
} from "@jeomwon/backend/src/agent-contract";
import { Button } from "@jeomwon/ui/button";
import { UserX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type AdminNoShowError =
  | "no_show_disabled"
  | "no_show_future"
  | "no_show_wrong_status"
  | "no_show_already_marked"
  | "reservation_not_found"
  | "auth_required"
  | "admin_forbidden"
  | "unknown";

export type AdminNoShowCopy = {
  mark: string;
  title: string;
  irreversible: string;
  cancel: string;
  confirm: string;
  pending: string;
  errors: Record<AdminNoShowError, string>;
};

type MarkNoShow = (args: AdminReservationRef) => Promise<AdminNoShowResult>;

export function isNoShowActionVisible(
  reservation: AdminReservation,
  enabled: boolean,
  generatedAtMs: number,
) {
  return (
    enabled &&
    reservation.startMs <= generatedAtMs &&
    (reservation.status === "confirmed" || reservation.status === "rescheduled")
  );
}

export function submitNoShow(mark: MarkNoShow, reservationId: string) {
  return mark({ reservationId });
}

export function createAdminNoShowSubmitter(
  mark: MarkNoShow,
  onPending: (pending: boolean) => void = () => undefined,
) {
  let active = false;
  return async (reservationId: string) => {
    if (active) return null;
    active = true;
    onPending(true);
    try {
      return await submitNoShow(mark, reservationId);
    } finally {
      active = false;
      onPending(false);
    }
  };
}

export function useAdminNoShowSubmission(mark: MarkNoShow) {
  const [pending, setPending] = useState(false);
  const markRef = useRef(mark);
  markRef.current = mark;
  const submitterRef = useRef<ReturnType<
    typeof createAdminNoShowSubmitter
  > | null>(null);
  if (submitterRef.current === null) {
    submitterRef.current = createAdminNoShowSubmitter(
      (args) => markRef.current(args),
      setPending,
    );
  }
  const submit = useCallback(
    (reservationId: string) => submitterRef.current?.(reservationId) ?? null,
    [],
  );
  return { pending, submit };
}

export function noShowErrorCode(error: unknown): AdminNoShowError {
  const message = error instanceof Error ? error.message : String(error);
  const codes: AdminNoShowError[] = [
    "no_show_disabled",
    "no_show_future",
    "no_show_wrong_status",
    "no_show_already_marked",
    "reservation_not_found",
    "auth_required",
    "admin_forbidden",
  ];
  return codes.find((code) => message.includes(code)) ?? "unknown";
}

export function AdminNoShowAction({
  copy,
  enabled,
  error,
  generatedAtMs,
  reservation,
  confirming,
  pending,
  onCancel,
  onConfirm,
  onOpen,
}: {
  copy: AdminNoShowCopy;
  enabled: boolean;
  error: AdminNoShowError | null;
  generatedAtMs: number;
  reservation: AdminReservation;
  confirming: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onOpen: () => void;
}) {
  const markRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) {
      wasConfirming.current = true;
      confirmRef.current?.focus();
    } else if (wasConfirming.current) {
      wasConfirming.current = false;
      markRef.current?.focus();
    }
  }, [confirming]);

  if (!isNoShowActionVisible(reservation, enabled, generatedAtMs)) return null;

  return (
    <div className="mt-3 grid justify-items-start gap-2 lg:justify-items-end">
      {error ? (
        <p
          className="max-w-xs rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs"
          role="alert"
        >
          {copy.errors[error]}
        </p>
      ) : null}
      {confirming ? (
        <div
          aria-label={copy.title}
          className="max-w-xs rounded-md border border-destructive/30 bg-background p-3 text-left"
          role="alertdialog"
        >
          <p className="font-medium text-foreground text-sm">{copy.title}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {copy.irreversible}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              data-testid="cancel-no-show"
              disabled={pending}
              size="sm"
              type="button"
              variant="outline"
              onClick={onCancel}
            >
              {copy.cancel}
            </Button>
            <Button
              data-testid="confirm-no-show"
              disabled={pending}
              ref={confirmRef}
              size="sm"
              type="button"
              variant="destructive"
              onClick={onConfirm}
            >
              {pending ? copy.pending : copy.confirm}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          data-testid="mark-no-show"
          disabled={pending}
          ref={markRef}
          size="sm"
          type="button"
          variant="outline"
          onClick={onOpen}
        >
          <UserX aria-hidden="true" className="mr-2 h-4 w-4" />
          {copy.mark}
        </Button>
      )}
    </div>
  );
}
