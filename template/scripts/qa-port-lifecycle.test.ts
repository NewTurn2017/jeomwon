import { describe, expect, test } from "bun:test";
import {
  isOwnedQaReadyResponse,
  runAfterQaPortPreflight,
  terminateOwnedQaProcess,
} from "./qa-port-lifecycle";

describe("QA port ownership lifecycle", () => {
  test("Given an occupied port, When preflight runs, Then no mutation or spawn callback executes", async () => {
    const calls: string[] = [];

    await expect(
      runAfterQaPortPreflight(
        3999,
        async () => {
          calls.push("mutation");
          calls.push("spawn");
          return 0;
        },
        async () => {
          calls.push("probe");
          return false;
        },
      ),
    ).rejects.toThrow("QA port 3999 is occupied");
    expect(calls).toEqual(["probe"]);
  });

  test("Given one owned process group, When teardown runs, Then only that group is signalled", () => {
    const signals: Array<{ pid: number; signal: NodeJS.Signals }> = [];

    expect(
      terminateOwnedQaProcess(
        { processGroupId: 4312, isRunning: () => true },
        (pid, signal) => {
          signals.push({ pid, signal });
        },
      ),
    ).toBe(true);
    expect(signals).toEqual([{ pid: -4312, signal: "SIGTERM" }]);
    expect(signals.some(({ pid }) => pid === 9876 || pid === -9876)).toBe(
      false,
    );
  });

  test("Given unrelated HTTP 200, When readiness is checked, Then it cannot identify the QA app", async () => {
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
