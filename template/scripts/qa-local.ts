#!/usr/bin/env bun
// One-command local QA gate.
// Prepares the dev Convex deployment, boots the authenticated app in mock runtime,
// runs the full scenario-gate suite, then tears everything back down.
// Safe by design: refuses to run against anything but a `dev:` deployment,
// forces email capture via JEOMWON_QA_RESET (never sends real mail), and
// always restores the temporary QA env + stops the app on exit.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { validateQaRuntimeArtifacts } from "./qa-artifact-contract";
import { configureTemporaryConvexEnvironment } from "./qa-convex-env-lifecycle";
import {
  bold,
  fail,
  gray,
  green,
  ok,
  red,
  reportCleanupFailures,
  step,
} from "./qa-local-console";
import type { OwnedQaProcess } from "./qa-port-lifecycle";
import {
  ownQaProcess,
  QaPortLifecycleError,
  runAfterQaPortPreflight,
  terminateOwnedQaProcess,
  waitForOwnedQaAppReady,
} from "./qa-port-lifecycle";
import type { QaConvexTarget } from "./qa-runtime-contract";
import {
  convexDevArgs,
  convexEnvArgs,
  QaRuntimeContractError,
  resolveQaConvexTarget,
  restoreConvexEnvironment,
  sanitizeConvexChildEnv,
  validateQaAppConvexUrl,
} from "./qa-runtime-contract";

const root = process.cwd();
const backendDir = join(root, "packages/backend");
const appDir = join(root, "apps/app");
const appEnvFile = join(appDir, ".env.local");
const convexEnvFile = join(backendDir, ".env.local");
const port = Number(process.env.JEOMWON_QA_PORT ?? "3999");
const baseUrl = `http://localhost:${port}`;
const holdMs = process.env.JEOMWON_TEST_HOLD_MS ?? "1500";
const qaArtifactDir = join(
  root,
  "qa-artifacts",
  `jeomwon-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`,
);
const DEFAULT_QA_ADMIN_EMAIL = "jeomwon-qa-nonoperator@reserved.invalid";
type TempConvexEnv = {
  readonly AUTH_ANONYMOUS_LOGIN: string;
  readonly JEOMWON_ADMIN_EMAILS: string;
  readonly JEOMWON_QA_RESET: string;
  readonly JEOMWON_TEST_HOLD_MS: string;
};
const TEMP_CONVEX_ENV_NAMES = [
  "AUTH_ANONYMOUS_LOGIN",
  "JEOMWON_ADMIN_EMAILS",
  "JEOMWON_QA_RESET",
  "JEOMWON_TEST_HOLD_MS",
] as const;
function temporaryConvexEnv(): TempConvexEnv {
  return {
    AUTH_ANONYMOUS_LOGIN: "1",
    JEOMWON_ADMIN_EMAILS: DEFAULT_QA_ADMIN_EMAIL,
    JEOMWON_QA_RESET: "1",
    JEOMWON_TEST_HOLD_MS: holdMs,
  };
}

