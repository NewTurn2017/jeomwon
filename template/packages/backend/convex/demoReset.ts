import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import { internalMutation } from "./_generated/server";
import { seedDomainResources } from "./jeomwonSeed";
import { resetDomainData } from "./qaReset";

type DemoResetCounts = {
  readonly reservations: number;
  readonly chatThreads: number;
  readonly chatEvents: number;
};

type DemoResetOperations = {
  readonly resetDomainData: () => Promise<DemoResetCounts>;
  readonly restoreResources: () => Promise<number>;
};

type DemoResetResult =
  | { readonly status: "skipped" }
  | ({ readonly status: "reset"; readonly resources: number } & DemoResetCounts);

export async function runDemoReset(
  flag: string | undefined,
  operations: DemoResetOperations,
): Promise<DemoResetResult> {
  if (flag !== "1") {
    return { status: "skipped" };
  }

  const counts = await operations.resetDomainData();
  const resources = await operations.restoreResources();

  return { status: "reset", ...counts, resources };
}

export const resetPlayground = internalMutation({
  args: {},
  returns: v.union(
    v.object({ status: v.literal("skipped") }),
    v.object({
      status: v.literal("reset"),
      reservations: v.number(),
      chatThreads: v.number(),
      chatEvents: v.number(),
      resources: v.number(),
    }),
  ),
  handler: async (ctx) =>
    runDemoReset(process.env.JEOMWON_DEMO_RESET, {
      resetDomainData: () => resetDomainData(ctx, domainConfig.domainKey),
      restoreResources: () => seedDomainResources(ctx),
    }),
});
