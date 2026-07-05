"use client";

import { CheckoutLink, CustomerPortalLink } from "@convex-dev/polar/react";
import { api } from "@jeomwon/backend/convex/_generated/api";
import { Button } from "@jeomwon/ui/button";
import { Switch } from "@jeomwon/ui/switch";
import { useQuery } from "convex/react";
import { useState } from "react";
import { useScopedI18n } from "@/locales/client";

const Plan = ({
  name,
  description,
  isCurrent,
  amount,
  interval,
  intervalLabel,
  onChangeInterval,
}: {
  name: string;
  description: string | null;
  isCurrent: boolean;
  amount: number;
  interval?: "month" | "year";
  intervalLabel?: string;
  onChangeInterval?: () => void;
}) => {
  return (
    <div
      className={`flex w-full select-none items-center rounded-md border border-border bg-background ${
        isCurrent && "border-primary/60"
      }`}
    >
      <div className="flex w-full flex-col items-start p-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-base text-foreground">{name}</span>
          {Boolean(amount) && (
            <span className="flex items-center rounded-md bg-muted px-1.5 font-medium text-muted-foreground text-sm">
              ${amount / 100} / {intervalLabel}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-start text-sm">
          {description}
        </p>
      </div>

      {Boolean(amount) && (
        <div className="flex items-center gap-2 px-4">
          <label
            htmlFor="interval-switch"
            className="text-muted-foreground text-start text-sm"
          >
            {intervalLabel}
          </label>
          <Switch
            id="interval-switch"
            checked={interval === "year"}
            onCheckedChange={() => onChangeInterval?.()}
          />
        </div>
      )}
    </div>
  );
};

export default function BillingSettings() {
  const t = useScopedI18n("settings.billing");
  const user = useQuery(api.users.getUser);
  const products = useQuery(api.subscriptions.listAllProducts);

  const [selectedPlanInterval, setSelectedPlanInterval] = useState<
    "month" | "year"
  >("month");

  if (!user) {
    return null;
  }

  const monthlyProProduct = products?.find(
    (product) => product.recurringInterval === "month",
  );
  const yearlyProProduct = products?.find(
    (product) => product.recurringInterval === "year",
  );

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <section className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold text-card-foreground text-xl">
          {t("demoTitle")}
        </h2>
        <p className="text-muted-foreground text-sm leading-6">
          {t("demoDescription")}{" "}
          <a
            href="https://stripe.com/docs/testing#cards"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline"
          >
            {t("testCardsLink")}
          </a>
          .
        </p>
      </section>

      <section className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-2 p-6">
          <h2 className="font-semibold text-card-foreground text-xl">
            {t("planTitle")}
          </h2>
          <p className="flex flex-wrap items-center gap-1 text-muted-foreground text-sm">
            {t("currentPlanPrefix")}
            <span className="flex h-[18px] items-center rounded-md bg-muted px-1.5 font-medium text-foreground text-sm">
              {user.subscription ? user.subscription.product.name : t("free")}
            </span>
            {t("currentPlanSuffix")}
          </p>
        </div>

        {!user.subscription && (
          <div className="flex w-full flex-col items-center justify-evenly gap-2 border-border p-6 pt-0">
            <Plan
              name={t("free")}
              description={t("freeDescription")}
              isCurrent={!user.subscription}
              amount={0}
            />
            {selectedPlanInterval === "month" && monthlyProProduct && (
              <Plan
                name={monthlyProProduct.name}
                description={monthlyProProduct.description}
                isCurrent={false}
                amount={monthlyProProduct.prices[0]?.priceAmount ?? 0}
                interval={selectedPlanInterval}
                intervalLabel={t("monthly")}
                onChangeInterval={() => {
                  setSelectedPlanInterval((state) =>
                    state === "month" ? "year" : "month",
                  );
                }}
              />
            )}
            {selectedPlanInterval === "year" && yearlyProProduct && (
              <Plan
                name={yearlyProProduct.name}
                description={yearlyProProduct.description}
                isCurrent={false}
                amount={yearlyProProduct.prices[0]?.priceAmount ?? 0}
                interval={selectedPlanInterval}
                intervalLabel={t("yearly")}
                onChangeInterval={() => {
                  setSelectedPlanInterval((state) =>
                    state === "month" ? "year" : "month",
                  );
                }}
              />
            )}
          </div>
        )}

        {user.subscription &&
          (user.subscription?.productId === monthlyProProduct?.id ||
            user.subscription?.productId === yearlyProProduct?.id) && (
            <div className="flex w-full flex-col items-center justify-evenly gap-2 border-border p-6 pt-0">
              <div className="flex w-full items-center overflow-hidden rounded-md border border-primary/60">
                <div className="flex w-full flex-col items-start p-4">
                  <div className="flex items-end gap-2">
                    <span className="font-medium text-base text-foreground">
                      {user.subscription?.product.name}
                    </span>
                    <p className="flex items-start gap-1 text-muted-foreground text-sm">
                      {user.subscription.cancelAtPeriodEnd === true ? (
                        <span className="flex h-[18px] items-center font-medium text-destructive text-sm">
                          {t("expires")}
                        </span>
                      ) : (
                        <span className="flex h-[18px] items-center font-medium text-chart-2 text-sm">
                          {t("renews")}
                        </span>
                      )}
                      {t("onDate")}{" "}
                      {new Date(
                        user.subscription.currentPeriodEnd ?? 0 * 1000,
                      ).toLocaleDateString()}
                      .
                    </p>
                  </div>
                  <p className="text-muted-foreground text-start text-sm">
                    {user.subscription?.product.description}
                  </p>
                </div>
              </div>
            </div>
          )}

        {!user.subscription && (
          <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-border border-t bg-muted px-6 py-3">
            <p className="text-muted-foreground text-sm">
              {t("testChargeNotice")}
            </p>
            {monthlyProProduct && yearlyProProduct && (
              <Button type="submit" size="sm" asChild>
                <CheckoutLink
                  polarApi={api.subscriptions}
                  productIds={[
                    selectedPlanInterval === "month"
                      ? monthlyProProduct.id
                      : yearlyProProduct.id,
                  ]}
                >
                  {t("upgradeButton")}
                </CheckoutLink>
              </Button>
            )}
          </div>
        )}
      </section>

      {user.subscription && (
        <section className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-2 p-6">
            <h2 className="font-semibold text-card-foreground text-xl">
              {t("manageTitle")}
            </h2>
            <p className="flex items-start gap-1 text-muted-foreground text-sm">
              {t("manageDescription")}
            </p>
          </div>

          <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-border border-t bg-muted px-6 py-3">
            <p className="text-muted-foreground text-sm">{t("portalNotice")}</p>

            <CustomerPortalLink polarApi={api.subscriptions}>
              <Button type="submit" size="sm">
                {t("manageButton")}
              </Button>
            </CustomerPortalLink>
          </div>
        </section>
      )}
    </div>
  );
}
