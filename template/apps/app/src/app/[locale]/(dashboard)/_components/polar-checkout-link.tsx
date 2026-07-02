"use client";

import { CheckoutLink } from "@convex-dev/polar/react";
import { api } from "@v1/backend/convex/_generated/api";

export function PolarCheckoutLink({
  children,
  productIds,
}: {
  children: React.ReactNode;
  productIds: string[];
}) {
  return (
    <CheckoutLink polarApi={api.subscriptions} productIds={productIds}>
      {children}
    </CheckoutLink>
  );
}
