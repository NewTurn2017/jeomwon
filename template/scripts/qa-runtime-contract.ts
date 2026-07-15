import { existsSync, readFileSync } from "node:fs";
import { parse as parseDotenv } from "dotenv";

const CONVEX_CREDENTIAL_OVERRIDE_NAMES = [
  "CONVEX_ADMIN_KEY",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_OVERRIDE_ACCESS_TOKEN",
  "CONVEX_PROVISION_HOST",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_SELF_HOSTED_URL",
] as const;
export const CONVEX_TARGET_AUTH_OVERRIDE_NAMES = [
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
] as const;

export type QaConvexTarget = {
  readonly deploymentName: string;
  readonly convexUrl: string;
  readonly envFile: string;
};

export type QaCommandResult = {
  readonly status: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
};

export class QaRuntimeContractError extends Error {
  readonly name = "QaRuntimeContractError";
}

export function resolveQaConvexTarget(envFile: string): QaConvexTarget {
  if (!existsSync(envFile)) {
    throw new QaRuntimeContractError(
      "packages/backend/.env.local 없음 — 먼저 bun setup 을 실행하세요.",
    );
  }

  const parsed = parseDotenv(readFileSync(envFile, "utf8"));
  const unsafeName = CONVEX_CREDENTIAL_OVERRIDE_NAMES.find((name) =>
    parsed[name]?.trim(),
  );
  if (unsafeName !== undefined) {
    throw new QaRuntimeContractError(
      `안전 차단: ${unsafeName} 는 QA 대상 env 파일에 둘 수 없습니다.`,
    );
  }

  const rawDeployment = parsed.CONVEX_DEPLOYMENT?.trim() ?? "";
  const match = /^dev:([A-Za-z0-9][A-Za-z0-9-]*)$/.exec(rawDeployment);
  const deploymentName = match?.[1];
  if (deploymentName === undefined) {
    throw new QaRuntimeContractError(
      "안전 차단: QA 대상은 이름이 명시된 dev 배포여야 합니다.",
    );
  }

  const convexUrl = canonicalConvexUrl(
    parsed.CONVEX_URL?.trim() ?? "",
    deploymentName,
  );

  return { deploymentName, convexUrl, envFile };
}

export function sanitizeConvexChildEnv(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const childEnv = { ...source };
  for (const name of CONVEX_TARGET_AUTH_OVERRIDE_NAMES) {
    delete childEnv[name];
  }
  return childEnv;
}

export function validateQaAppConvexUrl(
  target: QaConvexTarget,
  appEnvFile: string,
): void {
  if (!existsSync(appEnvFile)) {
    throw new QaRuntimeContractError(
      "apps/app/.env.local 없음 — 먼저 bun setup 을 실행하세요.",
    );
  }
  const parsed = parseDotenv(readFileSync(appEnvFile, "utf8"));
  if (parsed.NEXT_PUBLIC_CONVEX_URL?.trim() !== target.convexUrl) {
    throw new QaRuntimeContractError(
      "안전 차단: apps/app NEXT_PUBLIC_CONVEX_URL 이 검증된 backend dev 배포와 일치하지 않습니다.",
    );
  }
}

function canonicalConvexUrl(rawUrl: string, deploymentName: string): string {
  try {
    const parsed = new URL(rawUrl);
    const canonical = `https://${deploymentName}.convex.cloud`;
    if (parsed.origin !== canonical || parsed.href !== `${canonical}/`) {
      throw new Error("noncanonical");
    }
    return canonical;
  } catch {
    throw new QaRuntimeContractError(
      "안전 차단: backend CONVEX_URL 은 검증된 dev 배포의 canonical URL 이어야 합니다.",
    );
  }
}

export function convexEnvArgs(
  target: QaConvexTarget,
  args: readonly string[],
): string[] {
  return ["convex", "env", "--deployment", target.deploymentName, ...args];
}

export function convexDevArgs(target: QaConvexTarget): string[] {
  return ["convex", "dev", "--once", "--env-file", target.envFile];
}

export function convexRunArgs(
  target: QaConvexTarget,
  functionName: string,
  encodedArgs: string,
): string[] {
  return [
    "convex",
    "run",
    "--deployment",
    target.deploymentName,
    functionName,
    encodedArgs,
  ];
}

export function restoreConvexEnvironment(
  configuredNames: readonly string[],
  previousValues: ReadonlyMap<string, string | null>,
  run: (args: readonly string[]) => QaCommandResult,
): string[] {
  const failures: string[] = [];
  for (const name of configuredNames) {
    const previous = previousValues.get(name);
    const args =
      previous === null || previous === undefined
        ? ["remove", name]
        : ["set", "--", name, previous];
    if (run(args).status !== 0) {
      failures.push(`convex-env:${name}`);
    }
  }
  return failures;
}
