import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../../../scripts/setup/config";

const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
const setupScript = fileURLToPath(
  new URL("../../../scripts/setup/index.ts", import.meta.url),
);
const clientId = "google-client-id.apps.googleusercontent.com";
const clientSecret = "google-client-secret-sentinel";
const adminEmail = "owner@example.invalid";
const expectedRedirectUri = `https://${slugify(basename(templateRoot))}-dry-run.convex.site/api/auth/callback/google`;

function runFreshSetup(extraArgs: string[] = []) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/setup/index.ts",
      "--dry-run",
      "--fresh-dry-run",
      "--non-interactive",
      ...extraArgs,
    ],
    {
      cwd: templateRoot,
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        NO_COLOR: "1",
        JEOMWON_CLI_LANG: "ko",
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
          domainFeatures: { email: true, polar: true },
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
    expect(result.output.includes(`Redirect URI: ${expectedRedirectUri}`)).toBe(
      true,
    );
    expect(result.output.includes("Redirect URI 등록 확인됨 (stub)")).toBe(
      true,
    );
    expect(
      result.output.includes("로컬 첫 성공용 익명 고객 로그인 자동 활성화"),
    ).toBe(true);
    expect(result.output.includes("[local_env_write:app:AGENT_RUNTIME]")).toBe(
      true,
    );
    expect(result.output.includes(clientId)).toBe(false);
    expect(result.output.includes(clientSecret)).toBe(false);
    expect(result.output.includes(adminEmail)).toBe(false);
    expect(result.output.includes("Convex project name:")).toBe(false);
  });

  test("the default run offers every provider and still finishes unattended", () => {
    const result = runFreshSetup();

    expect(result.status).toBe(0);
    for (const step of ["Resend", "OpenAI", "Polar"]) {
      expect(result.output.includes(`  ${step}\n`)).toBe(true);
    }
    for (const key of [
      "RESEND_API_KEY",
      "OPENAI_API_KEY",
      "POLAR_WEBHOOK_SECRET",
      "POLAR_ORGANIZATION_TOKEN",
      "POLAR_PRODUCT_IDS",
      "POLAR_DEPOSIT_PRODUCT_ID",
    ]) {
      expect(result.output.includes(`[skip] ${key}`)).toBe(true);
    }
    expect(result.output.includes("6개 키 미설정")).toBe(true);
  });

  test("--minimal keeps the Convex and Google only path", () => {
    const result = runFreshSetup(["--minimal"]);

    expect(result.status).toBe(0);
    expect(
      result.output.includes(
        "Resend · OpenAI · Polar 설정은 첫 성공 이후로 유예",
      ),
    ).toBe(true);
    expect(result.output.includes("Configure Resend now?")).toBe(false);
    expect(result.output.includes("Configure OpenAI now?")).toBe(false);
    expect(result.output.includes("POLAR_WEBHOOK_SECRET")).toBe(false);
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
          JEOMWON_CLI_LANG: "ko",
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
    expect(output.includes("[oauth_configuration]")).toBe(true);
    expect(output.includes(expectedRedirectUri)).toBe(true);
    expect(output.includes(clientSecret)).toBe(false);
  });

  test("Convex commands use the active Bun executable without npx shell lookup", () => {
    const indexSource = readFileSync(setupScript, "utf8");
    const convexSource = readFileSync(
      fileURLToPath(
        new URL("../../../scripts/setup/convex.ts", import.meta.url),
      ),
      "utf8",
    );
    const source = `${indexSource}\n${convexSource}`;

    expect(
      source.includes('spawn(process.execPath, ["x", "convex", ...args]'),
    ).toBe(true);
    expect(source.includes('runCommand(ctx, "npx"')).toBe(false);
    expect(source.includes('spawn("npx"')).toBe(false);
  });
});
