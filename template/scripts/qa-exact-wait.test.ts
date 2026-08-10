import { describe, expect, test } from "bun:test";
import { createExactSignalWait } from "../packages/backend/src/qa-exact-wait";

type Signal = { readonly kind: "email" | "waitlist" | "hold" };

function signalSource() {
  const listeners = new Set<(value: Signal) => void>();
  return {
    emit: (value: Signal) => {
      for (const listener of listeners) listener(value);
    },
    subscribe: (listener: (value: Signal) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listenerCount: () => listeners.size,
  };
}

describe("exact QA signal waits", () => {
  test.each([
    "email",
    "waitlist",
    "hold",
  ] as const)("a post-trigger %s subscription misses the synchronous event mutation", async (kind) => {
    const source = signalSource();
    source.emit({ kind });

    const staleWait = createExactSignalWait(
      source.subscribe,
      (signal) => signal.kind === kind,
      10,
    );

    await expect(staleWait.result).rejects.toThrow("exact_signal_timeout");
    expect(source.listenerCount()).toBe(0);
  });

  test.each([
    "email",
    "waitlist",
    "hold",
  ] as const)("a pre-trigger %s subscription observes the exact event and unsubscribes", async (kind) => {
    const source = signalSource();
    const wait = createExactSignalWait(
      source.subscribe,
      (signal) => signal.kind === kind,
      100,
    );

    source.emit({ kind });

    await expect(wait.result).resolves.toEqual({ kind });
    expect(source.listenerCount()).toBe(0);
    wait.cancel();
    expect(source.listenerCount()).toBe(0);
  });
});
