import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const templateRoot = existsSync(path.join(process.cwd(), "setup-config.json"))
  ? process.cwd()
  : path.join(process.cwd(), "template");

test("existing Google credentials are overwritten during setup", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/setup/index.ts",
      "--dry-run",
      "--fresh-dry-run",
      "--non-interactive",
      "--lang",
      "en",
    ],
    {
      cwd: templateRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NO_COLOR: "1",
        JEOMWON_SETUP_STUBS: JSON.stringify({
          convexAuthenticated: true,
          existingConvexEnv: {
            AUTH_GOOGLE_ID: true,
            AUTH_GOOGLE_SECRET: true,
          },
          values: {
            JEOMWON_ADMIN_EMAILS: "owner@example.invalid",
          },
          existingLocalEnv: {
            app: {
              AUTH_ANONYMOUS_LOGIN: "0",
            },
          },
        }),
      },
    },
  );
  const output = `${result.stdout}${result.stderr}`;

  expect(result.status).toBe(0);
  expect(output.includes("[convex_env_set:AUTH_GOOGLE_ID]")).toBe(true);
  expect(output.includes("[convex_env_set:AUTH_GOOGLE_SECRET]")).toBe(true);
});
