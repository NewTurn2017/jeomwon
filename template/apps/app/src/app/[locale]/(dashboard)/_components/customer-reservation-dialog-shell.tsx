import { type RefObject, useEffect, useRef } from "react";
import type { CustomerReservationFlow } from "./customer-reservation-flow";

type DialogShellProps = {
  readonly children: React.ReactNode;
  readonly closeLabel: string;
  readonly labelledBy: string;
  readonly pending: boolean;
  readonly flow: CustomerReservationFlow;
  readonly initialFocusRef: RefObject<HTMLElement | null>;
};

export function DialogShell(props: DialogShellProps) {
  const { children, closeLabel, flow, initialFocusRef, labelledBy, pending } =
    props;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = focusableDialogElements(dialog);
    const requestedInitialFocus = initialFocusRef.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return activateDialogFocusLifecycle({
      backgroundElements: collectBackgroundElements(dialog),
      initialFocus:
        requestedInitialFocus && focusables.includes(requestedInitialFocus)
          ? requestedInitialFocus
          : (focusables[0] ?? dialog),
      opener,
    });
  }, [initialFocusRef, labelledBy]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (pending && dialog && focusableDialogElements(dialog).length === 0) {
      dialog.focus();
    }
  }, [pending]);

  return (
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          const focusables = focusableDialogElements(event.currentTarget);
          if (
            containDialogTab(
              focusables,
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null,
              event.shiftKey,
              event.currentTarget,
            )
          ) {
            event.preventDefault();
          }
        }
        if (shouldCloseReservationDialog(event.key) && !pending) flow.close();
      }}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="grid max-h-[90vh] w-full max-w-lg gap-4 overflow-y-auto rounded-xl bg-background p-5 shadow-xl">
        {children}
        <button
          className="rounded-md border px-4 py-2 text-sm"
          disabled={pending}
          onClick={flow.close}
          type="button"
        >
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

export function shouldCloseReservationDialog(key: string): boolean {
  return key === "Escape";
}

type FocusTarget = {
  readonly isConnected?: boolean;
  focus(): void;
};

type IsolationTarget = FocusTarget & {
  inert: boolean;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
};

export function containDialogTab(
  focusables: readonly FocusTarget[],
  activeElement: FocusTarget | null,
  shiftKey: boolean,
  emptyFallback?: FocusTarget,
): boolean {
  const first = focusables[0];
  const last = focusables.at(-1);
  if (!first || !last) {
    if (!emptyFallback) return false;
    emptyFallback.focus();
    return true;
  }
  const activeIndex = activeElement ? focusables.indexOf(activeElement) : -1;
  const target = shiftKey
    ? activeIndex <= 0
      ? last
      : null
    : activeIndex === -1 || activeIndex === focusables.length - 1
      ? first
      : null;
  if (!target) return false;
  target.focus();
  return true;
}

export function activateDialogFocusLifecycle(options: {
  readonly backgroundElements: readonly IsolationTarget[];
  readonly initialFocus: FocusTarget | null;
  readonly opener: FocusTarget | null;
}): () => void {
  const previous = options.backgroundElements.map((element) => ({
    element,
    inert: element.inert,
    ariaHidden: element.getAttribute("aria-hidden"),
  }));
  for (const { element } of previous) {
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
  }
  options.initialFocus?.focus();

  return () => {
    for (const { ariaHidden, element, inert } of previous) {
      element.inert = inert;
      if (ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", ariaHidden);
    }
    if (options.opener?.isConnected !== false) options.opener?.focus();
  };
}

function focusableDialogElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true",
  );
}

function collectBackgroundElements(dialog: HTMLElement): HTMLElement[] {
  const background = new Set<HTMLElement>();
  let branch: HTMLElement = dialog;
  while (branch.parentElement && branch !== document.body) {
    const parent = branch.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== branch && sibling instanceof HTMLElement) {
        background.add(sibling);
      }
    }
    branch = parent;
  }
  return [...background];
}
