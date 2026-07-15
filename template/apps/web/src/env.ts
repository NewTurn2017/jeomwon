import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_APP_URL: z.url({ protocol: /^https?$/ }),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});

export const appLoginUrl = new URL(
  "/login",
  env.NEXT_PUBLIC_APP_URL,
).toString();
