import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
const setupScript = fileURLToPath(
  new URL("../../../scripts/setup/index.ts", import.meta.url),
);
const clientId = "google-client-id.apps.googleusercontent.com";
const clientSecret = "google-client-secret-sentinel";
const adminEmail = "owner@example.invalid";

function runFreshSetup() {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/setup/index.ts",
      "--dry-run",
      "--fresh-dry-run",
      "--non-interactive",
    ],
    {
      cwd: templateRoot,
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        NO_COLOR: "1",
        JEOMWON_SETUP_STUBS: JSON.stringify({
          values: {
            AUTH_GOOGLE_ID: clientId,
            AUTH_GOOGLE_SECRET: clientSecret,
            JEOMWON_ADMIN_EMAILS: adminEmail,
          },
          answers: {
            "google-oauth:redirect-registered": true,
          },
          convexAuthenticated: true,
          existingConvexEnv: {},
          existingLocalEnv: {
            app: { AUTH_ANONYMOUS_LOGIN: "0" },
          },
          domainFeatures: { polar: true },
        }),
      },
    },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

describe("first-success setup contract", () => {
  test("fresh local setup needs only the two Google values and one admin email", () => {
    const result = runFreshSetup();

    expect(result.status).toBe(0);
    expect(
      result.output.includes(
        "Redirect URI: https://template-dry-run.convex.site/api/auth/callback/google",
      ),
    ).toBe(true);
    expect(result.output.includes("Redirect URI 등록 확인됨 (stub)")).toBe(
      true,
    );
    expect(
      result.output.includes("로컬 첫 성공용 익명 고객 로그인 자동 활성화"),
    ).toBe(true);
    expect(
      result.output.includes(
        "DRY RUN: would write AGENT_RUNTIME to apps/app/.env.local.",
      ),
    ).toBe(true);
    expect(
      result.output.includes(
        "Resend · OpenAI · Polar 설정은 첫 성공 이후로 유예",
      ),
    ).toBe(true);
    expect(result.output.includes(clientId)).toBe(false);
    expect(result.output.includes(clientSecret)).toBe(false);
    expect(result.output.includes(adminEmail)).toBe(false);
    expect(result.output.includes("Convex project name:")).toBe(false);
    expect(result.output.includes("Configure Resend now?")).toBe(false);
    expect(result.output.includes("Configure OpenAI now?")).toBe(false);
  });

  test("non-interactive OAuth refuses to bypass redirect registration", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/setup/index.ts",
        "--dry-run",
        "--fresh-dry-run",
        "--non-interactive",
      ],
      {
        cwd: templateRoot,
        encoding: "utf8",
        timeout: 15_000,
        env: {
          ...process.env,
          NO_COLOR: "1",
          JEOMWON_SETUP_STUBS: JSON.stringify({
            values: {
              AUTH_GOOGLE_ID: clientId,
              AUTH_GOOGLE_SECRET: clientSecret,
              JEOMWON_ADMIN_EMAILS: adminEmail,
            },
            answers: {
              "google-oauth:redirect-registered": false,
            },
            convexAuthenticated: true,
            existingConvexEnv: {},
            existingLocalEnv: {
              app: { AUTH_ANONYMOUS_LOGIN: "0" },
            },
          }),
        },
      },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    expect(result.status).toBe(1);
    expect(output.includes("Setup stopped [oauth_configuration]")).toBe(true);
    expect(
      output.includes(
        "https://template-dry-run.convex.site/api/auth/callback/google",
      ),
    ).toBe(true);
    expect(output.includes(clientSecret)).toBe(false);
  });

  test("Convex commands use the active Bun executable without npx shell lookup", () => {
    const source = readFileSync(setupScript, "utf8");

    expect(
      source.includes('spawn(process.execPath, ["x", "convex", ...args]'),
    ).toBe(true);
    expect(source.includes('runCommand(ctx, "npx"')).toBe(false);
    expect(source.includes('spawn("npx"')).toBe(false);
  });
});
