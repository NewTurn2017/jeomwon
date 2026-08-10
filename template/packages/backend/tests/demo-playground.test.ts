import { describe, expect, test } from "bun:test";
import { runDemoReset } from "../convex/demoReset";
import { reservationEmailMode } from "../convex/email/deliveryMode";

describe("runDemoReset", () => {
  test("does not touch demo data when JEOMWON_DEMO_RESET is unset", async () => {
    // Given
    const calls: string[] = [];

    // When
    const result = await runDemoReset(undefined, {
      resetDomainData: async () => {
        calls.push("reset");
        return { reservations: 2, chatThreads: 1, chatEvents: 3 };
      },
      restoreResources: async () => {
        calls.push("seed");
        return 3;
      },
    });

    // Then
    expect(result.status).toBe("skipped");
    expect(calls.join(",")).toBe("");
  });

  test("resets demo data and restores resources when the flag is exactly 1", async () => {
    // Given
    const calls: string[] = [];

    // When
    const result = await runDemoReset("1", {
      resetDomainData: async () => {
        calls.push("reset");
        return { reservations: 2, chatThreads: 1, chatEvents: 3 };
      },
      restoreResources: async () => {
        calls.push("seed");
        return 3;
      },
    });

    // Then
    expect(calls.join(",")).toBe("reset,seed");
    expect(JSON.stringify(result)).toBe(
      '{"status":"reset","reservations":2,"chatThreads":1,"chatEvents":3,"resources":3}',
    );
  });
});

describe("reservationEmailMode", () => {
  test("captures mail in a demo deployment even when Resend is configured", () => {
    // Given / When
    const mode = reservationEmailMode({
      configuredMode: "sent",
      resendApiKey: "configured",
      qaResetFlag: undefined,
      demoResetFlag: "1",
    });

    // Then
    expect(mode).toBe("capture");
  });

  test("preserves capture without Resend or during QA and sends otherwise", () => {
    // Given / When
    const modes = [
      reservationEmailMode({
        configuredMode: "capture",
        resendApiKey: undefined,
        qaResetFlag: undefined,
        demoResetFlag: undefined,
      }),
      reservationEmailMode({
        configuredMode: "sent",
        resendApiKey: "configured",
        qaResetFlag: "1",
        demoResetFlag: undefined,
      }),
      reservationEmailMode({
        configuredMode: "sent",
        resendApiKey: "configured",
        qaResetFlag: undefined,
        demoResetFlag: undefined,
      }),
    ];

    // Then
    expect(modes.join(",")).toBe("capture,capture,sent");
  });

  test("production delivery requires an explicit valid mode and Resend for send", () => {
    const failure = (
      configuredMode: string | undefined,
      resendApiKey?: string,
    ) => {
      try {
        reservationEmailMode({
          configuredMode,
          resendApiKey,
          qaResetFlag: undefined,
          demoResetFlag: undefined,
        });
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      return "accepted";
    };

    expect(failure(undefined)).toBe("reservation_email_mode_required");
    expect(failure("invalid")).toBe("reservation_email_mode_required");
    expect(failure("sent")).toBe("reservation_email_send_requires_resend");
  });
});
