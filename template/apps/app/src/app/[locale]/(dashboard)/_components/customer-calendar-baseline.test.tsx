import { describe, expect, mock, test } from "bun:test";
import type { WidgetSnapshot } from "@jeomwon/backend/src/agent-contract";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/locales/client", () => ({
  useScopedI18n: () => (key: string) => key,
}));

const { ReservationWidgetBoard } = await import("./reservation-widget-board");

describe("customer calendar baseline", () => {
  test("Given a customer-safe snapshot When the calendar renders Then it shows only active upcoming rows", () => {
    const generatedAtMs = Date.UTC(2026, 6, 15, 0, 0);
    const snapshot: WidgetSnapshot = {
      domain: {
        adminWidget: "calendar",
        locale: "en-US",
        storeTimezone: "UTC",
        resources: [{ key: "room-a", label: "Room A", kind: "room" }],
      },
      generatedAtMs,
      reservations: [
        {
          id: "active-row",
          serviceLabel: "Consultation",
          resourceKey: "room-a",
          resourceLabel: "Room A",
          startMs: generatedAtMs + 60 * 60 * 1000,
          endMs: generatedAtMs + 2 * 60 * 60 * 1000,
          timeWindow: "01:00–02:00",
          status: "confirmed",
        },
        {
          id: "history-row",
          serviceLabel: "Old consultation",
          resourceKey: "room-a",
          resourceLabel: "Room A",
          startMs: generatedAtMs + 3 * 60 * 60 * 1000,
          endMs: generatedAtMs + 4 * 60 * 60 * 1000,
          timeWindow: "03:00–04:00",
          status: "cancelled",
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ReservationWidgetBoard snapshot={snapshot} />,
    );

    expect(html).toContain("Consultation");
    expect(html).not.toContain("Old consultation");
    expect(html).toContain("calendarDayEmpty");
  });
});
