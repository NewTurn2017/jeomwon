import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const templateRoot = existsSync(path.join(process.cwd(), "setup-config.json"))
  ? process.cwd()
  : path.join(process.cwd(), "template");
const script = "scripts/setup/index.ts";
const secret = "baseline-secret-sentinel";

function run(args: string[], stubs?: object) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: templateRoot,
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...process.env,
      NO_COLOR: "1",
      JEOMWON_CLI_LANG: "ko",
      ...(stubs
        ? { JEOMWON_SETUP_STUBS: JSON.stringify(stubs) }
        : { JEOMWON_SETUP_STUBS: undefined }),
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const happyStubs = {
  values: {
    AUTH_GOOGLE_ID: "baseline-client-id",
    AUTH_GOOGLE_SECRET: secret,
    JEOMWON_ADMIN_EMAILS: "owner@example.invalid",
  },
  answers: { "google-oauth:redirect-registered": true },
  convexAuthenticated: true,
  existingConvexEnv: {},
  existingLocalEnv: { app: { AUTH_ANONYMOUS_LOGIN: "0" } },
};

describe("setup baseline characterization", () => {
  test("help exits without beginning setup", () => {
    const result = run(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.includes("--dry-run")).toBe(true);
    expect(result.stdout.includes("Setup stopped [")).toBe(false);
  });

  test("fresh non-interactive dry run completes without commands, writes, or secrets", () => {
    const result = run(
      ["--dry-run", "--fresh-dry-run", "--non-interactive"],
      happyStubs,
    );
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(0);
    expect(output.includes(secret)).toBe(false);
    expect(output.includes("\u001b[")).toBe(false);
    expect(output.includes("DRY RUN:")).toBe(true);
    expect(output.includes("Setup stopped [")).toBe(false);
  });

  test("OAuth registration refusal remains categorized and redacted", () => {
    const result = run(["--dry-run", "--fresh-dry-run", "--non-interactive"], {
      ...happyStubs,
      answers: { "google-oauth:redirect-registered": false },
    });
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(1);
    expect(output.includes("[oauth_configuration]")).toBe(true);
    expect(output.includes(secret)).toBe(false);
  });

  test("option errors happen before setup output", () => {
    const result = run(["--unknown-baseline-option"]);
    expect(result.status === 0).toBe(false);
    expect(result.stdout).toBe("");
    expect(result.stderr.includes("[product_failure]")).toBe(true);
  });
});
