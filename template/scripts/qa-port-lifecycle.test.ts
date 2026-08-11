import { describe, expect, test } from "bun:test";
import { fakeChild } from "./qa-lifecycle-test-helpers";
import {
  isOwnedQaReadyResponse,
  ownQaProcess,
  runAfterQaPortPreflight,
  stopOwnedQaProcess,
  waitForOwnedQaAppReady,
} from "./qa-port-lifecycle";

describe("QA port ownership primitives", () => {
  test("unavailable port refuses before start", async () => {
    const calls: string[] = [];
    await expect(
      runAfterQaPortPreflight(
        3999,
        async () => {
          calls.push("start");
        },
        async () => {
          calls.push("probe");
          return false;
        },
      ),
    ).rejects.toThrow("QA port 3999 is held by an unrelated process");
    expect(calls).toEqual(["probe"]);
  });

  test("available port starts only after exact probe", async () => {
    const calls: string[] = [];
    await runAfterQaPortPreflight(
      3999,
      async () => {
        calls.push("start");
      },
      async () => {
        calls.push("probe");
        return true;
      },
    );
    expect(calls).toEqual(["probe", "start"]);
  });

  test("child exit wins readiness race with safe exact context", async () => {
    const child = fakeChild(4313);
    const owned = ownQaProcess(child);
    const waiting = waitForOwnedQaAppReady(
      "http://localhost:3999",
      "nonce",
      owned,
      90_000,
      async () => new Response(),
    );
    child.exitCode = 23;
    child.emit("close", 23, null);
    await expect(waiting).rejects.toThrow(
      "QA app process exited before readiness (code=23, signal=none)",
    );
  });

  test("repeated teardown shares one termination and result", async () => {
    const child = fakeChild(4314);
    const owned = ownQaProcess(child);
    let signals = 0;
    const signal = () => {
      signals += 1;
      queueMicrotask(() => {
        child.exitCode = 0;
        child.emit("close", 0, null);
      });
    };
    const first = stopOwnedQaProcess(
      owned,
      3999,
      5_000,
      signal,
      async () => true,
    );
    const second = stopOwnedQaProcess(
      owned,
      3999,
      5_000,
      signal,
      async () => true,
    );
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(signals).toBe(1);
  });

  test("missing readiness event performs zero HTTP fetches", async () => {
    const owned = ownQaProcess(fakeChild(4315));
    const deadline = new AbortController();
    let fetches = 0;
    const waiting = waitForOwnedQaAppReady(
      "http://localhost:3999",
      "nonce",
      owned,
      90_000,
      async () => {
        fetches += 1;
        return new Response();
      },
      deadline.signal,
    );
    deadline.abort();
    await expect(waiting).rejects.toThrow("QA app was not ready within 90s");
    expect(fetches).toBe(0);
  });

  test("unrelated HTTP 200 cannot identify the QA app", async () => {
    const unrelated = new Response("unrelated", { status: 200 });
    const owned = new Response("jeomwon-qa-ready", {
      status: 200,
      headers: { "x-jeomwon-qa-ready": "expected-nonce" },
    });
    expect(await isOwnedQaReadyResponse(unrelated, "expected-nonce")).toBe(
      false,
    );
    expect(await isOwnedQaReadyResponse(owned, "expected-nonce")).toBe(true);
  });
});
