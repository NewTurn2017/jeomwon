import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const publicDemoFlagSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.optional(z.literal("1")),
);
const publicDemoFlag = publicDemoFlagSchema.parse(
  process.env.NEXT_PUBLIC_JEOMWON_DEMO,
);

export const env = createEnv({
  server: {
    JEOMWON_QA_BROWSER: z.optional(z.literal("1")),
    JEOMWON_QA_READY_NONCE: z.string().min(32).optional(),
  },
  shared: {
    VERCEL_URL: z
      .string()
      .optional()
      .transform((v) => (v ? `https://${v}` : undefined)),
    PORT: z.coerce.number().default(3000),
  },
  client: {
    NEXT_PUBLIC_CONVEX_URL: z.string(),
    NEXT_PUBLIC_JEOMWON_DEMO: publicDemoFlagSchema,
  },
  runtimeEnv: {
    JEOMWON_QA_BROWSER: process.env.JEOMWON_QA_BROWSER,
    JEOMWON_QA_READY_NONCE: process.env.JEOMWON_QA_READY_NONCE,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_JEOMWON_DEMO: publicDemoFlag,
    PORT: process.env.PORT,
    VERCEL_URL: process.env.VERCEL_URL,
  },
  skipValidation: !!process.env.CI || !!process.env.SKIP_ENV_VALIDATION,
});
