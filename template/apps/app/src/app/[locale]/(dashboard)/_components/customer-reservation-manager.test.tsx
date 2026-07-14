import { describe, expect, mock, test } from "bun:test";
import type { CustomerSnapshot } from "@jeomwon/backend/src/agent-contract";
import { type FunctionReference, getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { customerDomainFixture } from "./customer-reservation-test-fixture";

const queryNames: string[] = [];
const mutationNames: string[] = [];

mock.module("convex/react", () => ({
  useConvex: () => ({ query: async () => ({ slots: [] }) }),
  useMutation: (reference: FunctionReference<"mutation">) => {
    mutationNames.push(getFunctionName(reference));
    return async () => ({
      publicContext: null,
      holdExpiresAtMs: 0,
      escalated: false,
    });
  },
  useQuery: (reference: FunctionReference<"query">) => {
    queryNames.push(getFunctionName(reference));
    return snapshot;
  },
}));

mock.module("@/locales/client", () => ({
  useScopedI18n: () => (key: string) => key,
}));

const { CustomerReservationManager } = await import(
  "./customer-reservation-manager"
);

describe("customer reservation manager canonical adapter", () => {
  test("Given the customer manager When rendered Then snapshot and writes bind only canonical customer reservation refs", () => {
    queryNames.length = 0;
    mutationNames.length = 0;

    const html = renderToStaticMarkup(<CustomerReservationManager />);

    expect(queryNames).toEqual(["customerReservations:snapshot"]);
    expect(mutationNames).toEqual([
      "customerReservations:createHold",
      "customerReservations:confirmReservation",
      "customerReservations:rescheduleReservation",
      "customerReservations:cancelReservation",
    ]);
    expect(html).toContain("customer.manager.title");
    expect(html).not.toContain("internalContext");
    expect(html).not.toContain("auditHistory");
  });
});

const snapshot: CustomerSnapshot = {
  domain: customerDomainFixture,
  threadId: "customer-thread",
  reservations: [],
  generatedAtMs: Date.UTC(2026, 6, 15),
};
