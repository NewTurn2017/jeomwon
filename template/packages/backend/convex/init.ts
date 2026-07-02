import { productsCreate } from "@polar-sh/sdk/funcs/productsCreate.js";
import { productsList } from "@polar-sh/sdk/funcs/productsList.js";
import { domainConfig } from "../domain.config";
import { internalAction } from "./_generated/server";
import { polar } from "./subscriptions";

export default internalAction(async () => {
  if (!domainConfig.features.polar) {
    console.info("Skipping Polar products creation; Polar is disabled.");
    return;
  }

  const products = await productsList(polar.polar, {
    isArchived: false,
  });
  if (!products.ok) {
    throw products.error;
  }
  if (products.value.result.items.length) {
    console.info("🏃‍♂️ Skipping Polar products creation and seeding.");
    return;
  }
  const monthlyProduct = await productsCreate(polar.polar, {
    name: "Pro",
    description: "All the things for one low monthly price.",
    recurringInterval: "month",
    prices: [
      {
        priceAmount: 2000,
        amountType: "fixed",
      },
    ],
  });
  if (!monthlyProduct.ok) {
    throw monthlyProduct.error;
  }
  const yearlyProduct = await productsCreate(polar.polar, {
    name: "Pro",
    description: "All the things for one low yearly price.",
    recurringInterval: "year",
    prices: [
      {
        priceAmount: 20000,
        amountType: "fixed",
      },
    ],
  });
  if (!yearlyProduct.ok) {
    throw yearlyProduct.error;
  }

  console.info("📦 Polar Products have been successfully created.");
});
