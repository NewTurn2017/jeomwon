import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
const secretSentinel = "sensitive-operator-sentinel@example.invalid";

type Stubs = {
  values?: Record<string, string>;
  answers?: Record<string, boolean | string>;
  existingConvexEnv?: Record<string, boolean | string>;
  existingLocalEnv?: Record<string, Record<string, string>>;
  convexUrl?: string;
  convexSiteUrl?: string;
  domainFeatures?: { polar?: boolean; customerAccounts?: boolean };
};

function baseStubs(customerAccounts = true): Stubs {
  return {
    values: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      SITE_URL: "http://localhost:3001",
      JEOMWON_ADMIN_EMAILS: secretSentinel,
    },
    answers: {
      "resend:configure": false,
      "openai:configure": false,
      "anonymous-login:enable": false,
      "anonymous-login:production-deployment": false,
    },
    existingConvexEnv: {
      JWT_PRIVATE_KEY: true,
      JWKS: true,
      SITE_URL: true,
      AUTH_GOOGLE_ID: true,
      AUTH_GOOGLE_SECRET: true,
      JEOMWON_ADMIN_EMAILS: false,
      AUTH_ANONYMOUS_LOGIN: false,
    },
    existingLocalEnv: {
      app: { AUTH_ANONYMOUS_LOGIN: "0" },
    },
    convexUrl: "https://todo5-test.convex.cloud",
    convexSiteUrl: "https://todo5-test.convex.site",
    domainFeatures: { polar: false, customerAccounts },
  };
}

function runSetup(stubs: Stubs) {
  const result = spawnSync(
    "bun",
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
        JEOMWON_SETUP_STUBS: JSON.stringify(stubs),
      },
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  expect(result.error?.message ?? "").toBe("");
  expect(output.includes(secretSentinel)).toBe(false);
  return { status: result.status, output };
}

