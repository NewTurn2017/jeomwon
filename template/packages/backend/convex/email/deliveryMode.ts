export type ReservationEmailMode = "capture" | "sent";

type ReservationEmailModeInput = {
  readonly resendApiKey: string | undefined;
  readonly qaResetFlag: string | undefined;
  readonly demoResetFlag: string | undefined;
};

export function reservationEmailMode(
  input: ReservationEmailModeInput,
): ReservationEmailMode {
  return !input.resendApiKey ||
    input.qaResetFlag === "1" ||
    input.demoResetFlag === "1"
    ? "capture"
    : "sent";
}
