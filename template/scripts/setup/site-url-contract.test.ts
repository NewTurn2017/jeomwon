import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { readSetupConfig } from "./config";
import { isConvexEnvReadResultConfigured } from "./convex";

const templateRoot = existsSync(path.join(process.cwd(), "setup-config.json"))
  ? process.cwd()
  : path.join(process.cwd(), "template");

test("Given Convex reports SITE_URL missing with exit zero When setup checks it Then the variable is absent", () => {
  expect(
    isConvexEnvReadResultConfigured({
      code: 0,
      stdout: "",
      stderr:
        '✖ Environment variable "SITE_URL" not found (on dev deployment example)',
    }),
  ).toBe(false);
});

test("Given local development When setup resolves SITE_URL Then it uses the authenticated app origin", () => {
  const config = readSetupConfig(path.join(templateRoot, "setup-config.json"));
  const siteStep = config.steps.find((step) => step.id === "site-url");
  const siteVariable = siteStep?.variables.find(
    (variable) => variable.name === "SITE_URL",
  );

  expect(siteVariable?.defaultValue).toBe("http://localhost:3000");
});

test("Given SITE_URL appears configured When setup runs Then it force-writes the required auth origin", () => {
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
          values: {
            AUTH_GOOGLE_ID: "client-id",
            AUTH_GOOGLE_SECRET: "client-secret",
            JEOMWON_ADMIN_EMAILS: "owner@example.invalid",
          },
          answers: { "google-oauth:redirect-registered": true },
          convexAuthenticated: true,
          existingConvexEnv: {
            JWT_PRIVATE_KEY: true,
            JWKS: true,
            SITE_URL: true,
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
  expect(output.includes("[convex_env_set:SITE_URL]")).toBe(true);
  expect(output.includes("Overwrite SITE_URL?")).toBe(false);
});
