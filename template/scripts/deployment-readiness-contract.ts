import { createHash } from "node:crypto";
import {
  readFeatures,
  validateRuntime,
} from "./deployment-readiness-validation";

export type EnvOwner = "app" | "convex" | "web";
export type EnvValues = Record<string, string>;
export type DeploymentReadinessInput = {
  schemaVersion: 1;
  rollbackTarget: string;
  google: { authorizedOrigins: string[]; redirectUris: string[] };
  env: Record<EnvOwner, EnvValues>;
};
export type ReadinessIssue = {
  code: string;
  owner?: EnvOwner | "handoff" | "project";
  key?: string;
};

export const OWNER_KEYS: Record<EnvOwner, readonly string[]> = {
  web: ["NEXT_PUBLIC_APP_URL"],
  app: [
    "NEXT_PUBLIC_CONVEX_URL",
    "AUTH_ANONYMOUS_LOGIN",
    "AGENT_RUNTIME",
    "OPENAI_API_KEY",
  ],
  convex: [
    "CONVEX_DEPLOYMENT",
    "CONVEX_URL",
    "CONVEX_SITE_URL",
    "SITE_URL",
    "JEOMWON_APP_ORIGINS",
    "JWT_PRIVATE_KEY",
    "JWKS",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "JEOMWON_ADMIN_EMAILS",
    "AUTH_ANONYMOUS_LOGIN",
    "RESERVATION_EMAIL_MODE",
    "RESEND_API_KEY",
    "RESEND_SENDER_EMAIL_AUTH",
    "POLAR_ORGANIZATION_TOKEN",
    "POLAR_WEBHOOK_SECRET",
    "POLAR_PRODUCT_IDS",
  ],
};

const BASE_REQUIRED: Record<EnvOwner, readonly string[]> = {
  web: ["NEXT_PUBLIC_APP_URL"],
  app: ["NEXT_PUBLIC_CONVEX_URL", "AUTH_ANONYMOUS_LOGIN", "AGENT_RUNTIME"],
  convex: [
    "CONVEX_DEPLOYMENT",
    "CONVEX_URL",
    "CONVEX_SITE_URL",
    "SITE_URL",
    "JEOMWON_APP_ORIGINS",
    "JWT_PRIVATE_KEY",
    "JWKS",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "JEOMWON_ADMIN_EMAILS",
    "AUTH_ANONYMOUS_LOGIN",
    "RESERVATION_EMAIL_MODE",
  ],
};

export function parseInput(value: unknown): DeploymentReadinessInput {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !record(value.env) ||
    !record(value.google)
  )
    throw new Error("input_schema_invalid");
  const env = value.env;
  if (!["app", "convex", "web"].every((owner) => stringRecord(env[owner])))
    throw new Error("input_env_invalid");
  const google = value.google;
  if (
    typeof value.rollbackTarget !== "string" ||
    !value.rollbackTarget.trim() ||
    !stringArray(google.authorizedOrigins) ||
    !stringArray(google.redirectUris)
  )
    throw new Error("input_handoff_invalid");
  return value as DeploymentReadinessInput;
}

export function validateInput(input: DeploymentReadinessInput, root: string) {
  const issues: ReadinessIssue[] = [];
  const features = readFeatures(root);
  const required = new Map<EnvOwner, Set<string>>(
    (["app", "convex", "web"] as const).map((owner) => [
      owner,
      new Set(BASE_REQUIRED[owner]),
    ]),
  );
  if (input.env.app.AGENT_RUNTIME === "openai")
    required.get("app")?.add("OPENAI_API_KEY");
  if (features.email && input.env.convex.RESERVATION_EMAIL_MODE === "sent") {
    required.get("convex")?.add("RESEND_API_KEY");
    required.get("convex")?.add("RESEND_SENDER_EMAIL_AUTH");
  }
  if (features.polar) {
    for (const key of [
      "POLAR_ORGANIZATION_TOKEN",
      "POLAR_WEBHOOK_SECRET",
      "POLAR_PRODUCT_IDS",
    ])
      required.get("convex")?.add(key);
  }
  for (const [owner, keys] of required) {
    for (const key of keys)
      if (!input.env[owner][key]?.trim())
        issues.push({ code: "env_missing", owner, key });
  }
  validateRuntime(input, root, issues);
  return { features, issues: sortIssues(issues) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function stringRecord(value: unknown): value is EnvValues {
  return (
    record(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}
function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
function sortIssues(issues: ReadinessIssue[]) {
  return issues.sort((a, b) =>
    `${a.code}:${a.owner}:${a.key}`.localeCompare(
      `${b.code}:${b.owner}:${b.key}`,
    ),
  );
}
export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
