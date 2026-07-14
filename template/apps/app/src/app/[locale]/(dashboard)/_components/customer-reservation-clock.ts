import { useEffect, useState } from "react";

type ExpiryClockOptions = {
  readonly deadlines: readonly number[];
  readonly now: () => number;
  readonly onNow: (nowMs: number) => void;
  readonly schedule: (run: () => void, delayMs: number) => () => void;
};

export function startReservationExpiryClock(
  options: ExpiryClockOptions,
): () => void {
  let stopped = false;
  let cancelScheduled: () => void = () => undefined;

  const tick = () => {
    if (stopped) return;
    const nowMs = options.now();
    options.onNow(nowMs);
    const nextDeadline = Math.min(
      ...options.deadlines.filter((deadline) => deadline > nowMs),
    );
    if (Number.isFinite(nextDeadline)) {
      cancelScheduled = options.schedule(tick, nextDeadline - nowMs);
    }
  };

  tick();
  return () => {
    stopped = true;
    cancelScheduled();
  };
}

export function useReservationNow(
  serverNowMs: number,
  deadlines: readonly number[],
): number {
  const [nowMs, setNowMs] = useState(serverNowMs);
  const deadlineKey = deadlines.join(",");

  useEffect(() => {
    const parsedDeadlines = deadlineKey.split(",").filter(Boolean).map(Number);
    return startReservationExpiryClock({
      deadlines: parsedDeadlines,
      now: Date.now,
      onNow: setNowMs,
      schedule: (run, delayMs) => {
        const timeout = setTimeout(run, delayMs);
        return () => clearTimeout(timeout);
      },
    });
  }, [deadlineKey]);

  return nowMs;
}
