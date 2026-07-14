import { expect, test } from "bun:test";
import type { FunctionArgs } from "convex/server";
import * as agentRuntime from "../../agents/src/index";
import { jeomwonConvex } from "../src/convex-refs";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;
type CustomerRefs = (typeof jeomwonConvex)["customerReservations"];

type _SnapshotArgsAreExact = Expect<
  Equal<FunctionArgs<CustomerRefs["snapshot"]>, Record<string, never>>
>;
type _AvailableSlotArgsAreExact = Expect<
  Equal<
    FunctionArgs<CustomerRefs["availableSlots"]>,
    {
      serviceKey: string;
      resourceKey: string | null;
      preferredStartMs: number | null;
      count: number;
    }
  >
>;
type _CreateHoldArgsAreExact = Expect<
  Equal<
    FunctionArgs<CustomerRefs["createHold"]>,
    { serviceKey: string; resourceKey: string; startMs: number }
  >
>;
type _ConfirmArgsAreExact = Expect<
  Equal<
    FunctionArgs<CustomerRefs["confirmReservation"]>,
    { reservationId: string }
  >
>;
type _CancelArgsAreExact = Expect<
  Equal<
    FunctionArgs<CustomerRefs["cancelReservation"]>,
    { reservationId: string }
  >
>;
type _RescheduleArgsAreExact = Expect<
  Equal<
    FunctionArgs<CustomerRefs["rescheduleReservation"]>,
    {
      reservationId: string;
      serviceKey: string;
      resourceKey: string;
      startMs: number;
    }
  >
>;

function functionName(value: unknown): string {
  if (
    (typeof value !== "function" && typeof value !== "object") ||
    value === null
  ) {
    throw new Error("function_reference_required");
  }
  const nameSymbol = Object.getOwnPropertySymbols(value).find(
    (symbol) => symbol.description === "functionName",
  );
  if (nameSymbol === undefined) {
    throw new Error("function_reference_name_missing");
  }
  const name = Reflect.get(value, nameSymbol);
  if (typeof name !== "string") {
    throw new Error("function_reference_name_invalid");
  }
  return name;
}

test("canonical customer reservation references own the six public operations", () => {
  // Given
  const refs = Reflect.get(jeomwonConvex, "customerReservations");

  // When
  const names =
    typeof refs === "object" && refs !== null
      ? Object.values(refs).map(functionName)
      : [];

  // Then
  expect(JSON.stringify(names)).toBe(
    JSON.stringify([
      "customerReservations:snapshot",
      "customerReservations:availableSlots",
      "customerReservations:createHold",
      "customerReservations:confirmReservation",
      "customerReservations:cancelReservation",
      "customerReservations:rescheduleReservation",
    ]),
  );
});

test("feature-on chat selects the direct customer reservation references", () => {
  // Given
  const selector = Reflect.get(
    agentRuntime,
    "customerReservationToolReferences",
  );
  const directRefs = Reflect.get(jeomwonConvex, "customerReservations");

  // When
  const chatRefs =
    typeof selector === "function"
      ? Reflect.apply(selector, undefined, [true])
      : null;

  // Then
  expect(chatRefs).toBe(directRefs);
  console.log(
    `MANUAL_QA_SHARED=${JSON.stringify({
      featureOnChatUsesDirectRefs: chatRefs === directRefs,
      createHold: functionName(Reflect.get(Object(directRefs), "createHold")),
      confirmReservation: functionName(
        Reflect.get(Object(directRefs), "confirmReservation"),
      ),
      cancelReservation: functionName(
        Reflect.get(Object(directRefs), "cancelReservation"),
      ),
      rescheduleReservation: functionName(
        Reflect.get(Object(directRefs), "rescheduleReservation"),
      ),
    })}`,
  );
});
