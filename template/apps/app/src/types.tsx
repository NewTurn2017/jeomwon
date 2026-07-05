import type { Doc } from "@jeomwon/backend/convex/_generated/dataModel";

export type User = Doc<"users"> & {
  avatarUrl?: string;
};
