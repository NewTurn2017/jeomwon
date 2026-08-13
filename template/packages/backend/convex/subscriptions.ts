import { Polar } from "@convex-dev/polar";
import type { ComponentApi as PolarComponentApi } from "@convex-dev/polar/_generated/component.js";
import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import { api, components } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { action, query } from "./_generated/server";

type PolarClient = Polar<DataModel>;
type PolarContext = Parameters<PolarClient["getCurrentSubscription"]>[0];
type PolarProduct = Awaited<ReturnType<PolarClient["listProducts"]>>[number];
type PolarSubscription = Awaited<
  ReturnType<PolarClient["getCurrentSubscription"]>
>;
type TrialInterval = "day" | "week" | "month" | "year";

const REQUIRED_POLAR_ENV = [
  {
    key: "POLAR_ORGANIZATION_TOKEN",
    reason:
      "Polar API access for products, checkout, subscriptions, and portal sessions",
  },
  {
    key: "POLAR_WEBHOOK_SECRET",
    reason: "verification of raw webhook payloads at /polar/events",
  },
  {
    key: "POLAR_PRODUCT_IDS",
    reason: "allowlisted account-subscription products",
  },
  {
    key: "JEOMWON_APP_ORIGINS",
    reason: "trusted application origins for checkout return URLs",
  },
] as const;

type PolarEnvKey = (typeof REQUIRED_POLAR_ENV)[number]["key"];
type PolarEnv = Record<PolarEnvKey, string>;

type CheckoutConfiguration = {
  readonly applicationOrigins: readonly string[];
  readonly productIds: readonly string[];
};

type CheckoutInput = {
  readonly productIds: readonly string[];
  readonly origin: string;
  readonly successUrl: string;
  readonly metadata?: Readonly<Record<string, string>>;
};

type ValidatedCheckoutInput<T extends CheckoutInput> = Omit<
  T,
  "origin" | "successUrl"
> & {
  readonly origin: string;
  readonly successUrl: string;
};

const RESERVED_CHECKOUT_METADATA = new Set([
  "amount",
  "currency",
  "customerid",
  "email",
  "origin",
  "payment",
  "productid",
  "productids",
  "recipient",
  "reservationid",
  "subscriptionid",
  "successurl",
  "userid",
]);
const ENCODED_ASCII_CONTROL = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;

let polarClient: PolarClient | null = null;

export function isPolarEnabled() {
  return domainConfig.features.polar;
}

function disabledPolarError(surface: string) {
  return new Error(
    `Polar billing is disabled for this domain (domain.config.features.polar=false); ${surface} is not available.`,
  );
}

function getRequiredPolarEnv(surface: string): PolarEnv {
  if (!domainConfig.features.polar) {
    throw disabledPolarError(surface);
  }

  const missing = REQUIRED_POLAR_ENV.filter(({ key }) => !process.env[key]);

  if (missing.length > 0) {
    const missingKeys = missing.map(({ key }) => key).join(", ");
    const reasons = missing
      .map(({ key, reason }) => `${key}: ${reason}`)
      .join("; ");
    throw new Error(
      `Polar billing is enabled (domain.config.features.polar=true), but required Convex env var(s) are missing for ${surface}: ${missingKeys}. ${reasons}. Set them with the setup wizard or convex env set before using Polar.`,
    );
  }

  return {
    POLAR_ORGANIZATION_TOKEN: process.env.POLAR_ORGANIZATION_TOKEN!,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET!,
    POLAR_PRODUCT_IDS: process.env.POLAR_PRODUCT_IDS!,
    JEOMWON_APP_ORIGINS: process.env.JEOMWON_APP_ORIGINS!,
  };
}

function configuredValues(value: string, errorCode: string) {
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new Error(errorCode);
  }
  return values;
}

