import { v } from "convex/values";
import { domainConfig } from "../domain.config";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

export const seed = mutation({
  args: {},
  returns: v.object({
    resources: v.number(),
  }),
  handler: async (ctx) => {
    return { resources: await seedDomainResources(ctx) };
  },
});

export async function seedDomainResources(ctx: MutationCtx) {
  const now = Date.now();
  let touched = 0;

  for (const resource of domainConfig.resources) {
    const existing = await ctx.db
      .query("resources")
      .withIndex("by_domain_key", (q) =>
        q.eq("domainKey", domainConfig.domainKey).eq("key", resource.key),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        label: resource.label,
        kind: resource.kind,
        active: true,
        updatedAtMs: now,
      });
    } else {
      await ctx.db.insert("resources", {
        domainKey: domainConfig.domainKey,
        key: resource.key,
        label: resource.label,
        kind: resource.kind,
        active: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
    touched += 1;
  }

  return touched;
}
