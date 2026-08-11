import { afterEach, describe, expect, test } from "bun:test";
import {
  cleanupFixtures,
  closeServer,
  fakeChild,
  fixtureSpawner,
  freePort,
  listen,
  pidAlive,
  serverPort,
} from "./qa-lifecycle-test-helpers";
import { launchOwnedQaApp } from "./qa-owned-app";
import {
  type OwnedQaProcess,
  probeQaPortAvailable,
  QaPortLifecycleError,
  stopOwnedQaProcess,
} from "./qa-port-lifecycle";

afterEach(cleanupFixtures);

describe("owned QA app launch", () => {
  test("held unrelated port fails before spawn and remains owned", async () => {
    const held = await listen(0);
    const port = serverPort(held);
    let spawned = false;
    try {
      const message = await errorMessage(
        launchOwnedQaApp(launchInput(port), {
          spawnProcess: () => {
            spawned = true;
            return fakeChild(9001);
          },
        }),
      );
      expect(message).toBe(`QA port ${port} is held by an unrelated process`);
      console.log(`QA_LIFECYCLE_ERROR ${message}`);
      expect(spawned).toBe(false);
      expect(held.listening).toBe(true);
      expect(await probeQaPortAvailable(port)).toBe(false);
      console.log(
        `QA_UNRELATED_PORT PRESERVED pid=${process.pid} port=${port}`,
      );
    } finally {
      await closeServer(held);
    }
    expect(await probeQaPortAvailable(port)).toBe(true);
  });

  test("early exit wins readiness with exact safe context", async () => {
    const port = await freePort();
    const fixture = fixtureSpawner("early-exit", port);
    const message = await errorMessage(
      launchOwnedQaApp(launchInput(port), {
        spawnProcess: fixture.spawn,
        readinessTimeoutMs: 90_000,
      }),
    );
    expect(message).toBe(
      "QA app process exited before readiness (code=23, signal=none)",
    );
    console.log(`QA_LIFECYCLE_ERROR ${message}`);
    expect(fixture.pid()).toBeGreaterThan(0);
  });

  test("alive readiness timeout terminates child and releases port", async () => {
    const port = await freePort();
    const fixture = fixtureSpawner("timeout", port);
    const deadline = new AbortController();
    const launched = launchOwnedQaApp(launchInput(port), {
      spawnProcess: fixture.spawn,
      readinessTimeoutMs: 90_000,
      readinessDeadline: deadline.signal,
    });
    await fixture.bound;
    expect(pidAlive(fixture.pid())).toBe(true);
    expect(await probeQaPortAvailable(port)).toBe(false);
    deadline.abort();
    const message = await errorMessage(launched);
    expect(message).toBe("QA app was not ready within 90s");
    console.log(`QA_LIFECYCLE_ERROR ${message}`);
  });

  test("readiness success returns the live owned PID", async () => {
    const port = await freePort();
    const fixture = fixtureSpawner("success", port);
    const owned = await launchOwnedQaApp(launchInput(port), {
      spawnProcess: fixture.spawn,
      readinessTimeoutMs: 5_000,
    });
    expect(owned.processGroupId).toBe(fixture.pid());
    expect(pidAlive(fixture.pid())).toBe(true);
    expect(await probeQaPortAvailable(port)).toBe(false);
    await stopOwnedQaProcess(owned, port, 5_000);
  });

  test("signal during readiness rejects by exit and shares cleanup", async () => {
    const port = await freePort();
    const fixture = fixtureSpawner("signal", port);
    let owned: OwnedQaProcess | undefined;
    const launched = launchOwnedQaApp(
      {
        ...launchInput(port),
        onOwnedProcess: (value) => {
          owned = value;
        },
      },
      { spawnProcess: fixture.spawn, readinessTimeoutMs: 90_000 },
    );
    await fixture.bound;
    if (!owned) throw new Error("owned process callback missing");
    const stopped = stopOwnedQaProcess(owned, port, 5_000);
    const message = await errorMessage(launched);
    expect(message).toBe(
      "QA app process exited before readiness (code=none, signal=SIGTERM)",
    );
    console.log(`QA_LIFECYCLE_ERROR ${message}`);
    await stopped;
  });

  test("timeout preserves primary and cleanup failure", async () => {
    const child = fakeChild(9002);
    const deadline = new AbortController();
    const launched = launchOwnedQaApp(launchInput(3999), {
      probePort: async () => true,
      spawnProcess: () => child,
      readinessTimeoutMs: 90_000,
      readinessDeadline: deadline.signal,
      stopProcess: async () => {
        throw new QaPortLifecycleError("QA port 3999 was not released");
      },
    });
    deadline.abort();
    const message = await errorMessage(launched);
    expect(message).toBe(
      "QA app was not ready within 90s; cleanup failed: QA port 3999 was not released",
    );
    console.log(`QA_LIFECYCLE_ERROR ${message}`);
    child.exitCode = 0;
    child.emit("close", 0, null);
  });
});

async function errorMessage(value: Promise<unknown>): Promise<string> {
  try {
    await value;
    throw new Error("expected lifecycle rejection");
  } catch (error) {
    return error instanceof Error ? error.message : "non-error rejection";
  }
}

function launchInput(port: number) {
  return {
    root: import.meta.dir.replace(/\/scripts$/, ""),
    appDir: import.meta.dir,
    port,
    baseUrl: `http://localhost:${port}`,
    readyNonce: "nonce",
    convexUrl: "https://example.convex.cloud",
    env: {},
  };
}
