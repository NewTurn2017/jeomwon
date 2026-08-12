import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  DeploymentReadinessInput,
  ReadinessIssue,
} from "./deployment-readiness-contract";
import { PRODUCTION_FORBIDDEN_ENV_KEYS } from "./qa-runtime-contract";

export function validateRuntime(
  input: DeploymentReadinessInput,
  root: string,
  issues: ReadinessIssue[],
) {
  validateIdentity(input, issues);
  validateFlags(input, issues);
  validateTopology(root, issues);
}

export function readFeatures(root: string) {
  const source = readFileSync(
    join(root, "packages/backend/domain.config.ts"),
    "utf8",
  );
  const enabled = (name: string) =>
    new RegExp(`["']?${name}["']?\\s*:\\s*true`).test(source);
  return { email: enabled("email"), polar: enabled("polar") };
}

function validateIdentity(
  input: DeploymentReadinessInput,
  issues: ReadinessIssue[],
) {
  const { app, convex, web } = input.env;
  const match = /^prod:([a-z0-9-]+)$/.exec(convex.CONVEX_DEPLOYMENT ?? "");
  if (!match)
    issues.push({
      code: "convex_production_identity_invalid",
      owner: "convex",
      key: "CONVEX_DEPLOYMENT",
    });
  const name = match?.[1];
  if (
    name &&
    canonicalOrigin(convex.CONVEX_URL) !== `https://${name}.convex.cloud`
  )
    issues.push({
      code: "convex_production_url_invalid",
      owner: "convex",
      key: "CONVEX_URL",
    });
  if (
    name &&
    canonicalOrigin(convex.CONVEX_SITE_URL) !== `https://${name}.convex.site`
  )
    issues.push({
      code: "convex_production_site_invalid",
      owner: "convex",
      key: "CONVEX_SITE_URL",
    });
  if (app.NEXT_PUBLIC_CONVEX_URL !== convex.CONVEX_URL)
    issues.push({
      code: "app_backend_url_mismatch",
      owner: "app",
      key: "NEXT_PUBLIC_CONVEX_URL",
    });
  if (app.AUTH_ANONYMOUS_LOGIN !== convex.AUTH_ANONYMOUS_LOGIN)
    issues.push({
      code: "anonymous_login_mismatch",
      owner: "app",
      key: "AUTH_ANONYMOUS_LOGIN",
    });
  const appOrigin = canonicalOrigin(web.NEXT_PUBLIC_APP_URL);
  if (!appOrigin || appOrigin !== web.NEXT_PUBLIC_APP_URL)
    issues.push({
      code: "app_origin_invalid",
      owner: "web",
      key: "NEXT_PUBLIC_APP_URL",
    });
  if (!appOrigin || !input.google.authorizedOrigins.includes(appOrigin))
    issues.push({ code: "google_origin_missing", owner: "handoff" });
  const callback = `${canonicalOrigin(convex.CONVEX_SITE_URL)}/api/auth/callback/google`;
  if (!input.google.redirectUris.includes(callback))
    issues.push({ code: "google_callback_missing", owner: "handoff" });
  if (convex.JEOMWON_APP_ORIGINS !== appOrigin)
    issues.push({
      code: "polar_origin_mismatch",
      owner: "convex",
      key: "JEOMWON_APP_ORIGINS",
    });
  if (!["capture", "sent"].includes(convex.RESERVATION_EMAIL_MODE ?? ""))
    issues.push({
      code: "email_mode_invalid",
      owner: "convex",
      key: "RESERVATION_EMAIL_MODE",
    });
}

function validateFlags(
  input: DeploymentReadinessInput,
  issues: ReadinessIssue[],
) {
  for (const owner of ["app", "convex", "web"] as const) {
    for (const key of PRODUCTION_FORBIDDEN_ENV_KEYS) {
      if (input.env[owner][key])
        issues.push({ code: "production_flag_forbidden", owner, key });
    }
  }
}

function validateTopology(root: string, issues: ReadinessIssue[]) {
  try {
    const app = JSON.parse(
      readFileSync(join(root, "apps/app/package.json"), "utf8"),
    );
    const web = JSON.parse(
      readFileSync(join(root, "apps/web/package.json"), "utf8"),
    );
    const vercel = JSON.parse(
      readFileSync(join(root, "apps/app/vercel.json"), "utf8"),
    );
    if (
      app.name !== "@jeomwon/app" ||
      web.name !== "@jeomwon/web" ||
      !vercel.buildCommand?.includes("convex deploy")
    )
      issues.push({ code: "vercel_roots_invalid", owner: "project" });
    const capabilities = JSON.parse(
      readFileSync(join(root, "jeomwon-capabilities.json"), "utf8"),
    );
    if (
      capabilities.schemaVersion !== 1 ||
      !capabilities.capabilities?.some(
        (item: { id?: string }) =>
          item.id === "billing.accountSubscription.polar",
      )
    )
      issues.push({ code: "capability_receipt_invalid", owner: "project" });
    validateProjectReceipt(root, issues);
  } catch {
    issues.push({ code: "project_receipt_invalid", owner: "project" });
  }
}

function validateProjectReceipt(root: string, issues: ReadinessIssue[]) {
  const generatedPath = join(root, "jeomwon-project.json");
  const generated = existsSync(generatedPath);
  const project = JSON.parse(
    readFileSync(
      generated ? generatedPath : join(root, "jeomwon-template.json"),
      "utf8",
    ),
  );
  if (generated ? project.schemaVersion !== 3 : project.schemaVersion !== 1)
    issues.push({ code: "project_receipt_invalid", owner: "project" });
}

function canonicalOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.username &&
      !url.password
      ? url.origin
      : "";
  } catch {
    return "";
  }
}
