#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type DeploymentReadinessInput,
  type EnvOwner,
  OWNER_KEYS,
  parseInput,
  sha256,
  validateInput,
} from "./deployment-readiness-contract";
import { writeDeploymentReport } from "./deployment-readiness-output";

export type { DeploymentReadinessInput } from "./deployment-readiness-contract";

type ReportBody = {
  schemaVersion: 1;
  status: "blocked" | "ready";
  vercelRoots: Array<{
    kind: "authenticated-app" | "static-web";
    root: string;
  }>;
  identities: Record<string, { present: boolean; sha256?: string }>;
  environment: Array<{
    owner: EnvOwner;
    key: string;
    present: boolean;
    sha256?: string;
  }>;
  checks: Array<{ code: string; owner?: string; key?: string; status: "fail" }>;
  features: { email: boolean; polar: boolean };
  boundaries: {
    polar: "account-subscription-and-reservation-deposit";
    reservationCommerce: "deposit-only";
  };
  deploymentOrder: readonly string[];
  rollback: { targetPresent: true; targetSha256: string };
  productionSmokeChecklist: readonly string[];
  externalEffects: "none-read-only";
};

export function checkDeploymentReadiness(
  input: DeploymentReadinessInput,
  root = resolve(import.meta.dir, ".."),
) {
  const { features, issues } = validateInput(input, root);
  const body: ReportBody = {
    schemaVersion: 1,
    status: issues.length === 0 ? "ready" : "blocked",
    vercelRoots: [
      { kind: "authenticated-app", root: "apps/app" },
      { kind: "static-web", root: "apps/web" },
    ],
    identities: receiptIdentities(root),
    environment: environmentReceipt(input, issues),
    checks: issues.map((issue) => ({ ...issue, status: "fail" })),
    features,
    boundaries: {
      polar: "account-subscription-and-reservation-deposit",
      reservationCommerce: "deposit-only",
    },
    deploymentOrder: [
      "configure-convex-production-environment",
      "deploy-authenticated-app-root-with-convex",
      "smoke-auth-and-backend",
      "deploy-static-web-root",
      "run-production-smoke-checklist",
    ],
    rollback: {
      targetPresent: true,
      targetSha256: sha256(input.rollbackTarget.trim()),
    },
    productionSmokeChecklist: [
      "static-web-links-to-authenticated-app",
      "google-customer-login-and-operator-denial",
      "customer-reservation-lifecycle",
      "operator-dashboard-authorized-only",
      "email-mode-observed-without-recipient-disclosure",
      "account-subscription-boundary-if-enabled",
      "qa-and-reset-surfaces-disabled",
      "rollback-target-recorded",
    ],
    externalEffects: "none-read-only",
  };
  const reportHash = sha256(stableJson(body));
  const report = { ...body, reportHash };
  return {
    ok: body.status === "ready",
    codes: issues.map(({ code }) => code),
    report,
    reportHash,
    human: humanReport(report),
  };
}

function environmentReceipt(
  input: DeploymentReadinessInput,
  issues: Array<{ code: string; owner?: string; key?: string }>,
) {
  const rows: ReportBody["environment"] = [];
  for (const owner of ["app", "convex", "web"] as const) {
    for (const key of OWNER_KEYS[owner]) {
      const value = input.env[owner][key];
      if (value === undefined) continue;
      rows.push({
        owner,
        key,
        present: value.trim().length > 0,
        ...(value ? { sha256: sha256(value) } : {}),
      });
    }
  }
  for (const issue of issues) {
    if (
      issue.code === "env_missing" &&
      issue.key &&
      (issue.owner === "app" ||
        issue.owner === "convex" ||
        issue.owner === "web") &&
      !rows.some((row) => row.owner === issue.owner && row.key === issue.key)
    )
      rows.push({ owner: issue.owner, key: issue.key, present: false });
  }
  return rows.sort((a, b) =>
    `${a.owner}:${a.key}`.localeCompare(`${b.owner}:${b.key}`),
  );
}

function receiptIdentities(root: string) {
  const identities: Record<string, { present: boolean; sha256?: string }> = {};
  for (const [name, candidates] of Object.entries({
    capabilities: ["jeomwon-capabilities.json"],
    project: ["jeomwon-project.json", "jeomwon-template.json"],
  })) {
    const path = candidates
      .map((candidate) => join(root, candidate))
      .find((candidate) => Bun.file(candidate).size > 0);
    identities[name] = path
      ? { present: true, sha256: sha256(readFileSync(path)) }
      : { present: false };
  }
  return identities;
}

function humanReport(report: ReportBody & { reportHash: string }) {
  const lines = [
    `DEPLOYMENT READINESS ${report.status === "ready" ? "PASS" : "BLOCKED"}`,
    `reportSha256=${report.reportHash}`,
    "roots: authenticated-app=apps/app static-web=apps/web",
    `emailMode=${report.features.email ? "feature-enabled" : "feature-disabled"}`,
    "polarBoundary=account-subscription-and-reservation-deposit reservationCommerce=deposit-only",
    "externalEffects=none-read-only",
  ];
  for (const check of report.checks) {
    const ownership = check.owner
      ? ` owner=${check.owner}${check.key ? `:${check.key}` : ""}`
      : "";
    lines.push(`ERROR [${check.code}]${ownership}`);
  }
  return lines.join("\n");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function usage() {
  return "Usage: bun run deployment:check -- --input <handoff.json> --output-dir <trusted-directory> --output <relative-report.json>";
}

async function main(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return 0;
  }
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const inputPath = value("--input");
  const outputDir = value("--output-dir");
  const outputPath = value("--output");
  if (!inputPath || !outputDir || !outputPath || args.length !== 6)
    throw new Error("arguments_invalid");
  const input = parseInput(
    JSON.parse(readFileSync(resolve(inputPath), "utf8")),
  );
  const result = checkDeploymentReadiness(input);
  writeDeploymentReport(outputDir, outputPath, result.report);
  console.log(result.human);
  return result.ok ? 0 : 1;
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    const code =
      error instanceof SyntaxError
        ? "input_json_invalid"
        : error instanceof Error
          ? error.message
          : "unexpected_error";
    console.error(
      `DEPLOYMENT READINESS ERROR [${/^[a-z0-9_]+$/.test(code) ? code : "unexpected_error"}]`,
    );
    process.exitCode = 1;
  }
}
