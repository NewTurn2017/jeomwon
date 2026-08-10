export type ReservationEmailMode = "capture" | "sent";

type ReservationEmailModeInput = {
  readonly configuredMode: string | undefined;
  readonly resendApiKey: string | undefined;
  readonly qaResetFlag: string | undefined;
  readonly demoResetFlag: string | undefined;
};

export function reservationEmailMode(
  input: ReservationEmailModeInput,
): ReservationEmailMode {
  if (input.qaResetFlag === "1" || input.demoResetFlag === "1") {
    return "capture";
  }
  if (input.configuredMode !== "capture" && input.configuredMode !== "sent") {
    throw new Error("reservation_email_mode_required");
  }
  if (input.configuredMode === "sent" && !input.resendApiKey) {
    throw new Error("reservation_email_send_requires_resend");
  }
  return input.configuredMode;
}