function checkoutConfiguration(env: PolarEnv): CheckoutConfiguration {
  const applicationOrigins = configuredValues(
    env.JEOMWON_APP_ORIGINS,
    "polar_application_origins_invalid",
  ).map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("polar_application_origins_invalid");
    }
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.origin !== value ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("polar_application_origins_invalid");
    }
    return url.origin;
  });
  return {
    applicationOrigins,
    productIds: configuredValues(
      env.POLAR_PRODUCT_IDS,
      "polar_product_ids_invalid",
    ),
  };
}

export function assertCheckoutInput<T extends CheckoutInput>(
  input: T,
  configuration: CheckoutConfiguration,
): ValidatedCheckoutInput<T> {
  if (
    input.productIds.length !== 1 ||
    !configuration.productIds.includes(input.productIds[0] ?? "")
  ) {
    throw new Error("polar_product_invalid");
  }
  let origin: URL;
  try {
    origin = new URL(input.origin);
  } catch {
    throw new Error("polar_checkout_origin_forbidden");
  }
  if (
    (origin.protocol !== "https:" && origin.protocol !== "http:") ||
    origin.origin !== input.origin ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    ENCODED_ASCII_CONTROL.test(input.origin) ||
    !configuration.applicationOrigins.includes(origin.origin)
  ) {
    throw new Error("polar_checkout_origin_forbidden");
  }
  let successUrl: URL;
  try {
    successUrl = new URL(input.successUrl);
  } catch {
    throw new Error("polar_checkout_success_url_forbidden");
  }
  if (
    (successUrl.protocol !== "https:" && successUrl.protocol !== "http:") ||
    successUrl.username ||
    successUrl.password ||
    input.successUrl !== successUrl.href ||
    ENCODED_ASCII_CONTROL.test(input.successUrl) ||
    !configuration.applicationOrigins.includes(successUrl.origin)
  ) {
    throw new Error("polar_checkout_success_url_forbidden");
  }
  for (const key of Object.keys(input.metadata ?? {})) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    if (RESERVED_CHECKOUT_METADATA.has(normalized)) {
      throw new Error("polar_checkout_metadata_reserved");
    }
  }
  return {
    ...input,
    origin: origin.origin,
    successUrl: successUrl.href,
  };
}

export function assertPortalReturnUrl(
  returnUrl: string | undefined,
  applicationOrigins: readonly string[],
) {
  if (returnUrl === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(returnUrl);
  } catch {
    throw new Error("polar_portal_return_url_forbidden");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    returnUrl !== url.href ||
    ENCODED_ASCII_CONTROL.test(returnUrl) ||
    !applicationOrigins.includes(url.origin)
  ) {
    throw new Error("polar_portal_return_url_forbidden");
  }
  return url.href;
}

export function filterConfiguredProducts<T extends { readonly id: string }>(
  products: readonly T[],
  configuredProductIds: readonly string[],
) {
  const allowed = new Set(configuredProductIds);
  return products.filter((product) => allowed.has(product.id));
}

function getPolarComponent(surface: string) {
  const polarComponent = (components as Partial<Record<"polar", unknown>>)
    .polar;

  if (!polarComponent) {
    throw new Error(
      `Polar billing is enabled (domain.config.features.polar=true), but the Convex Polar component is not registered for ${surface}. Ensure convex.config.ts uses @convex-dev/polar when polar=true and regenerate Convex types.`,
    );
  }

  return polarComponent as PolarComponentApi;
}

async function getUserInfo(
  ctx: PolarContext,
): Promise<{ userId: Id<"users">; email: string }> {
  const user = await ctx.runQuery(api.users.getUser);
  if (!user) {
    throw new Error("User not found");
  }
  if (!user.email) {
    throw new Error("User email is required");
  }
  return {
    userId: user._id,
    email: user.email,
  };
}

function getPolarClient(surface: string) {
  if (!polarClient) {
    const polarEnv = getRequiredPolarEnv(surface);
    polarClient = new Polar<DataModel>(getPolarComponent(surface), {
      getUserInfo,
      organizationToken: polarEnv.POLAR_ORGANIZATION_TOKEN,
      webhookSecret: polarEnv.POLAR_WEBHOOK_SECRET,
    });
  }

  return polarClient;
}

