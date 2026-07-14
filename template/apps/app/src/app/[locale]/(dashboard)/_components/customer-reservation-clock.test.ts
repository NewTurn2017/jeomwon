import { expect, test } from "bun:test";
import { startReservationExpiryClock } from "./customer-reservation-clock";
import {
  isHoldExpired,
  reservationActions,
} from "./customer-reservation-controller";

test("Given a held row and open dialog When local time crosses expiry without a snapshot Then actions transition immediately", () => {
  let nowMs = 1_000;
  let scheduled:
    | { readonly run: () => void; readonly delayMs: number }
    | undefined;
  const actionSnapshots: Array<readonly string[]> = [];
  const confirmDisabled: boolean[] = [];
  const reservation = {
    status: "held" as const,
    holdExpiresAtMs: 2_000,
  };

  const stop = startReservationExpiryClock({
    deadlines: [reservation.holdExpiresAtMs],
    now: () => nowMs,
    onNow: (currentMs) => {
      actionSnapshots.push(reservationActions(reservation, currentMs));
      confirmDisabled.push(
        isHoldExpired(reservation.holdExpiresAtMs, currentMs),
      );
    },
    schedule: (run, delayMs) => {
      scheduled = { run, delayMs };
      return () => {
        scheduled = undefined;
      };
    },
  });

  expect(actionSnapshots).toEqual([["confirm", "cancel"]]);
  expect(scheduled?.delayMs).toBe(1_000);

  nowMs = 2_000;
  scheduled?.run();

  expect(actionSnapshots).toEqual([["confirm", "cancel"], []]);
  expect(confirmDisabled).toEqual([false, true]);
  stop();
});
