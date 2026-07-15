import { createServer } from "node:net";

const READY_HEADER = "x-jeomwon-qa-ready";
const READY_BODY = "jeomwon-qa-ready";

export type OwnedQaProcess = {
  readonly processGroupId: number;
  readonly isRunning: () => boolean;
};

type PortProbe = (port: number) => Promise<boolean>;
type GroupSignal = (pid: number, signal: NodeJS.Signals) => void;

export class QaPortLifecycleError extends Error {}

export async function runAfterQaPortPreflight<T>(
  port: number,
  start: () => Promise<T>,
  probe: PortProbe = probeQaPortAvailable,
): Promise<T> {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new QaPortLifecycleError(
      "QA port must be an integer from 1 to 65535",
    );
  }
  if (!(await probe(port))) {
    throw new QaPortLifecycleError(`QA port ${port} is occupied`);
  }
  return await start();
}

export function ownQaProcess(child: {
  readonly pid?: number;
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
}): OwnedQaProcess {
  if (child.pid === undefined) {
    throw new QaPortLifecycleError("QA app process did not start");
  }
  return {
    processGroupId: child.pid,
    isRunning: () => child.exitCode === null && child.signalCode === null,
  };
}

export function terminateOwnedQaProcess(
  owned: OwnedQaProcess,
  signalGroup: GroupSignal = process.kill,
): boolean {
  if (!owned.isRunning()) return true;
  try {
    signalGroup(-owned.processGroupId, "SIGTERM");
    return true;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (isNoSuchProcess(error)) return true;
    return false;
  }
}

export async function waitForOwnedQaAppReady(
  baseUrl: string,
  nonce: string,
  owned: OwnedQaProcess,
  timeoutMs: number,
  fetchReady: typeof fetch = fetch,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!owned.isRunning()) {
      throw new QaPortLifecycleError("QA app process exited before readiness");
    }
    try {
      const response = await fetchReady(`${baseUrl}/api/qa-ready`, {
        headers: { [READY_HEADER]: nonce },
        signal: AbortSignal.timeout(3000),
      });
      if (await isOwnedQaReadyResponse(response, nonce)) return;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new QaPortLifecycleError(
    `QA app was not ready within ${timeoutMs / 1000}s`,
  );
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

async function probeQaPortAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, host: "::", ipv6Only: false, exclusive: true }, () =>
      server.close((error) => resolve(error === undefined)),
    );
  });
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ESRCH"
  );
}
