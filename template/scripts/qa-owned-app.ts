import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  assertQaPortAvailable,
  type OwnedQaProcess,
  ownQaProcess,
  type PortProbe,
  probeQaPortAvailable,
  type QaChild,
  QaPortLifecycleError,
  type ReadyFetch,
  stopOwnedQaProcess,
  waitForOwnedQaAppReady,
} from "./qa-port-lifecycle";

type LaunchInput = {
  readonly root: string;
  readonly appDir: string;
  readonly port: number;
  readonly baseUrl: string;
  readonly readyNonce: string;
  readonly convexUrl: string;
  readonly env: NodeJS.ProcessEnv;
  readonly onOwnedProcess?: (owned: OwnedQaProcess) => void;
};

type LaunchDependencies = {
  readonly spawnProcess?: () => QaChild;
  readonly probePort?: PortProbe;
  readonly fetchReady?: ReadyFetch;
  readonly readinessTimeoutMs?: number;
  readonly readinessDeadline?: AbortSignal;
  readonly cleanupTimeoutMs?: number;
  readonly stopProcess?: typeof stopOwnedQaProcess;
};

export async function launchOwnedQaApp(
  input: LaunchInput,
  dependencies: LaunchDependencies = {},
): Promise<OwnedQaProcess> {
  const probe = dependencies.probePort ?? probeQaPortAvailable;
  await assertQaPortAvailable(input.port, probe);
  const child = dependencies.spawnProcess?.() ?? spawnQaApp(input);
  const owned = ownQaProcess(child);
  input.onOwnedProcess?.(owned);
  const readinessTimeoutMs = dependencies.readinessTimeoutMs ?? 90_000;
  try {
    await waitForOwnedQaAppReady(
      input.baseUrl,
      input.readyNonce,
      owned,
      readinessTimeoutMs,
      dependencies.fetchReady,
      dependencies.readinessDeadline ?? AbortSignal.timeout(readinessTimeoutMs),
    );
    return owned;
  } catch (error) {
    const primary = lifecycleError(error, "QA app readiness failed");
    try {
      await (dependencies.stopProcess ?? stopOwnedQaProcess)(
        owned,
        input.port,
        dependencies.cleanupTimeoutMs ?? 15_000,
        process.kill,
        probe,
      );
    } catch (cleanupError) {
      const cleanup = lifecycleError(cleanupError, "QA app cleanup failed");
      throw new QaPortLifecycleError(
        `${primary.message}; cleanup failed: ${cleanup.message}`,
      );
    }
    throw primary;
  }
}

function spawnQaApp(input: LaunchInput): QaChild {
  return spawn(
    "bun",
    [join(input.root, "scripts/qa-app-process.ts"), String(input.port)],
    {
      cwd: input.appDir,
      detached: true,
      env: {
        ...input.env,
        AGENT_RUNTIME: "mock",
        AUTH_ANONYMOUS_LOGIN: "1",
        JEOMWON_QA_BROWSER: "1",
        JEOMWON_QA_READY_NONCE: input.readyNonce,
        NEXT_PUBLIC_CONVEX_URL: input.convexUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function lifecycleError(
  error: unknown,
  fallback: string,
): QaPortLifecycleError {
  return error instanceof QaPortLifecycleError
    ? error
    : new QaPortLifecycleError(fallback);
}
