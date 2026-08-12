import { afterEach, describe, expect, test } from "bun:test";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  checkDeploymentReadiness,
  type DeploymentReadinessInput,
} from "./deployment-readiness";
import { writeDeploymentReport } from "./deployment-readiness-output";
import { PRODUCTION_FORBIDDEN_ENV_KEYS } from "./qa-runtime-contract";

const root = resolve(import.meta.dir, "..");
const fixturePath = join(
  import.meta.dir,
  "fixtures/deployment-readiness-complete.json",
);
const temporaryRoots: string[] = [];
afterEach(() => {
  for (const path of temporaryRoots.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture(): DeploymentReadinessInput {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}
function run(input = fixture(), projectRoot = root) {
  return checkDeploymentReadiness(input, projectRoot);
}
function temp(prefix = "deployment-readiness-") {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(path);
  return path;
}
function featureRoot(features: { email: boolean; polar: boolean }) {
  const target = temp("deployment-project-");
  for (const path of [
    "apps/app/package.json",
    "apps/app/vercel.json",
    "apps/web/package.json",
    "jeomwon-capabilities.json",
    "jeomwon-template.json",
  ]) {
    mkdirSync(join(target, path, ".."), { recursive: true });
    cpSync(join(root, path), join(target, path));
  }
  mkdirSync(join(target, "packages/backend"), { recursive: true });
  writeFileSync(
    join(target, "packages/backend/domain.config.ts"),
    `export const domainConfig={features:${JSON.stringify(features)}}`,
  );
  return target;
}
function outputFixture() {
  const reportRoot = temp("deployment-output-");
  const outside = temp("deployment-outside-");
  const canary = join(outside, "canary");
  writeFileSync(canary, "unchanged");
  return { reportRoot, outside, canary };
}
function unchanged(canary: string) {
  expect(readFileSync(canary, "utf8")).toBe("unchanged");
}
function sourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "_generated", ".next", ".turbo"].includes(entry.name))
      return [];
    const child = join(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.(?:mjs|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [child]
      : [];
  });
}

describe("deployment readiness", () => {
  test("missing values name owners and conditional requirements", () => {
    const input = fixture();
    delete input.env.convex.RESEND_API_KEY;
    delete input.env.app.AGENT_RUNTIME;
    const result = run(input);
    expect(result.human).toContain("convex:RESEND_API_KEY");
    expect(result.report.environment).toContainEqual({
      owner: "convex",
      key: "RESEND_API_KEY",
      present: false,
    });
  });
  test("rejects backend mismatch and invalid production identity", () => {
    const input = fixture();
    input.env.app.NEXT_PUBLIC_CONVEX_URL = "https://other.convex.cloud";
    input.env.convex.CONVEX_DEPLOYMENT = "dev:store-production";
    expect(run(input).codes).toEqual(
      expect.arrayContaining([
        "app_backend_url_mismatch",
        "convex_production_identity_invalid",
      ]),
    );
  });
  test("checks Google origin and callback exactly", () => {
    const input = fixture();
    input.google.authorizedOrigins = [];
    input.google.redirectUris = [];
    expect(run(input).codes).toEqual(
      expect.arrayContaining([
        "google_origin_missing",
        "google_callback_missing",
      ]),
    );
  });
  test("email capture omits Resend while sent requires it", () => {
    const input = fixture();
    input.env.convex.RESERVATION_EMAIL_MODE = "capture";
    delete input.env.convex.RESEND_API_KEY;
    delete input.env.convex.RESEND_SENDER_EMAIL_AUTH;
    const capture = run(input);
    expect(capture.ok).toBe(true);
    expect(capture.report.vercelRoots.map(({ root }) => root)).toEqual([
      "apps/app",
      "apps/web",
    ]);
    input.env.convex.RESERVATION_EMAIL_MODE = "sent";
    expect(run(input).codes).toContain("env_missing");
  });
  test("Polar variables are conditional and account-subscription only", () => {
    expect(run().report.boundaries.polar).toBe("account-subscription-only");
    const enabled = run(fixture(), featureRoot({ email: true, polar: true }));
    for (const key of [
      "POLAR_ORGANIZATION_TOKEN",
      "POLAR_WEBHOOK_SECRET",
      "POLAR_PRODUCT_IDS",
    ])
      expect(enabled.human).toContain(`convex:${key}`);
  });
  test("rejects every authoritative forbidden key for every owner", () => {
    for (const owner of ["app", "convex", "web"] as const)
      for (const key of PRODUCTION_FORBIDDEN_ENV_KEYS) {
        const input = fixture();
        input.env[owner][key] = "present";
        expect(run(input).codes).toContain("production_flag_forbidden");
      }
  });
  test("independently rejects representative QA override classes", () => {
    const input = fixture();
    for (const key of [
      "JEOMWON_QA_OPERATOR_EMAIL",
      "JEOMWON_QA_CUSTOMER_STORAGE_STATE",
      "JEOMWON_QA_ARTIFACT_DIR",
      "JEOMWON_QA_RESET",
      "JEOMWON_QA_APP_READY_TIMEOUT_MS",
    ])
      input.env.convex[key] = "present";
    expect(
      run(input).codes.filter((code) => code === "production_flag_forbidden"),
    ).toHaveLength(5);
  });
  test("authoritative list covers shipped QA/reset/test-hold env reads", () => {
    const forbidden = new Set<string>(PRODUCTION_FORBIDDEN_ENV_KEYS);
    for (const sourceRoot of ["apps", "packages", "scripts"])
      for (const path of sourceFiles(join(root, sourceRoot)))
        for (const match of readFileSync(path, "utf8").matchAll(
          /process\.env\.(JEOMWON_[A-Z0-9_]+)/g,
        )) {
          const key = match[1];
          if (
            key &&
            (key.startsWith("JEOMWON_QA_") ||
              key === "JEOMWON_DEMO_RESET" ||
              key === "JEOMWON_TEST_HOLD_MS")
          )
            expect(forbidden.has(key)).toBe(true);
        }
  });
  test("never exposes secrets, emails, tokens, URLs, or adversarial keys", () => {
    const input = fixture();
    input.env.convex["JEOMWON_QA_operator@example.invalid"] = "token-secret";
    const result = run(input);
    const output = `${result.human}\n${JSON.stringify(result.report)}`;
    for (const sentinel of [
      "fixture-private-key-not-a-real-secret",
      "operator@example.invalid",
      "https://app.example.invalid",
      "token-secret",
    ])
      expect(output).not.toContain(sentinel);
    expect(output).not.toMatch(/https?:\/\/|[\w.+-]+@[\w.-]+/);
  });
});