function convexEnv(target: QaConvexTarget, args: readonly string[]) {
  return spawnSync("npx", convexEnvArgs(target, args), {
    cwd: backendDir,
    env: sanitizeConvexChildEnv(process.env),
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

let previousConvexEnv = new Map<string, string | null>();
let configuredConvexEnv: readonly string[] = [];
let appProcess: OwnedQaProcess | undefined;
let tornDown = false;
let teardownFailures: readonly string[] = [];
let qaTarget: QaConvexTarget | undefined;
function teardown(): readonly string[] {
  if (tornDown) return teardownFailures;
  tornDown = true;
  const cleanupFailures: string[] = [];
  if (appProcess && !terminateOwnedQaProcess(appProcess)) {
    cleanupFailures.push("app:terminate");
  }
  if (qaTarget !== undefined) {
    const target = qaTarget;
    cleanupFailures.push(
      ...restoreConvexEnvironment(
        configuredConvexEnv,
        previousConvexEnv,
        (args) => convexEnv(target, args),
      ),
    );
  }
  teardownFailures = cleanupFailures;
  return teardownFailures;
}
process.on("exit", () => {
  if (!tornDown) {
    const failures = teardown();
    reportCleanupFailures(failures);
    if (failures.length > 0) process.exitCode = 1;
  }
});
process.on("SIGINT", () => {
  const failures = teardown();
  reportCleanupFailures(failures);
  process.exit(failures.length > 0 ? 1 : 130);
});
process.on("SIGTERM", () => {
  const failures = teardown();
  reportCleanupFailures(failures);
  process.exit(failures.length > 0 ? 1 : 143);
});

async function main(): Promise<number> {
  return await runAfterQaPortPreflight(port, runQaWorkflow);
}

async function runQaWorkflow(): Promise<number> {
  const target = resolveQaConvexTarget(convexEnvFile);
  validateQaAppConvexUrl(target, appEnvFile);
  const tempConvexEnv = temporaryConvexEnv();
  qaTarget = target;
  console.log(`${bold("jeomwon")} QA ${gray("· verified dev · mock+capture")}`);

  step(1, "Convex 임시 auth/QA env 설정 + 함수 배포");
  const configured = configureTemporaryConvexEnvironment(
    TEMP_CONVEX_ENV_NAMES,
    tempConvexEnv,
    (args) => convexEnv(target, args),
  );
  configuredConvexEnv = configured.configuredNames;
  previousConvexEnv = new Map(configured.previousValues);
  const convexDev = spawnSync("npx", convexDevArgs(target), {
    cwd: backendDir,
    env: sanitizeConvexChildEnv(process.env),
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (convexDev.status !== 0) {
    fail("convex dev --once 실패");
  }
  ok(
    `dev 배포 준비 완료 ${gray("(익명 로그인+리셋+빠른 홀드, 종료 시 복원)")}`,
  );

  step(2, `인증 앱 기동 ${gray(`(mock 런타임 · ${baseUrl})`)}`);
  const readyNonce = randomUUID();
  const appChild = spawn("bun", ["next", "dev", "-p", String(port)], {
    cwd: appDir,
    detached: true,
    env: {
      ...sanitizeConvexChildEnv(process.env),
      AGENT_RUNTIME: "mock",
      AUTH_ANONYMOUS_LOGIN: "1",
      JEOMWON_QA_BROWSER: "1",
      JEOMWON_QA_READY_NONCE: readyNonce,
      NEXT_PUBLIC_CONVEX_URL: target.convexUrl,
    },
    stdio: "ignore",
  });
  appProcess = ownQaProcess(appChild);
  appChild.on("exit", (code) => {
    if (!tornDown && code && code !== 0) {
      fail(`앱 서버가 종료됨 (code ${code}).`);
    }
  });
  await waitForOwnedQaAppReady(baseUrl, readyNonce, appProcess, 90_000);
  ok(`웹 서버 준비 완료 ${gray(baseUrl)}`);

  step(3, "스모크 QA 게이트 실행");
  const qa = spawnSync("bun", ["run", "qa:run"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...sanitizeConvexChildEnv(process.env),
      JEOMWON_QA_BASE_URL: baseUrl,
      JEOMWON_QA_ARTIFACT_DIR: qaArtifactDir,
      JEOMWON_TEST_HOLD_MS: holdMs,
      CONVEX_URL: target.convexUrl,
      NEXT_PUBLIC_CONVEX_URL: target.convexUrl,
    },
  });

  step(4, "정리 — 앱 종료 · 임시 Convex env 복원");
  const cleanupFailures = teardown();
  if (cleanupFailures.length === 0) {
    ok("정리 완료");
  } else {
    reportCleanupFailures(cleanupFailures);
  }

  const qaCode = qa.status ?? 1;
  const artifacts =
    qaCode === 0
      ? validateQaRuntimeArtifacts(qaArtifactDir)
      : { ok: false as const, issues: ["qa-child:nonzero"] };
  if (!artifacts.ok) {
    console.error(
      `  ${red("✗")} QA 증거 검증 실패 (${artifacts.issues.join(", ")})`,
    );
  }
  const code =
    qaCode === 0 && cleanupFailures.length === 0 && artifacts.ok ? 0 : 1;
  if (code === 0) {
    console.log(
      `\n  ${green("✓")} ${bold("QA 통과")} ${gray("— 모든 게이트")}`,
    );
  } else {
    console.log(
      `\n  ${red("✗")} ${bold("QA 실패")} ${gray(`(exit ${code})`)} — 위 로그 확인`,
    );
  }
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(
      error instanceof QaRuntimeContractError
        ? error.message
        : error instanceof QaPortLifecycleError
          ? error.message
          : "QA runner failed before completion.",
    );
    process.exit(1);
  });
