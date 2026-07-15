import { describe, expect, test } from "bun:test";
import { domainConfig } from "@jeomwon/backend/domain.config";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appUrl = "https://app.example.invalid";

function runEnvProbe(nextAppUrl?: string) {
  const childEnv = { ...process.env };
  delete childEnv.CI;
  delete childEnv.SKIP_ENV_VALIDATION;
  delete childEnv.NEXT_PUBLIC_APP_URL;
  childEnv.NEXT_PUBLIC_CONVEX_URL = "https://contract.convex.cloud";
  if (nextAppUrl !== undefined) {
    childEnv.NEXT_PUBLIC_APP_URL = nextAppUrl;
  }

  return spawnSync("bun", ["-e", 'await import("./apps/web/src/env.ts")'], {
    cwd: templateRoot,
    encoding: "utf8",
    env: childEnv,
    timeout: 5_000,
  });
}

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    if (
      !/\.(css|ts|tsx)$/.test(entry.name) ||
      entry.name.endsWith(".test.tsx")
    ) {
      return [];
    }
    return [path];
  });
}

describe("static marketing surface", () => {
  test("retains domain-configured reservation guidance", async () => {
    // Given
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://baseline.convex.cloud";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.invalid";

    // When
    const { default: Page } = await import("./app/page");
    const markup = renderToStaticMarkup(<Page />);

    // Then
    expect(markup.includes(domainConfig.storeName)).toBe(true);
    expect(
      domainConfig.services.every((service) => markup.includes(service.label)),
    ).toBe(true);
    expect(markup.includes(String(domainConfig.policies.holdMinutes))).toBe(
      true,
    );
    expect(
      markup.includes(String(domainConfig.policies.cancelWindowHours)),
    ).toBe(true);
  });

  test("rejects a missing app URL at the environment boundary", () => {
    // Given / When
    const missing = runEnvProbe();

    // Then
    expect(missing.status === 0).toBe(false);
  });

  test("rejects a malformed app URL at the environment boundary", () => {
    // Given / When
    const malformed = runEnvProbe("not-a-url");

    // Then
    expect(malformed.status === 0).toBe(false);
  });

  test("rejects a non-HTTP app URL at the environment boundary", () => {
    // Given / When
    const unsupportedProtocol = runEnvProbe("ftp://app.example.invalid");

    // Then
    expect(unsupportedProtocol.status === 0).toBe(false);
  });

  test("accepts an HTTPS app URL at the environment boundary", () => {
    // Given / When
    const valid = runEnvProbe(appUrl);

    // Then
    expect(valid.status).toBe(0);
  });

  test("renders every reservation CTA as a direct app login link", async () => {
    // Given
    process.env.NEXT_PUBLIC_APP_URL = appUrl;

    // When
    const [{ default: Page }, { Header }] = await Promise.all([
      import("./app/page"),
      import("./components/header"),
    ]);
    const markup = `${renderToStaticMarkup(<Header />)}${renderToStaticMarkup(
      <Page />,
    )}`;
    const loginLinks = markup.match(
      /href="https:\/\/app\.example\.invalid\/login"/g,
    );

    // Then
    expect(loginLinks?.length).toBe(2);
    expect(markup.includes("<button")).toBe(false);
  });

  test("contains no public chat runtime or Convex deployment surface", () => {
    // Given
    const removedPaths = [
      "src/app/api/chat/route.ts",
      "src/app/convex-client-provider.tsx",
      "src/components/chat-cta-button.tsx",
      "src/components/customer-chat-widget.css",
      "src/components/customer-chat-widget.tsx",
    ] as const;
    const forbiddenRuntimeTokens = [
      "@jeomwon/agents",
      "convex/react",
      "CustomerChatWidget",
      "ChatCtaButton",
      "jeomwon:open-chat",
      "localStorage",
      "/api/chat",
    ] as const;

    // When
    const source = sourceFiles(`${webRoot}/src`)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const packageJson = readFileSync(`${webRoot}/package.json`, "utf8");
    const vercelConfigPath = `${webRoot}/vercel.json`;
    const vercelConfig = existsSync(vercelConfigPath)
      ? readFileSync(vercelConfigPath, "utf8")
      : "";

    // Then
    expect(
      removedPaths.every((path) => !existsSync(`${webRoot}/${path}`)),
    ).toBe(true);
    expect(
      forbiddenRuntimeTokens.every((token) => !source.includes(token)),
    ).toBe(true);
    expect(
      [
        '"@convex-dev/auth"',
        '"@convex-dev/polar"',
        '"@jeomwon/agents"',
        '"convex"',
      ].every((dependency) => !packageJson.includes(dependency)),
    ).toBe(true);
    expect(vercelConfig.includes("convex deploy")).toBe(false);
  });
});