export const polar = {
  get polar() {
    return getPolarClient("Polar SDK client").polar;
  },
  async getCurrentSubscription(
    ctx: PolarContext,
    args: { userId: Id<"users"> },
  ): Promise<PolarSubscription> {
    if (!domainConfig.features.polar) {
      return null;
    }
    return await getPolarClient(
      "current subscription lookup",
    ).getCurrentSubscription(ctx, args);
  },
  registerRoutes(
    http: Parameters<PolarClient["registerRoutes"]>[0],
    options?: Parameters<PolarClient["registerRoutes"]>[1],
  ) {
    if (!domainConfig.features.polar) {
      return;
    }
    getPolarClient("webhook route registration").registerRoutes(http, options);
  },
};

export const changeCurrentSubscription = action({
  args: {
    productId: v.string(),
  },
  handler: async (ctx, args) => {
    const polarEnv = getRequiredPolarEnv("subscription change");
    if (!checkoutConfiguration(polarEnv).productIds.includes(args.productId)) {
      throw new Error("polar_product_invalid");
    }
    return await getPolarClient("subscription change").changeSubscription(ctx, {
      productId: args.productId,
    });
  },
});

export const cancelCurrentSubscription = action({
  args: {
    revokeImmediately: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await getPolarClient("subscription cancellation").cancelSubscription(
      ctx,
      {
        revokeImmediately: args.revokeImmediately,
      },
    );
  },
});

export const listAllProducts = query({
  args: {},
  handler: async (ctx): Promise<PolarProduct[]> => {
    if (!domainConfig.features.polar) {
      return [];
    }
    const polarEnv = getRequiredPolarEnv("product listing");
    return filterConfiguredProducts(
      await getPolarClient("product listing").listProducts(ctx),
      checkoutConfiguration(polarEnv).productIds,
    );
  },
});

export const generateCheckoutLink = action({
  args: {
    productIds: v.array(v.string()),
    origin: v.string(),
    successUrl: v.string(),
    subscriptionId: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
    trialInterval: v.optional(
      v.union(
        v.literal("day"),
        v.literal("week"),
        v.literal("month"),
        v.literal("year"),
        v.null(),
      ),
    ),
    trialIntervalCount: v.optional(v.union(v.number(), v.null())),
    locale: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    url: string;
  }> => {
    const polarEnv = getRequiredPolarEnv("checkout link generation");
    const checkoutArgs = assertCheckoutInput(
      args,
      checkoutConfiguration(polarEnv),
    );
    const client = getPolarClient("checkout link generation");
    const { userId, email } = await getUserInfo(ctx);
    const { url: baseUrl } = await client.createCheckoutSession(ctx, {
      productIds: checkoutArgs.productIds,
      userId,
      email,
      subscriptionId: args.subscriptionId,
      origin: checkoutArgs.origin,
      successUrl: checkoutArgs.successUrl,
      metadata: checkoutArgs.metadata,
      trialInterval: args.trialInterval as TrialInterval | null | undefined,
      trialIntervalCount: args.trialIntervalCount,
    });
    if (!args.locale) {
      return { url: baseUrl };
    }

    const url = new URL(baseUrl);
    url.searchParams.set("locale", args.locale);
    return { url: url.toString() };
  },
});

export const generateCustomerPortalUrl = action({
  args: {
    returnUrl: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    url: string;
  }> => {
    const client = getPolarClient("customer portal URL generation");
    const { userId } = await getUserInfo(ctx);
    const configuration = checkoutConfiguration(
      getRequiredPolarEnv("customer portal URL generation"),
    );
    return await client.createCustomerPortalSession(ctx, {
      userId,
      returnUrl: assertPortalReturnUrl(
        args.returnUrl,
        configuration.applicationOrigins,
      ),
    });
  },
});
