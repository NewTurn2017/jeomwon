import { describe, expect, test } from "bun:test";
import type {
  AdminReservationResult,
  AdminSessionCreateArgs,
} from "@jeomwon/backend/src/agent-contract";
import {
  createOperatorCalendarController,
  mapOperatorCalendarError,
  type OperatorCalendarGateway,
} from "./operator-calendar-controller";

const slot = {
  serviceKey: "consultation",
  resourceKey: "room-a",
  dateKey: "2026-08-11",
  startTime: "10:30",
};

function result(): AdminReservationResult {
  return { reservation: {} as AdminReservationResult["reservation"] };
}

describe("operator calendar controller", () => {
  test("routes exact create/update/customer-reschedule/cancel args without leaking a customer title", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const gateway: OperatorCalendarGateway = {
      createSession: async (args) => {
        calls.push({ name: "create", args });
        return result();
      },
      updateSession: async (args) => {
        calls.push({ name: "update", args });
        return result();
      },
      rescheduleCustomerReservation: async (args) => {
        calls.push({ name: "reschedule", args });
        return result();
      },
      deleteSession: async (args) => {
        calls.push({ name: "cancel", args });
        return { ...result(), escalated: false };
      },
    };
    const controller = createOperatorCalendarController(gateway);

    await controller.create({ ...slot, title: "Team block" });
    await controller.updateOperator({
      ...slot,
      title: "Updated block",
      reservationId: "OP-101",
    });
    await controller.rescheduleCustomer({
      ...slot,
      reservationId: "R-202",
    });
    await controller.cancel({ reservationId: "R-202" });

    expect(calls).toEqual([
      { name: "create", args: { ...slot, title: "Team block" } },
      {
        name: "update",
        args: { ...slot, title: "Updated block", reservationId: "OP-101" },
      },
      {
        name: "reschedule",
        args: { ...slot, reservationId: "R-202" },
      },
      { name: "cancel", args: { reservationId: "R-202" } },
    ]);
    expect(
      Object.hasOwn(calls[2]?.args as AdminSessionCreateArgs, "title"),
    ).toBe(false);
  });

  test("suppresses duplicate submits until the exact request settles", async () => {
    let release: ((value: AdminReservationResult) => void) | undefined;
    let count = 0;
    const pending = new Promise<AdminReservationResult>((resolve) => {
      release = resolve;
    });
    const gateway = gatewayWith({
      createSession: () => {
        count += 1;
        return pending;
      },
    });
    const controller = createOperatorCalendarController(gateway);

    const first = controller.create({ ...slot, title: "Block" });
    const second = controller.create({ ...slot, title: "Block" });
    expect(count).toBe(1);
    expect(controller.getSnapshot().pending).toBe(true);
    release?.(result());
    await Promise.all([first, second]);
    expect(controller.getSnapshot().pending).toBe(false);
  });

  test("maps only stable operator UI codes", async () => {
    expect(mapOperatorCalendarError(new Error("slot_conflict"))).toBe(
      "slot_unavailable",
    );
    expect(
      mapOperatorCalendarError(new Error("slot_outside_business_hours")),
    ).toBe("outside_business_hours");
    expect(mapOperatorCalendarError(new Error("admin_forbidden"))).toBe(
      "admin_forbidden",
    );
    expect(
      mapOperatorCalendarError(new Error("operator_calendar_crud_disabled")),
    ).toBe("operator_crud_disabled");
    expect(mapOperatorCalendarError(new Error("unknown_service"))).toBe(
      "invalid_session",
    );
    expect(mapOperatorCalendarError(new Error("reservation_not_found"))).toBe(
      "reservation_not_found",
    );
  });
});

function gatewayWith(
  overrides: Partial<OperatorCalendarGateway>,
): OperatorCalendarGateway {
  return {
    createSession: async () => result(),
    updateSession: async () => result(),
    rescheduleCustomerReservation: async () => result(),
    deleteSession: async () => ({ ...result(), escalated: false }),
    ...overrides,
  };
}
