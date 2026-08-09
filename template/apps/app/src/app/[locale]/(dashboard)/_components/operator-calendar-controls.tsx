"use client";

import type {
  AdminCustomerRescheduleArgs,
  AdminDashboardSnapshot,
  AdminReservationRef,
  AdminSessionCreateArgs,
  AdminSessionUpdateArgs,
} from "@jeomwon/backend/src/agent-contract";
import { Button } from "@jeomwon/ui/button";
import { Input } from "@jeomwon/ui/input";
import { CalendarPlus, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useScopedI18n } from "@/locales/client";
import {
  createOperatorCalendarController,
  type OperatorCalendarController,
  type OperatorCalendarErrorCode,
  type OperatorCalendarGateway,
  type OperatorCalendarState,
} from "./operator-calendar-controller";
import { useOperatorCalendarGateway } from "./operator-calendar-gateway";

export type OperatorCalendarCopy = {
  title: string;
  description: string;
  create: string;
  edit: string;
  reschedule: string;
  cancel: string;
  confirmCancel: string;
  close: string;
  save: string;
  pending: string;
  empty: string;
  sessionTitle: string;
  service: string;
  resource: string;
  date: string;
  time: string;
  errors: Record<OperatorCalendarErrorCode, string>;
};

export const operatorCalendarCopyEn: OperatorCalendarCopy = {
  title: "Calendar controls",
  description: "Create store sessions and safely manage upcoming bookings.",
  create: "Create session",
  edit: "Edit session",
  reschedule: "Reschedule",
  cancel: "Cancel",
  confirmCancel: "Confirm cancellation",
  close: "Close",
  save: "Save",
  pending: "Working",
  empty: "No active calendar entries to manage.",
  sessionTitle: "Session title",
  service: "Service",
  resource: "Resource",
  date: "Date",
  time: "Start time",
  errors: {
    operator_crud_disabled: "Calendar editing is not enabled.",
    admin_forbidden: "You do not have permission to change this calendar.",
    slot_unavailable: "That time is no longer available.",
    outside_business_hours: "Choose a time within business hours.",
    invalid_session: "Check the session details and try again.",
    reservation_not_found: "That reservation could not be found.",
  },
};

export const operatorCalendarCopyKo: OperatorCalendarCopy = {
  title: "캘린더 관리",
  description: "운영 일정을 만들고 다가오는 예약을 안전하게 관리합니다.",
  create: "일정 만들기",
  edit: "일정 수정",
  reschedule: "시간 변경",
  cancel: "취소",
  confirmCancel: "취소 확정",
  close: "닫기",
  save: "저장",
  pending: "처리 중",
  empty: "관리할 활성 캘린더 일정이 없습니다.",
  sessionTitle: "일정 제목",
  service: "서비스",
  resource: "리소스",
  date: "날짜",
  time: "시작 시간",
  errors: {
    operator_crud_disabled: "캘린더 편집 기능이 꺼져 있습니다.",
    admin_forbidden: "이 캘린더를 변경할 권한이 없습니다.",
    slot_unavailable: "이미 사용 중인 시간입니다.",
    outside_business_hours: "영업시간 안의 시간을 선택해 주세요.",
    invalid_session: "일정 정보를 확인한 뒤 다시 시도해 주세요.",
    reservation_not_found: "예약을 찾을 수 없습니다.",
  },
};

type Editor =
  | { readonly kind: "create" }
  | { readonly kind: "updateOperator"; readonly reservationId: string }
  | { readonly kind: "rescheduleCustomer"; readonly reservationId: string }
  | { readonly kind: "cancel"; readonly reservationId: string }
  | null;

type ActionResult = undefined | boolean | Promise<void> | Promise<boolean>;

export function OperatorCalendarControls({
  snapshot,
}: {
  snapshot: AdminDashboardSnapshot;
}) {
  const gateway = useOperatorCalendarGateway();
  return (
    <ConnectedOperatorCalendarControls gateway={gateway} snapshot={snapshot} />
  );
}

