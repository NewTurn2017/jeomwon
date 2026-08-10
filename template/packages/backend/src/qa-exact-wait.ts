export class QaExactWaitError extends Error {
  readonly name = "QaExactWaitError";

  constructor(
    readonly code: "exact_signal_timeout" | "exact_signal_cancelled",
  ) {
    super(code);
  }
}

export type ExactSignalWait<T> = {
  readonly result: Promise<T>;
  readonly cancel: () => void;
};

export function createExactSignalWait<T>(
  subscribe: (listener: (value: T) => void) => () => void,
  matches: (value: T) => boolean,
  timeoutMs: number,
): ExactSignalWait<T> {
  let settled = false;
  let unsubscribe: () => void = () => undefined;
  let rejectResult: (error: QaExactWaitError) => void = () => undefined;
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    unsubscribe();
    rejectResult(new QaExactWaitError("exact_signal_timeout"));
  }, timeoutMs);
  const result = new Promise<T>((resolve, reject) => {
    rejectResult = reject;
    const subscribedUnsubscribe = subscribe((value) => {
      if (settled || !matches(value)) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve(value);
    });
    unsubscribe = subscribedUnsubscribe;
    if (settled) subscribedUnsubscribe();
  });

  return {
    result,
    cancel: () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      rejectResult(new QaExactWaitError("exact_signal_cancelled"));
    },
  };
}
