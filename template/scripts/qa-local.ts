#!/usr/bin/env bun
// One-command local QA gate.
// Prepares the dev Convex deployment, boots the authenticated app in mock runtime,
// runs the full scenario-gate suite, then tears everything back down.
// Safe by design: refuses to run against anything but a `dev:` deployment,
// forces email capture via JEOMWON_QA_RESET (never sends real mail), and
// always restores the temporary QA env + stops the app on exit.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { validateQaRuntimeArtifacts } from "./qa-artifact-contract";
import { qaOverallStatus } from "./qa-cleanup-contract";
import { configureTemporaryConvexEnvironment } from "./qa-convex-env-lifecycle";
import {
  recoverQaEnvironment,
  removeQaEnvRecoveryJournal,
  writeQaEnvRecoveryJournal,
} from "./qa-env-recovery";
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
import {
  holdMs,
  TEMP_CONVEX_ENV_NAMES,
  temporaryConvexEnv,
} from "./qa-local-environment";
import { launchOwnedQaApp } from "./qa-owned-app";
import type { OwnedQaProcess } from "./qa-port-lifecycle";
import {
  QaPortLifecycleError,
  runAfterQaPortPreflight,
  stopOwnedQaProcess,
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
const qaArtifactRoot = join(root, "qa-artifacts");
const qaEnvRecoveryFile = join(qaArtifactRoot, ".qa-env-recovery.json");
const qaArtifactDir = join(
  qaArtifactRoot,
  `jeomwon-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`,
);
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
let teardownPromise: Promise<readonly string[]> | undefined;
let qaTarget: QaConvexTarget | undefined;
function teardown(): Promise<readonly string[]> {
  teardownPromise ??= performTeardown();
  return teardownPromise;
}
async function performTeardown(): Promise<readonly string[]> {
  const cleanupFailures: string[] = [];
  if (appProcess) {
    try {
      await stopOwnedQaProcess(appProcess, port, 15_000);
    } catch {
      cleanupFailures.push("app:terminate-or-port-release");
    }
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
  if (
    cleanupFailures.length === 0 &&
    !removeQaEnvRecoveryJournal(qaEnvRecoveryFile)
  ) {
    cleanupFailures.push("recovery-journal:remove");
  }
  return cleanupFailures;
}
let signalStopStarted = false;
async function stopForSignal(exitCode: 130 | 143): Promise<void> {
  if (signalStopStarted) return;
  signalStopStarted = true;
  const failures = await teardown();
  reportCleanupFailures(failures);
  process.exit(failures.length > 0 ? 1 : exitCode);
}
process.on("SIGINT", () => void stopForSignal(130));
process.on("SIGTERM", () => void stopForSignal(143));

async function main(): Promise<number> {
  return await runAfterQaPortPreflight(port, runQaWorkflow);
}

async function runQaWorkflow(): Promise<number> {
  const target = resolveQaConvexTarget(convexEnvFile);
  validateQaAppConvexUrl(target, appEnvFile);
  const tempConvexEnv = temporaryConvexEnv();
  qaTarget = target;
  mkdirSync(qaArtifactRoot, { recursive: true });
  const recoveryFailures = recoverQaEnvironment(qaEnvRecoveryFile, (args) =>
    convexEnv(target, args),
  );
  if (recoveryFailures.length > 0) {
    throw new QaRuntimeContractError(
      "Safety stop: interrupted QA env recovery failed.",
    );
  }
  console.log(`${bold("jeomwon")} QA ${gray("· verified dev · mock+capture")}`);

  step(1, "Convex 임시 auth/QA env 설정 + 함수 배포");
  configureTemporaryConvexEnvironment(
    TEMP_CONVEX_ENV_NAMES,
    tempConvexEnv,
    (args) => convexEnv(target, args),
    {
      onPrepared: (names, previousValues) => {
        configuredConvexEnv = [...names];
        previousConvexEnv = new Map(previousValues);
        writeQaEnvRecoveryJournal(
          qaEnvRecoveryFile,
          configuredConvexEnv,
          previousConvexEnv,
        );
      },
    },
  );
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
  appProcess = await launchOwnedQaApp({
    root,
    appDir,
    port,
    baseUrl,
    readyNonce,
    convexUrl: target.convexUrl,
    env: sanitizeConvexChildEnv(process.env),
    onOwnedProcess: (owned) => {
      appProcess = owned;
    },
  });
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
  const cleanupFailures = await teardown();
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
  const overallStatus = qaOverallStatus({
    functionalSucceeded: qaCode === 0,
    artifactsValid: artifacts.ok,
    cleanupFailures,
  });
  const code = overallStatus === "PASS" ? 0 : 1;
  if (code === 0) {
    console.log(
      `\n  ${green("✓")} ${bold("QA 통과")} ${gray("— 모든 게이트")}`,
    );
  } else {
    console.log(
      `\n  ${red("✗")} ${bold("QA 실패")} ${gray(`(${overallStatus}, exit ${code})`)} — 위 로그 확인`,
    );
  }
  return code;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch(async (error) => {
    const cleanupFailures = await teardown();
    reportCleanupFailures(cleanupFailures);
    console.error(
      error instanceof QaRuntimeContractError
        ? error.message
        : error instanceof QaPortLifecycleError
          ? error.message
          : "QA runner failed before completion.",
    );
    process.exitCode = 1;
  });
