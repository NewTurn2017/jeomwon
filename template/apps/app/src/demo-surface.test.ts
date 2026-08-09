import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const templateRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function source(relativePath: string): string {
  return readFileSync(resolve(templateRoot, relativePath), "utf8");
}

function validateAppEnv(demoFlag: string, runningInCi = false): number {
  return (
    spawnSync(
      "env",
      [
        "-u",
        "SKIP_ENV_VALIDATION",
        `CI=${runningInCi ? "1" : ""}`,
        "NEXT_PUBLIC_CONVEX_URL=https://convex.invalid",
        `NEXT_PUBLIC_JEOMWON_DEMO=${demoFlag}`,
        "bun",
        "-e",
        'await import("./apps/app/src/env.mjs")',
      ],
      {
        cwd: templateRoot,
        stdio: "ignore",
      },
    ).status ?? -1
  );
}

describe("authenticated app demo surface", () => {
  test("mounts the public demo banner on login and authenticated shell", () => {
    // Given
    const loginSurface = source(
      "apps/app/src/app/[locale]/(public)/layout.tsx",
    );
    const authenticatedShell = source(
      "apps/app/src/app/[locale]/(dashboard)/layout.tsx",
    );

    // When
    const mounts = [loginSurface, authenticatedShell].filter(
      (candidate) =>
        candidate.includes("<DemoBanner") &&
        candidate.includes('env.NEXT_PUBLIC_JEOMWON_DEMO === "1"'),
    );

    // Then
    expect(mounts.length).toBe(2);
  });

  test("rejects malformed public demo flags at the app environment boundary", () => {
    // Given / When
    const blankExitCode = validateAppEnv("");
    const validExitCode = validateAppEnv("1");
    const malformedExitCode = validateAppEnv("true", true);
    const zeroExitCode = validateAppEnv("0");

    // Then
    expect(blankExitCode).toBe(0);
    expect(validExitCode).toBe(0);
    expect(malformedExitCode).not.toBe(0);
    expect(zeroExitCode).not.toBe(0);
  });

  test("leaves no demo runtime in the static marketing web app", () => {
    // Given
    const webLayout = source("apps/web/src/app/layout.tsx");
    const webEnv = source("apps/web/src/env.ts");
    const webBanner = resolve(
      templateRoot,
      "apps/web/src/components/demo-banner.tsx",
    );

    // When
    const runtimeReferences = [webLayout, webEnv].filter((candidate) =>
      candidate.includes("JEOMWON_DEMO"),
    );

    // Then
    expect(runtimeReferences.length).toBe(0);
    expect(existsSync(webBanner)).toBe(false);
  });

  test("keeps demo reset server-only and independent of anonymous enablement", () => {
    // Given
    const appAnonymousPolicy = source("apps/app/src/lib/anonymous-login.ts");
    const backendAnonymousPolicy = source("packages/backend/convex/auth.ts");
    const demoReset = source("packages/backend/convex/demoReset.ts");

    // When
    const anonymousPolicies = [appAnonymousPolicy, backendAnonymousPolicy];

    // Then
    expect(
      anonymousPolicies.some((candidate) =>
        candidate.includes("JEOMWON_DEMO_RESET"),
      ),
    ).toBe(false);
    expect(demoReset.includes("AUTH_ANONYMOUS_LOGIN")).toBe(false);
    expect(demoReset.includes("process.env.JEOMWON_DEMO_RESET")).toBe(true);
  });

  test("keeps deployment automation scoped to the authenticated app", () => {
    // Given
    const appVercel = JSON.parse(source("apps/app/vercel.json")) as Record<
      string,
      unknown
    >;
    const webVercel = resolve(templateRoot, "apps/web/vercel.json");

    // When
    const buildCommand = appVercel.buildCommand;

    // Then
    expect(typeof buildCommand).toBe("string");
    expect(String(buildCommand)).toContain("convex deploy");
    expect(String(buildCommand)).toContain("apps/app");
    expect(String(buildCommand)).not.toContain("apps/web");
    expect(existsSync(webVercel)).toBe(false);
  });
});