describe("anonymous login setup matrix", () => {
  test("customer account compatibility input cannot gate anonymous login setup", () => {
    const stubs = baseStubs(false);
    stubs.answers = { ...stubs.answers, "anonymous-login:enable": true };

    const result = runSetup(stubs);

    expect(result.status).toBe(0);
    expect(result.output.includes("AUTH_DEV_ANONYMOUS")).toBe(false);
    expect(
      result.output.includes("would set Convex env AUTH_ANONYMOUS_LOGIN"),
    ).toBe(true);
    const appAgentWrites = result.output
      .split("\n")
      .filter(
        (line) =>
          line.includes("AGENT_RUNTIME") &&
          line.includes("apps/app/.env.local"),
      );
    const webRuntimeWrites = result.output
      .split("\n")
      .filter(
        (line) =>
          (line.includes("AGENT_RUNTIME") ||
            line.includes("OPENAI_API_KEY") ||
            line.includes("NEXT_PUBLIC_CONVEX_URL")) &&
          line.includes("apps/web/.env.local"),
      );
    expect(appAgentWrites.length).toBe(1);
    expect(webRuntimeWrites.length).toBe(0);
  });

  test("feature-on non-production enables Convex and app together", () => {
    const stubs = baseStubs(true);
    stubs.answers = { ...stubs.answers, "anonymous-login:enable": true };

    const result = runSetup(stubs);

    expect(result.status).toBe(0);
    expect(result.output).toMatch(
      "Anonymous login postflight passed (Convex/app synchronized; values hidden).",
    );
    expect(result.output).toMatch(
      "DRY RUN: would set Convex env AUTH_ANONYMOUS_LOGIN (value hidden).",
    );
    expect(result.output).toMatch(
      "DRY RUN: would write AUTH_ANONYMOUS_LOGIN to apps/app/.env.local.",
    );
    expect(result.output.includes("AUTH_DEV_ANONYMOUS")).toBe(false);
  });

  test("production requires the exact explicit opt-in phrase", () => {
    for (const optIn of [undefined, "yes", "true", "1", " enable "]) {
      const stubs = baseStubs(true);
      stubs.answers = {
        ...stubs.answers,
        "anonymous-login:enable": true,
        "anonymous-login:production-deployment": true,
        ...(optIn === undefined
          ? {}
          : { "anonymous-login:production-opt-in": optIn }),
      };

      const result = runSetup(stubs);
      expect(result.status).toBe(1);
      expect(result.output).toMatch("explicit production opt-in is required");
      expect(
        result.output.includes("would set Convex env AUTH_ANONYMOUS_LOGIN"),
      ).toBe(false);
    }

    const allowed = baseStubs(true);
    allowed.answers = {
      ...allowed.answers,
      "anonymous-login:enable": true,
      "anonymous-login:production-deployment": true,
      "anonymous-login:production-opt-in": "ENABLE_PRODUCTION_ANONYMOUS_LOGIN",
    };
    expect(runSetup(allowed).status).toBe(0);
  });

  test("production with an empty allowlist refuses before enablement", () => {
    const stubs = baseStubs(true);
    stubs.values = { ...stubs.values, JEOMWON_ADMIN_EMAILS: "" };
    stubs.answers = {
      ...stubs.answers,
      "anonymous-login:enable": true,
      "anonymous-login:production-deployment": true,
      "anonymous-login:production-opt-in": "ENABLE_PRODUCTION_ANONYMOUS_LOGIN",
    };

    const result = runSetup(stubs);

    expect(result.status).toBe(1);
    expect(result.output).toMatch("JEOMWON_ADMIN_EMAILS is required");
  });

  test("a malformed allowlist refuses before anonymous enablement", () => {
    const stubs = baseStubs(true);
    stubs.values = { ...stubs.values, JEOMWON_ADMIN_EMAILS: "not-an-email" };
    stubs.answers = { ...stubs.answers, "anonymous-login:enable": true };

    const result = runSetup(stubs);

    expect(result.status).toBe(1);
    expect(result.output).toMatch(
      "JEOMWON_ADMIN_EMAILS expects email addresses",
    );
    expect(
      result.output.includes("would set Convex env AUTH_ANONYMOUS_LOGIN"),
    ).toBe(false);
  });

  for (const [label, existingAllowlist] of [
    ["malformed", "not-an-email"],
    ["normalized-empty", " , "],
  ] as const) {
    test(`pre-existing ${label} allowlist refuses before anonymous writes`, () => {
      const stubs = baseStubs(true);
      stubs.values = {
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        SITE_URL: "http://localhost:3001",
      };
      stubs.existingConvexEnv = {
        ...stubs.existingConvexEnv,
        JEOMWON_ADMIN_EMAILS: existingAllowlist,
      };
      stubs.answers = {
        ...stubs.answers,
        "overwrite:JEOMWON_ADMIN_EMAILS": false,
        "anonymous-login:enable": true,
        "anonymous-login:production-deployment": true,
        "anonymous-login:production-opt-in":
          "ENABLE_PRODUCTION_ANONYMOUS_LOGIN",
      };

      const result = runSetup(stubs);

      expect(result.status).toBe(1);
      expect(result.output).toMatch("JEOMWON_ADMIN_EMAILS");
      expect(result.output.includes(existingAllowlist)).toBe(false);
      expect(
        result.output.includes("would set Convex env AUTH_ANONYMOUS_LOGIN"),
      ).toBe(false);
      expect(result.output.includes("Anonymous login postflight passed")).toBe(
        false,
      );
    });
  }

  test("postflight refuses either stale app/provider mismatch", () => {
    const providerOff = baseStubs(true);
    providerOff.existingLocalEnv = { app: { AUTH_ANONYMOUS_LOGIN: "1" } };
    const first = runSetup(providerOff);
    expect(first.status).toBe(1);
    expect(first.output).toMatch("anonymous_login_config_mismatch");
    expect(
      first.output.includes("would set Convex env AUTH_ANONYMOUS_LOGIN"),
    ).toBe(false);

    const appOff = baseStubs(true);
    appOff.existingConvexEnv = {
      ...appOff.existingConvexEnv,
      AUTH_ANONYMOUS_LOGIN: "1",
    };
    const second = runSetup(appOff);
    expect(second.status).toBe(1);
    expect(second.output).toMatch("anonymous_login_config_mismatch");
    expect(
      second.output.includes("would set Convex env AUTH_ANONYMOUS_LOGIN"),
    ).toBe(false);
  });

  test("the removed legacy env cannot enable or appear in setup output", () => {
    const stubs = baseStubs(true);
    stubs.existingConvexEnv = {
      ...stubs.existingConvexEnv,
      AUTH_DEV_ANONYMOUS: "1",
    };
    stubs.existingLocalEnv = {
      app: { AUTH_ANONYMOUS_LOGIN: "0", AUTH_DEV_ANONYMOUS: "1" },
    };

    const result = runSetup(stubs);

    expect(result.status).toBe(0);
    expect(result.output.includes("AUTH_DEV_ANONYMOUS")).toBe(false);
  });
});
