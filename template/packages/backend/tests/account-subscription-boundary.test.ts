import { describe, expect, test } from "bun:test";
import {
  assertCheckoutInput,
  assertPortalReturnUrl,
  filterConfiguredProducts,
  generateCheckoutLink,
} from "../convex/subscriptions";
import { exportedArgKeys } from "./customer-reservations-test-harness";

function rejection(operation: () => unknown) {
  try {
    operation();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "accepted";
}

const configuration = {
  applicationOrigins: ["https://app.example.com"],
  productIds: ["product-monthly", "product-yearly"],
};

describe("Polar account-subscription boundary", () => {
  test("accepts one configured product and application-bound return URLs", () => {
    const input = {
      productIds: ["product-monthly"],
      origin: "https://app.example.com",
      successUrl: "https://app.example.com/en/settings/billing?done=1",
    };
    const validated = assertCheckoutInput(input, configuration);
    expect(validated === input).toBe(false);
    expect(JSON.stringify(validated)).toBe(
      JSON.stringify({
        productIds: ["product-monthly"],
        origin: "https://app.example.com",
        successUrl: "https://app.example.com/en/settings/billing?done=1",
      }),
    );
  });

  test("rejects foreign origins, success URLs, products, and reserved metadata", () => {
    const valid = {
      productIds: ["product-monthly"],
      origin: "https://app.example.com",
      successUrl: "https://app.example.com/settings/billing",
    };
    expect(
      rejection(() =>
        assertCheckoutInput(
          { ...valid, origin: "https://foreign.example" },
          configuration,
        ),
      ),
    ).toBe("polar_checkout_origin_forbidden");
    expect(
      rejection(() =>
        assertCheckoutInput(
          { ...valid, successUrl: "https://foreign.example/collect" },
          configuration,
        ),
      ),
    ).toBe("polar_checkout_success_url_forbidden");
    expect(
      rejection(() =>
        assertCheckoutInput(
          { ...valid, productIds: ["foreign-product"] },
          configuration,
        ),
      ),
    ).toBe("polar_product_invalid");
    expect(
      rejection(() =>
        assertCheckoutInput(
          { ...valid, metadata: { email: "attacker@example.com" } },
          configuration,
        ),
      ),
    ).toBe("polar_checkout_metadata_reserved");
  });

  test("binds customer portal returns to a configured application origin", () => {
    expect(
      assertPortalReturnUrl(
        "https://app.example.com/en/settings/billing",
        configuration.applicationOrigins,
      ),
    ).toBe("https://app.example.com/en/settings/billing");
    expect(
      assertPortalReturnUrl(undefined, configuration.applicationOrigins),
    ).toBe(undefined);
    for (const returnUrl of [
      "https://evil.example/settings/billing",
      "javascript:alert(1)",
      "https://app.example.com.evil.example/settings",
      "https://app.example.com/%0aevil",
      " https://app.example.com/en/settings/billing",
      "https://app.example.com/en/settings/billing\n",
      "https://app.example.com/en/\u0000settings",
    ]) {
      expect(
        rejection(() =>
          assertPortalReturnUrl(returnUrl, configuration.applicationOrigins),
        ),
      ).toBe("polar_portal_return_url_forbidden");
    }
  });

  test("rejects every non-HTTP checkout origin and success URL", () => {
    const valid = {
      productIds: ["product-monthly"],
      origin: "https://app.example.com",
      successUrl: "https://app.example.com/settings/billing",
    };
    const nonHttpUrls = [
      "blob:https://app.example.com/id",
      "data:text/plain,checkout",
      "file:///tmp/checkout",
      "javascript:alert(1)",
    ];

    for (const value of nonHttpUrls) {
      expect(
        rejection(() =>
          assertCheckoutInput({ ...valid, origin: value }, configuration),
        ),
      ).toBe("polar_checkout_origin_forbidden");
      expect(
        rejection(() =>
          assertCheckoutInput({ ...valid, successUrl: value }, configuration),
        ),
      ).toBe("polar_checkout_success_url_forbidden");
    }
  });

  test("rejects non-canonical raw URLs instead of validating one value and forwarding another", () => {
    const valid = {
      productIds: ["product-monthly"],
      origin: "https://app.example.com",
      successUrl: "https://app.example.com/settings/billing?done=1",
    };
    const nonCanonicalUrls = [
      " https://app.example.com",
      "https://app.example.com ",
      "\thttps://app.example.com\t",
      "\r\nhttps://app.example.com\r\n",
      "\nhttps://app.example.com",
      "https://app.example.com\r",
      "\fhttps://app.example.com",
      "\vhttps://app.example.com",
      "https://app.exa\nmple.com",
      "https://app.exa\rmple.com",
      "https://app.exa\tmple.com",
      "https://app.example.com/\0checkout",
      "https://app.example.com/\u0001checkout",
      "https://app.example.com/\u001fcheckout",
      "https://app.example.com/\u007fcheckout",
      "https://app.example.com/%00checkout",
      "https://app.example.com/%0Acheckout",
      "https://app.example.com/%09checkout",
      "HTTPS://APP.EXAMPLE.COM",
      "https://%61pp.example.com",
    ];

    for (const value of nonCanonicalUrls) {
      expect(
        rejection(() =>
          assertCheckoutInput({ ...valid, origin: value }, configuration),
        ),
      ).toBe("polar_checkout_origin_forbidden");
      expect(
        rejection(() =>
          assertCheckoutInput({ ...valid, successUrl: value }, configuration),
        ),
      ).toBe("polar_checkout_success_url_forbidden");
    }
  });

  test("exposes no client recipient or reservation-commerce input", () => {
    expect(
      JSON.stringify([...exportedArgKeys(generateCheckoutLink)].sort()),
    ).toBe(
      JSON.stringify(
        [
          "locale",
          "metadata",
          "origin",
          "productIds",
          "subscriptionId",
          "successUrl",
          "trialInterval",
          "trialIntervalCount",
        ].sort(),
      ),
    );
    const sourceKeys = exportedArgKeys(generateCheckoutLink).join(",");
    expect(/recipient|email|amount|currency|payment/i.test(sourceKeys)).toBe(
      false,
    );
  });

  test("returns only products selected by server configuration", () => {
    expect(
      JSON.stringify(
        filterConfiguredProducts(
          [
            { id: "foreign-product", name: "Foreign" },
            { id: "product-yearly", name: "Yearly" },
            { id: "product-monthly", name: "Monthly" },
          ],
          configuration.productIds,
        ).map((product) => product.id),
      ),
    ).toBe(JSON.stringify(["product-yearly", "product-monthly"]));
  });
});
