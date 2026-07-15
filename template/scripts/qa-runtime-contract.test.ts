import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureTemporaryConvexEnvironment } from "./qa-convex-env-lifecycle";
import {
  CONVEX_TARGET_AUTH_OVERRIDE_NAMES,
  convexDevArgs,
  convexEnvArgs,
  convexRunArgs,
  QaRuntimeContractError,
  resolveQaConvexTarget,
  restoreConvexEnvironment,
  sanitizeConvexChildEnv,
} from "./qa-runtime-contract";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jeomwon-qa-contract-"));
  tempDirs.push(dir);
  return dir;
}

describe("QA Convex target contract", () => {
  test("Given ambient target credentials, When a child is captured, Then every override is absent and the verified target owns exact CLI args", () => {
    // Given
    const envFile = join(tempDir(), ".env.local");
    writeFileSync(
      envFile,
      "CONVEX_DEPLOYMENT=dev:verified-dev-123\nCONVEX_URL=https://verified-dev-123.convex.cloud\n",
    );
    const target = resolveQaConvexTarget(envFile);
    const sourceEnv = {
      ...process.env,
      CONVEX_ADMIN_KEY: "ambient-admin-sentinel",
      CONVEX_AGENT_MODE: "anonymous",
      CONVEX_ALLOW_ANONYMOUS: "false",
      CONVEX_DEPLOY_KEY: "ambient-deploy-sentinel",
      CONVEX_DEPLOYMENT: "prod:ambient-prod",
      CONVEX_DEPLOYMENT_TOKEN: "ambient-token-sentinel",
      CONVEX_IGNORE_SUSPICIOUS_ENV_VARS: "1",
      CONVEX_OVERRIDE_ACCESS_TOKEN: "ambient-access-sentinel",
      CONVEX_PROVISION_HOST: "https://ambient-provision.invalid",
      CONVEX_SELF_HOSTED_ADMIN_KEY: "ambient-self-hosted-key",
      CONVEX_SELF_HOSTED_URL: "https://ambient.invalid",
      CONVEX_SITE_URL: "https://ambient-site.invalid",
      CONVEX_URL: "https://ambient-cloud.invalid",
      NEXT_PUBLIC_CONVEX_URL: "https://ambient-client.invalid",
      JEOMWON_SAFE_SENTINEL: "preserved",
    };
    const captureScript = `console.log(JSON.stringify({
      admin: process.env.CONVEX_ADMIN_KEY ?? null,
      agentMode: process.env.CONVEX_AGENT_MODE ?? null,
      allowAnonymous: process.env.CONVEX_ALLOW_ANONYMOUS ?? null,
      deploy: process.env.CONVEX_DEPLOY_KEY ?? null,
      deployment: process.env.CONVEX_DEPLOYMENT ?? null,
      token: process.env.CONVEX_DEPLOYMENT_TOKEN ?? null,
      ignoreSuspicious: process.env.CONVEX_IGNORE_SUSPICIOUS_ENV_VARS ?? null,
      accessToken: process.env.CONVEX_OVERRIDE_ACCESS_TOKEN ?? null,
      provisionHost: process.env.CONVEX_PROVISION_HOST ?? null,
      selfHostedKey: process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ?? null,
      selfHostedUrl: process.env.CONVEX_SELF_HOSTED_URL ?? null,
      siteUrl: process.env.CONVEX_SITE_URL ?? null,
      cloudUrl: process.env.CONVEX_URL ?? null,
      clientUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? null,
      safe: process.env.JEOMWON_SAFE_SENTINEL ?? null,
    }))`;

    // When
    const unsafeChild = spawnSync(process.execPath, ["-e", captureScript], {
      encoding: "utf8",
      env: sourceEnv,
    });
    const child = spawnSync(process.execPath, ["-e", captureScript], {
      encoding: "utf8",
      env: sanitizeConvexChildEnv(sourceEnv),
    });

    // Then
    expect(unsafeChild.status).toBe(0);
    expect(JSON.parse(unsafeChild.stdout)).toEqual({
      admin: "ambient-admin-sentinel",
      agentMode: "anonymous",
      allowAnonymous: "false",
      deploy: "ambient-deploy-sentinel",
      deployment: "prod:ambient-prod",
      token: "ambient-token-sentinel",
      ignoreSuspicious: "1",
      accessToken: "ambient-access-sentinel",
      provisionHost: "https://ambient-provision.invalid",
      selfHostedKey: "ambient-self-hosted-key",
      selfHostedUrl: "https://ambient.invalid",
      siteUrl: "https://ambient-site.invalid",
      cloudUrl: "https://ambient-cloud.invalid",
      clientUrl: "https://ambient-client.invalid",
      safe: "preserved",
    });
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      admin: null,
      agentMode: null,
      allowAnonymous: null,
      deploy: null,
      deployment: null,
      token: null,
      ignoreSuspicious: null,
      accessToken: null,
      provisionHost: null,
      selfHostedKey: null,
      selfHostedUrl: null,
      siteUrl: null,
      cloudUrl: null,
      clientUrl: null,
      safe: "preserved",
    });
    expect(convexEnvArgs(target, ["get", "FLAG"])).toEqual([
      "convex",
      "env",
      "--deployment",
      "verified-dev-123",
      "get",
      "FLAG",
    ]);
    expect(convexDevArgs(target)).toEqual([
      "convex",
      "dev",
      "--once",
      "--env-file",
      envFile,
    ]);
    expect(convexRunArgs(target, "qaReset:resetDomain", "{}")).toEqual([
      "convex",
      "run",
      "--deployment",
      "verified-dev-123",
      "qaReset:resetDomain",
      "{}",
    ]);
  });

  test("Given the installed CLI target/auth audit, When the sanitizer contract is inspected, Then the override set is explicit and exhaustive", () => {
    expect(CONVEX_TARGET_AUTH_OVERRIDE_NAMES).toEqual([
      "CONVEX_ADMIN_KEY",
      "CONVEX_AGENT_MODE",
      "CONVEX_ALLOW_ANONYMOUS",
      "CONVEX_DEPLOY_KEY",
      "CONVEX_DEPLOYMENT_TOKEN",
      "CONVEX_IGNORE_SUSPICIOUS_ENV_VARS",
      "CONVEX_OVERRIDE_ACCESS_TOKEN",
      "CONVEX_PROVISION_HOST",
      "CONVEX_SELF_HOSTED_ADMIN_KEY",
      "CONVEX_SELF_HOSTED_URL",
      "CONVEX_DEPLOYMENT",
      "CONVEX_SITE_URL",
      "CONVEX_URL",
      "NEXT_PUBLIC_CONVEX_URL",
    ]);
  });

  test("Given a credential inside the target env file, When target resolution runs, Then it fails without echoing the value", () => {
    // Given
    const envFile = join(tempDir(), ".env.local");
    writeFileSync(
      envFile,
      "CONVEX_DEPLOYMENT=dev:verified-dev-123\nCONVEX_URL=https://verified-dev-123.convex.cloud\nCONVEX_DEPLOY_KEY=never-print-this-sentinel\n",
    );

    // When
    let failure: Error | null = null;
    try {
      resolveQaConvexTarget(envFile);
    } catch (error) {
      failure = error instanceof Error ? error : null;
    }

    // Then
    expect(failure).toBeInstanceOf(QaRuntimeContractError);
    expect(failure?.message).toContain("CONVEX_DEPLOY_KEY");
    expect(failure?.message).not.toContain("never-print-this-sentinel");
  });

  test.each([
    "CONVEX_OVERRIDE_ACCESS_TOKEN",
    "CONVEX_PROVISION_HOST",
  ])("Given %s inside the target env file, When target resolution runs, Then it is rejected without echoing its value", (name) => {
    const envFile = join(tempDir(), ".env.local");
    writeFileSync(
      envFile,
      `CONVEX_DEPLOYMENT=dev:verified-dev-123\nCONVEX_URL=https://verified-dev-123.convex.cloud\n${name}=never-print-this-sentinel\n`,
    );

    expect(() => resolveQaConvexTarget(envFile)).toThrow(name);
    try {
      resolveQaConvexTarget(envFile);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      expect(error.message).not.toContain("never-print-this-sentinel");
    }
  });

  test("Given an env read failure, When temporary configuration starts, Then no set or remove mutation is attempted", () => {
    const calls: readonly string[][] = [];
    const mutableCalls = calls as string[][];

    expect(() =>
      configureTemporaryConvexEnvironment(
        ["JEOMWON_QA_RESET", "JEOMWON_TEST_HOLD_MS"],
        { JEOMWON_QA_RESET: "1", JEOMWON_TEST_HOLD_MS: "1500" },
        (args) => {
          mutableCalls.push([...args]);
          return {
            status: args.includes("JEOMWON_TEST_HOLD_MS") ? 1 : 0,
            stdout: "",
            stderr: "private failure",
          };
        },
      ),
    ).toThrow("environment read failed");
    expect(calls).toEqual([
      ["get", "JEOMWON_QA_RESET"],
      ["get", "JEOMWON_TEST_HOLD_MS"],
    ]);
  });

  test("Given multiple restore failures, When cleanup aggregates outcomes, Then every failed variable is reported", () => {
    // Given
    const previous = new Map<string, string | null>([
      ["AUTH_ANONYMOUS_LOGIN", null],
      ["JEOMWON_ADMIN_EMAILS", "previous-value"],
      ["JEOMWON_QA_RESET", null],
    ]);

    // When
    const failures = restoreConvexEnvironment(
      [...previous.keys()],
      previous,
      (args) => ({ status: args.includes("AUTH_ANONYMOUS_LOGIN") ? 0 : 1 }),
    );

    // Then
    expect(failures).toEqual([
      "convex-env:JEOMWON_ADMIN_EMAILS",
      "convex-env:JEOMWON_QA_RESET",
    ]);
  });
});
