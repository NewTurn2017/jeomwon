import { createServer } from "node:net";
import type { Readable } from "node:stream";

const READY_HEADER = "x-jeomwon-qa-ready";
const READY_BODY = "jeomwon-qa-ready";
const PROCESS_READY_EVENT = "JEOMWON_QA_APP_READY\n";

export type QaProcessExit = {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
};

export type OwnedQaProcess = {
  readonly processGroupId: number;
  readonly isRunning: () => boolean;
  readonly readiness: Promise<void>;
  readonly exited: Promise<QaProcessExit>;
};

export type PortProbe = (port: number) => Promise<boolean>;
export type ReadyFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;
export type GroupSignal = (pid: number, signal: NodeJS.Signals) => void;
export type QaChild = {
  readonly pid?: number;
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  once(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
};

export class QaPortLifecycleError extends Error {}

const stopPromises = new WeakMap<OwnedQaProcess, Promise<void>>();

export async function runAfterQaPortPreflight<T>(
  port: number,
  start: () => Promise<T>,
  probe: PortProbe = probeQaPortAvailable,
): Promise<T> {
  await assertQaPortAvailable(port, probe);
  return await start();
}

export async function assertQaPortAvailable(
  port: number,
  probe: PortProbe = probeQaPortAvailable,
): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new QaPortLifecycleError(
      "QA port must be an integer from 1 to 65535",
    );
  }
  if (!(await probe(port))) {
    throw new QaPortLifecycleError(
      `QA port ${port} is held by an unrelated process`,
    );
  }
}

export function ownQaProcess(child: QaChild): OwnedQaProcess {
  if (
    child.pid === undefined ||
    child.stdout === null ||
    child.stderr === null
  ) {
    throw new QaPortLifecycleError("QA app process did not start");
  }
  let output = "";
  let resolveReady: () => void = () => undefined;
  const readiness = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output = `${output}${chunk}`.slice(-PROCESS_READY_EVENT.length * 2);
    if (output.includes(PROCESS_READY_EVENT)) resolveReady();
  });
  child.stderr.resume();
  const exited = new Promise<QaProcessExit>((resolve) =>
    child.once("close", (code, signal) => resolve({ code, signal })),
  );
  return {
    processGroupId: child.pid,
    isRunning: () => child.exitCode === null && child.signalCode === null,
    readiness,
    exited,
  };
}

export function stopOwnedQaProcess(
  owned: OwnedQaProcess,
  port: number,
  timeoutMs: number,
  signalGroup: GroupSignal = process.kill,
  probe: PortProbe = probeQaPortAvailable,
): Promise<void> {
  const existing = stopPromises.get(owned);
  if (existing) return existing;
  const stopping = stopOwnedQaProcessOnce(
    owned,
    port,
    timeoutMs,
    signalGroup,
    probe,
  );
  stopPromises.set(owned, stopping);
  return stopping;
}

async function stopOwnedQaProcessOnce(
  owned: OwnedQaProcess,
  port: number,
  timeoutMs: number,
  signalGroup: GroupSignal,
  probe: PortProbe,
): Promise<void> {
  if (owned.isRunning()) {
    try {
      signalGroup(-owned.processGroupId, "SIGTERM");
    } catch (error) {
      if (!isNoSuchProcess(error)) {
        throw new QaPortLifecycleError("QA app process termination failed");
      }
    }
  }
  await withTimeout(
    owned.exited,
    timeoutMs,
    `QA app process did not exit within ${timeoutMs / 1000}s`,
  );
  if (!(await probe(port))) {
    throw new QaPortLifecycleError(`QA port ${port} was not released`);
  }
}

export async function waitForOwnedQaAppReady(
  baseUrl: string,
  nonce: string,
  owned: OwnedQaProcess,
  timeoutMs: number,
  fetchReady: ReadyFetch = fetch,
  deadline: AbortSignal = AbortSignal.timeout(timeoutMs),
): Promise<void> {
  const timeout = abortFailure(
    deadline,
    `QA app was not ready within ${timeoutMs / 1000}s`,
  );
  const exited = owned.exited.then((details) => ({
    kind: "exit" as const,
    details,
  }));
  const exactReadiness = (async () => {
    await owned.readiness;
    if (!owned.isRunning()) throw exitBeforeReadiness(await owned.exited);
    let response: Response;
    try {
      response = await fetchReady(`${baseUrl}/api/qa-ready`, {
        headers: { [READY_HEADER]: nonce },
        signal: AbortSignal.any([
          deadline,
          AbortSignal.timeout(Math.min(timeoutMs, 3000)),
        ]),
      });
    } catch {
      throw new QaPortLifecycleError("QA app readiness endpoint failed");
    }
    if (!(await isOwnedQaReadyResponse(response, nonce))) {
      throw new QaPortLifecycleError("QA app readiness identity mismatch");
    }
  })();
  try {
    const outcome = await Promise.race([
      exactReadiness.then(() => ({ kind: "ready" as const })),
      exited,
      timeout.promise,
    ]);
    if (outcome.kind === "exit") throw exitBeforeReadiness(outcome.details);
  } finally {
    timeout.cancel();
  }
}

export async function isOwnedQaReadyResponse(
  response: Response,
  nonce: string,
): Promise<boolean> {
  return (
    response.status === 200 &&
    response.headers.get(READY_HEADER) === nonce &&
    (await response.text()) === READY_BODY
  );
}

export async function probeQaPortAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, host: "::", ipv6Only: false, exclusive: true }, () =>
      server.close((error) => resolve(error === undefined)),
    );
  });
}

async function withTimeout<T>(
  value: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const timeout = abortFailure(deadline, message);
  try {
    return await Promise.race([value, timeout.promise]);
  } finally {
    timeout.cancel();
  }
}

function abortFailure(signal: AbortSignal, message: string) {
  let rejectFailure: (error: QaPortLifecycleError) => void = () => undefined;
  const promise = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  const fail = () => rejectFailure(new QaPortLifecycleError(message));
  if (signal.aborted) fail();
  else signal.addEventListener("abort", fail, { once: true });
  return {
    promise,
    cancel: () => signal.removeEventListener("abort", fail),
  };
}

function exitBeforeReadiness(exit: QaProcessExit): QaPortLifecycleError {
  return new QaPortLifecycleError(
    `QA app process exited before readiness (code=${exit.code ?? "none"}, signal=${exit.signal ?? "none"})`,
  );
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ESRCH"
  );
}
