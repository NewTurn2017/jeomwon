import { describe, expect, test } from "bun:test";
import {
  activateDialogFocusLifecycle,
  containDialogTab,
} from "./customer-reservation-dialog-shell";

describe("customer reservation dialog focus lifecycle", () => {
  test("Given focus reaches either edge When Tab continues Then focus wraps in both directions", () => {
    const focused: string[] = [];
    const first = target("first", focused);
    const middle = target("middle", focused);
    const last = target("last", focused);
    const focusables = [first, middle, last];

    expect(containDialogTab(focusables, last, false)).toBe(true);
    expect(containDialogTab(focusables, first, true)).toBe(true);
    expect(focused).toEqual(["first", "last"]);
  });

  test("Given a pending dialog has no enabled controls When Tab moves in either direction Then focus is retained on its root", () => {
    const focused: string[] = [];
    const root = target("root", focused);

    expect(containDialogTab([], root, false, root)).toBe(true);
    expect(containDialogTab([], root, true, root)).toBe(true);
    expect(focused).toEqual(["root", "root"]);
  });

  test("Given a dialog opens over page content When it closes Then background isolation and opener focus are restored", () => {
    const focused: string[] = [];
    const opener = target("opener", focused);
    const initialFocus = target("initial", focused);
    const background = isolationTarget("background", focused);

    const cleanup = activateDialogFocusLifecycle({
      backgroundElements: [background],
      initialFocus,
      opener,
    });

    expect(background.inert).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");
    expect(focused).toEqual(["initial"]);

    cleanup();

    expect(background.inert).toBe(false);
    expect(background.getAttribute("aria-hidden")).toBe(null);
    expect(focused).toEqual(["initial", "opener"]);
  });
});

function target(name: string, focused: string[]) {
  return {
    isConnected: true,
    focus: () => focused.push(name),
  };
}

function isolationTarget(name: string, focused: string[]) {
  const attributes = new Map<string, string>();
  return {
    ...target(name, focused),
    inert: false,
    getAttribute: (attribute: string) => attributes.get(attribute) ?? null,
    removeAttribute: (attribute: string) => attributes.delete(attribute),
    setAttribute: (attribute: string, value: string) => {
      attributes.set(attribute, value);
    },
  };
}
