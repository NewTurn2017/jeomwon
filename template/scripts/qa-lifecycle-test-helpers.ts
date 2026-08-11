import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:net";
import { PassThrough } from "node:stream";
import { probeQaPortAvailable } from "./qa-port-lifecycle";

type Fixture = {
  pid: number;
  port: number;
  closed: Promise<void>;
};
const fixtures = new Set<Fixture>();

export async function cleanupFixtures(): Promise<void> {
  for (const fixture of fixtures) {
    if (pidAlive(fixture.pid)) process.kill(-fixture.pid, "SIGTERM");
    await fixture.closed;
    if (pidAlive(fixture.pid))
      throw new Error(`fixture PID ${fixture.pid} leaked`);
    if (!(await probeQaPortAvailable(fixture.port))) {
      throw new Error(`fixture port ${fixture.port} leaked`);
    }
    console.log(
      `QA_FIXTURE_CLEANUP PASS pid=${fixture.pid} port=${fixture.port}`,
    );
  }
  fixtures.clear();
}

export function fixtureSpawner(mode: string, port: number) {
  let childPid = 0;
  let resolveBound: () => void = () => undefined;
  const bound = new Promise<void>((resolve) => {
    resolveBound = resolve;
  });
  return {
    bound,
    pid: () => childPid,
    spawn: () => {
      const child = spawn(
        "bun",
        [
          new URL("./qa-app-lifecycle-fixture.ts", import.meta.url).pathname,
          mode,
          String(port),
          "nonce",
        ],
        { detached: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      if (!child.pid || !child.stdout) throw new Error("fixture spawn failed");
      childPid = child.pid;
      child.stdout.on("data", (chunk) => {
        if (`${chunk}`.includes("JEOMWON_QA_FIXTURE_BOUND")) resolveBound();
      });
      const closed = new Promise<void>((resolve) =>
        child.once("close", () => resolve()),
      );
      fixtures.add({ pid: childPid, port, closed });
      return child;
    },
  };
}

export function fakeChild(pid: number) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    stdout: PassThrough;
    stderr: PassThrough;
  };
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

export async function freePort(): Promise<number> {
  const server = await listen(0);
  const port = serverPort(server);
  await closeServer(server);
  return port;
}

export async function listen(port: number): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      { port, host: "::", ipv6Only: false, exclusive: true },
      resolve,
    );
  });
  return server;
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

export function serverPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("server address missing");
  }
  return address.port;
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ESRCH"
    );
  }
}