describe("deployment report output containment", () => {
  test("writes only a new file in an existing contained directory", () => {
    const { reportRoot } = outputFixture();
    mkdirSync(join(reportRoot, "nested"));
    writeDeploymentReport(reportRoot, "nested/report.json", { ready: true });
    expect(
      JSON.parse(readFileSync(join(reportRoot, "nested/report.json"), "utf8")),
    ).toEqual({ ready: true });
  });
  for (const candidate of [
    "../outside.json",
    "/tmp/outside.json",
    "nested/../../outside.json",
  ])
    test(`rejects lexical escape ${candidate}`, () => {
      const { reportRoot, canary } = outputFixture();
      expect(() => writeDeploymentReport(reportRoot, candidate, {})).toThrow(
        "report_path_invalid",
      );
      unchanged(canary);
    });
  test("rejects symlinked root, intermediate, and nested chain", () => {
    const { reportRoot, outside, canary } = outputFixture();
    symlinkSync(outside, join(reportRoot, "root-link"));
    mkdirSync(join(reportRoot, "nested"));
    symlinkSync(outside, join(reportRoot, "nested", "link"));
    symlinkSync(join(reportRoot, "nested", "link"), join(reportRoot, "chain"));
    expect(() =>
      writeDeploymentReport(join(reportRoot, "root-link"), "report.json", {}),
    ).toThrow("report_root_unsafe");
    for (const path of ["nested/link/report.json", "chain/report.json"])
      expect(() => writeDeploymentReport(reportRoot, path, {})).toThrow(
        "report_parent_unsafe",
      );
    unchanged(canary);
  });
  test("rejects missing parent, existing file, leaf symlink, and FIFO", () => {
    const { reportRoot, canary } = outputFixture();
    writeFileSync(join(reportRoot, "existing.json"), "unchanged");
    symlinkSync(canary, join(reportRoot, "link.json"));
    expect(
      Bun.spawnSync(["mkfifo", join(reportRoot, "fifo.json")]).exitCode,
    ).toBe(0);
    expect(() =>
      writeDeploymentReport(reportRoot, "missing/report.json", {}),
    ).toThrow("report_parent_missing");
    expect(() =>
      writeDeploymentReport(reportRoot, "existing.json", {}),
    ).toThrow("report_output_exists");
    for (const path of ["link.json", "fifo.json"])
      expect(() => writeDeploymentReport(reportRoot, path, {})).toThrow(
        "report_output_unsafe",
      );
    unchanged(canary);
  });
});