export function ConnectedOperatorCalendarControls({
  gateway,
  snapshot,
  copy,
}: {
  gateway: OperatorCalendarGateway;
  snapshot: AdminDashboardSnapshot;
  copy?: OperatorCalendarCopy;
}) {
  const t = useScopedI18n("dashboard.operatorCalendar");
  const [controller] = useState<OperatorCalendarController>(() =>
    createOperatorCalendarController(gateway),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const localizedCopy = copy ?? {
    title: t("title"),
    description: t("description"),
    create: t("create"),
    edit: t("edit"),
    reschedule: t("reschedule"),
    cancel: t("cancel"),
    confirmCancel: t("confirmCancel"),
    close: t("close"),
    save: t("save"),
    pending: t("pending"),
    empty: t("empty"),
    sessionTitle: t("sessionTitle"),
    service: t("service"),
    resource: t("resource"),
    date: t("date"),
    time: t("time"),
    errors: {
      operator_crud_disabled: t("errors.operator_crud_disabled"),
      admin_forbidden: t("errors.admin_forbidden"),
      slot_unavailable: t("errors.slot_unavailable"),
      outside_business_hours: t("errors.outside_business_hours"),
      invalid_session: t("errors.invalid_session"),
      reservation_not_found: t("errors.reservation_not_found"),
    },
  };

  async function succeeded(request: Promise<void>) {
    await request;
    return controller.getSnapshot().error === null;
  }

  return (
    <OperatorCalendarControlsView
      copy={localizedCopy}
      snapshot={snapshot}
      state={state}
      onCreate={(args) => succeeded(controller.create(args))}
      onUpdateOperator={(args) => succeeded(controller.updateOperator(args))}
      onRescheduleCustomer={(args) =>
        succeeded(controller.rescheduleCustomer(args))
      }
      onCancel={(args) => succeeded(controller.cancel(args))}
    />
  );
}

export function OperatorCalendarControlsView({
  copy,
  initialEditor = null,
  snapshot,
  state,
  onCancel,
  onCreate,
  onRescheduleCustomer,
  onUpdateOperator,
}: {
  copy: OperatorCalendarCopy;
  initialEditor?: Editor;
  snapshot: AdminDashboardSnapshot;
  state: OperatorCalendarState;
  onCancel: (args: AdminReservationRef) => ActionResult;
  onCreate: (args: AdminSessionCreateArgs) => ActionResult;
  onRescheduleCustomer: (args: AdminCustomerRescheduleArgs) => ActionResult;
  onUpdateOperator: (args: AdminSessionUpdateArgs) => ActionResult;
}) {
  const [editor, setEditor] = useState<Editor>(initialEditor);
  const sectionRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const enabled =
    snapshot.domain.adminWidget === "calendar" &&
    snapshot.domain.features.operatorCalendarCrud;
  const permissionDenied = state.error === "admin_forbidden";

  useEffect(() => {
    if (editor) {
      editorRef.current
        ?.querySelector<HTMLElement>("input, select, button")
        ?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      if (triggerRef.current?.isConnected) {
        triggerRef.current.focus();
      } else {
        sectionRef.current
          ?.querySelector<HTMLElement>(
            "[data-testid=operator-calendar-create]",
          )
          ?.focus();
      }
    }
  }, [editor]);

  if (!enabled) return null;

  const activeRows = snapshot.reservations.filter(
    (reservation) =>
      reservation.status === "confirmed" ||
      reservation.status === "rescheduled",
  );
  const selected =
    editor && "reservationId" in editor
      ? snapshot.reservations.find((row) => row.id === editor.reservationId)
      : undefined;

  function openEditor(next: Exclude<Editor, null>, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setEditor(next);
  }

  function closeEditor() {
    restoreFocusRef.current = true;
    setEditor(null);
  }

  async function submitForm(form: HTMLFormElement) {
    if (!editor || editor.kind === "cancel") return;
    const values = new FormData(form);
    const slot = {
      serviceKey: String(values.get("serviceKey") ?? ""),
      resourceKey: String(values.get("resourceKey") ?? ""),
      dateKey: String(values.get("dateKey") ?? ""),
      startTime: String(values.get("startTime") ?? ""),
    };
    let success: boolean;
    if (editor.kind === "create") {
      success =
        (await onCreate({
          ...slot,
          title: String(values.get("title") ?? ""),
        })) !== false;
    } else if (editor.kind === "updateOperator") {
      success =
        (await onUpdateOperator({
          ...slot,
          reservationId: editor.reservationId,
          title: String(values.get("title") ?? ""),
        })) !== false;
    } else {
      success =
        (await onRescheduleCustomer({
          ...slot,
          reservationId: editor.reservationId,
        })) !== false;
    }
    if (success) closeEditor();
  }

  return (
    <section
      className="rounded-lg border border-border bg-card"
      aria-busy={state.pending}
      ref={sectionRef}
    >
      <div className="flex flex-col gap-4 border-border border-b p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <CalendarPlus aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-card-foreground text-lg">
              {copy.title}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {copy.description}
            </p>
          </div>
        </div>
        <Button
          className="min-h-11 sm:min-h-9"
          data-testid="operator-calendar-create"
          disabled={state.pending}
          size="sm"
          type="button"
          onClick={(event) =>
            openEditor({ kind: "create" }, event.currentTarget)
          }
        >
          <CalendarPlus aria-hidden="true" className="mr-2 h-4 w-4" />
          {copy.create}
        </Button>
      </div>

      {state.error ? (
        <p
          className="mx-5 mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          data-testid="operator-calendar-error"
          role="alert"
        >
          {copy.errors[state.error]}
        </p>
      ) : null}

      {editor ? (
        <div className="border-border border-b bg-muted/40 p-5" ref={editorRef}>
          {editor.kind === "cancel" ? (
            <div
              data-testid="operator-calendar-form"
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="font-medium text-foreground text-sm">
                {copy.confirmCancel}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={closeEditor}
                >
                  {copy.close}
                </Button>
                <Button
                  disabled={state.pending}
                  size="sm"
                  type="button"
                  variant="destructive"
                  onClick={async () => {
                    const success = await onCancel({
                      reservationId: editor.reservationId,
                    });
                    if (success !== false) closeEditor();
                  }}
                >
                  {state.pending ? copy.pending : copy.confirmCancel}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="grid gap-4"
              data-testid="operator-calendar-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitForm(event.currentTarget);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {editor.kind !== "rescheduleCustomer" ? (
                  <Field id="operator-session-title" label={copy.sessionTitle}>
                    <Input
                      disabled={permissionDenied}
                      id="operator-session-title"
                      name="title"
                      required
                      defaultValue={selected?.displayName ?? ""}
                    />
                  </Field>
                ) : null}
                <Field id="operator-session-service" label={copy.service}>
                  <select
                    disabled={permissionDenied}
                    id="operator-session-service"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    defaultValue={selected?.serviceKey}
                    name="serviceKey"
                    required
                  >
                    {snapshot.domain.services.map((service) => (
                      <option key={service.key} value={service.key}>
                        {service.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="operator-session-resource" label={copy.resource}>
                  <select
                    disabled={permissionDenied}
                    id="operator-session-resource"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    defaultValue={selected?.resourceKey}
                    name="resourceKey"
                    required
                  >
                    {snapshot.domain.resources.map((resource) => (
                      <option key={resource.key} value={resource.key}>
                        {resource.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="operator-session-date" label={copy.date}>
                  <Input
                    disabled={permissionDenied}
                    id="operator-session-date"
                    name="dateKey"
                    required
                    type="date"
                    defaultValue={
                      selected
                        ? datePart(
                            selected.startMs,
                            snapshot.domain.storeTimezone,
                          )
                        : undefined
                    }
                  />
                </Field>
                <Field id="operator-session-time" label={copy.time}>
                  <Input
                    disabled={permissionDenied}
                    id="operator-session-time"
                    name="startTime"
                    required
                    type="time"
                    defaultValue={
                      selected
                        ? timePart(
                            selected.startMs,
                            snapshot.domain.storeTimezone,
                          )
                        : undefined
                    }
                  />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={closeEditor}
                >
                  {copy.close}
                </Button>
                <Button
                  disabled={state.pending || permissionDenied}
                  size="sm"
                  type="submit"
                >
                  {state.pending ? copy.pending : copy.save}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {activeRows.length === 0 ? (
        <p
          className="px-5 py-8 text-center text-muted-foreground text-sm"
          data-testid="operator-calendar-empty"
        >
          {copy.empty}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {activeRows.map((reservation) => (
            <li
              className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={reservation.id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground text-sm">
                  {reservation.serviceLabel} · {reservation.resourceLabel}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {reservation.timeWindow}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {reservation.origin === "operator" ? (
                  <Button
                    className="min-h-11 sm:min-h-9"
                    data-testid={`operator-session-${reservation.id}-edit`}
                    disabled={state.pending}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={(event) =>
                      openEditor(
                        {
                          kind: "updateOperator",
                          reservationId: reservation.id,
                        },
                        event.currentTarget,
                      )
                    }
                  >
                    <Pencil aria-hidden="true" className="mr-2 h-4 w-4" />
                    {copy.edit}
                  </Button>
                ) : (
                  <Button
                    className="min-h-11 sm:min-h-9"
                    data-testid={`reservation-${reservation.id}-reschedule`}
                    disabled={state.pending}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={(event) =>
                      openEditor(
                        {
                          kind: "rescheduleCustomer",
                          reservationId: reservation.id,
                        },
                        event.currentTarget,
                      )
                    }
                  >
                    <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />
                    {copy.reschedule}
                  </Button>
                )}
                <Button
                  className="min-h-11 sm:min-h-9"
                  data-testid={`reservation-${reservation.id}-cancel`}
                  disabled={state.pending}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={(event) =>
                    openEditor(
                      { kind: "cancel", reservationId: reservation.id },
                      event.currentTarget,
                    )
                  }
                >
                  <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
                  {copy.cancel}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({
  children,
  id,
  label,
}: {
  children: React.ReactNode;
  id: string;
  label: string;
}) {
  return (
    <div className="grid gap-1.5 text-foreground text-sm">
      <label className="font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function dateTimeParts(timestampMs: number, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(timestampMs)
      .map((part) => [part.type, part.value]),
  );
}

function datePart(timestampMs: number, timeZone: string) {
  const parts = dateTimeParts(timestampMs, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function timePart(timestampMs: number, timeZone: string) {
  const parts = dateTimeParts(timestampMs, timeZone);
  return `${parts.hour}:${parts.minute}`;
}
