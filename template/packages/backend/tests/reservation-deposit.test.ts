import { afterEach, describe, expect, test } from "bun:test";
import { domainConfig } from "../domain.config";
import {
  claimDepositCheckout,
  DEPOSIT_DOMAIN_METADATA_KEY,
  DEPOSIT_RESERVATION_METADATA_KEY,
  depositCheckoutMetadata,
  type DepositOrder,
  depositFromOrder,
  depositOrderFromWebhook,
  depositProductId,
  depositReservationFromOrder,
  isReservationDepositEnabled,
  recordDepositOrder,
  startDepositCheckout,
} from "../convex/deposits";
import { assertCheckoutInput } from "../convex/subscriptions";
import { exportedArgKeys } from "./customer-reservations-test-harness";

const documentId = "kd7abc123reservation";

function order(overrides: Partial<DepositOrder> = {}): DepositOrder {
  return {
    id: "order-1",
    status: "paid",
    amount: 30_000,
    refundedAmount: 0,
    currency: "krw",
    metadata: depositCheckoutMetadata(documentId),
    ...overrides,
  };
}

function rejection(operation: () => unknown) {
  try {
    operation();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "accepted";
}

afterEach(() => {
  delete process.env.POLAR_DEPOSIT_PRODUCT_ID;
});

describe("reservation deposit seam", () => {
  test("is enabled only with the Polar feature and a deposit product", () => {
    delete process.env.POLAR_DEPOSIT_PRODUCT_ID;
    expect(depositProductId()).toBe("");
    expect(isReservationDepositEnabled()).toBe(false);

    process.env.POLAR_DEPOSIT_PRODUCT_ID = "   ";
    expect(isReservationDepositEnabled()).toBe(false);

    process.env.POLAR_DEPOSIT_PRODUCT_ID = " deposit-product ";
    expect(depositProductId()).toBe("deposit-product");
    expect(isReservationDepositEnabled()).toBe(domainConfig.features.polar);
  });

  test("checkout metadata carries the reservation without using reserved keys", () => {
    const metadata = depositCheckoutMetadata(documentId);
    expect(metadata[DEPOSIT_RESERVATION_METADATA_KEY]).toBe(documentId);
    expect(metadata[DEPOSIT_DOMAIN_METADATA_KEY]).toBe(domainConfig.domainKey);

    const configuration = {
      applicationOrigins: ["https://app.example.com"],
      productIds: ["product-monthly"],
    };
    const checkout = {
      productIds: ["product-monthly"],
      origin: "https://app.example.com",
      successUrl: "https://app.example.com/settings/billing",
    };
    // The deposit keys stay usable while a customer-supplied reservation id
    // remains reserved on the account-subscription action.
    expect(
      rejection(() =>
        assertCheckoutInput({ ...checkout, metadata }, configuration),
      ) === "polar_checkout_metadata_reserved",
    ).toBe(false);
    expect(
      rejection(() =>
        assertCheckoutInput(
          { ...checkout, metadata: { reservationId: documentId } },
          configuration,
        ),
      ),
    ).toBe("polar_checkout_metadata_reserved");
  });

  test("only this domain's own deposit orders resolve to a reservation", () => {
    expect(depositReservationFromOrder(order())).toBe(documentId);
    expect(depositReservationFromOrder(order({ metadata: {} }))).toBe(null);
    expect(
      depositReservationFromOrder(
        order({
          metadata: {
            [DEPOSIT_RESERVATION_METADATA_KEY]: documentId,
            [DEPOSIT_DOMAIN_METADATA_KEY]: "another-domain",
          },
        }),
      ),
    ).toBe(null);
    expect(
      depositReservationFromOrder(
        order({
          metadata: { [DEPOSIT_RESERVATION_METADATA_KEY]: "" },
        }),
      ),
    ).toBe(null);
  });

  test("order status and refunded amount decide the deposit state", () => {
    expect(depositFromOrder(order(), 10).state).toBe("paid");
    expect(depositFromOrder(order({ status: "pending" }), 10).state).toBe(
      "pending",
    );
    expect(
      depositFromOrder(
        order({ status: "partially_refunded", refundedAmount: 10_000 }),
        10,
      ).state,
    ).toBe("paid");
    expect(
      depositFromOrder(
        order({ status: "refunded", refundedAmount: 30_000 }),
        10,
      ).state,
    ).toBe("refunded");
    expect(
      JSON.stringify(
        depositFromOrder(order({ amount: -5, refundedAmount: -5 }), 10),
      ),
    ).toBe(
      JSON.stringify({
        state: "paid",
        orderId: "order-1",
        amountMinor: 0,
        refundedMinor: 0,
        currency: "krw",
        updatedAtMs: 10,
      }),
    );
  });

  test("a malformed webhook payload is ignored instead of thrown", () => {
    expect(depositOrderFromWebhook({ data: order() })?.id).toBe("order-1");
    expect(depositOrderFromWebhook(null)).toBe(null);
    expect(depositOrderFromWebhook({})).toBe(null);
    expect(depositOrderFromWebhook({ data: [] })).toBe(null);
    expect(
      depositOrderFromWebhook({ data: { ...order(), metadata: undefined } }),
    ).toBe(null);
    expect(
      depositOrderFromWebhook({ data: { ...order(), amount: "30000" } }),
    ).toBe(null);
    expect(depositOrderFromWebhook({ data: { ...order(), id: 7 } })).toBe(null);
  });

  test("customer-facing arguments never include the internal document id", () => {
    expect([...exportedArgKeys(startDepositCheckout)].sort().join(",")).toBe(
      "locale,origin,reservationId,successUrl",
    );
    expect([...exportedArgKeys(claimDepositCheckout)].join(",")).toBe(
      "reservationId",
    );
    expect([...exportedArgKeys(recordDepositOrder)].sort().join(",")).toBe(
      "amountMinor,currency,documentId,orderId,refundedMinor,state",
    );
  });
});
