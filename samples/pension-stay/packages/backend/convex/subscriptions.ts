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
] as const;

type PolarEnvKey = (typeof REQUIRED_POLAR_ENV)[number]["key"];
type PolarEnv = Record<PolarEnvKey, string>;

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
  };
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
    return await getPolarClient("product listing").listProducts(ctx);
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
    const client = getPolarClient("checkout link generation");
    const { userId, email } = await getUserInfo(ctx);
    const { url: baseUrl } = await client.createCheckoutSession(ctx, {
      productIds: args.productIds,
      userId,
      email,
      subscriptionId: args.subscriptionId,
      origin: args.origin,
      successUrl: args.successUrl,
      metadata: args.metadata,
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
    return await client.createCustomerPortalSession(ctx, {
      userId,
      returnUrl: args.returnUrl,
    });
  },
});
