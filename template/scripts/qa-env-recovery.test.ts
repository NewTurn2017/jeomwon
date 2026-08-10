import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureTemporaryConvexEnvironment } from "./qa-convex-env-lifecycle";
import {
  recoverQaEnvironment,
  writeQaEnvRecoveryJournal,
} from "./qa-env-recovery";
import {
  TEMP_CONVEX_ENV_NAMES,
  temporaryConvexEnv,
} from "./qa-local-environment";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { force: true, recursive: true });
});

function recoveryPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "jeomwon-qa-recovery-"));
  tempDirs.push(dir);
  return join(dir, "journal.json");
}

test("an interrupted QA journal restores exact prior values and removes itself", () => {
  const filePath = recoveryPath();
  writeQaEnvRecoveryJournal(
    filePath,
    ["JEOMWON_ADMIN_EMAILS", "JEOMWON_QA_RESET"],
    new Map([
      ["JEOMWON_ADMIN_EMAILS", "  owner@example.invalid  "],
      ["JEOMWON_QA_RESET", null],
    ]),
  );
  const calls: string[][] = [];

  const failures = recoverQaEnvironment(filePath, (args) => {
    calls.push([...args]);
    return { status: 0 };
  });

  expect(failures).toEqual([]);
  expect(calls).toEqual([
    ["set", "--", "JEOMWON_ADMIN_EMAILS", "  owner@example.invalid  "],
    ["remove", "JEOMWON_QA_RESET"],
  ]);
  expect(existsSync(filePath)).toBe(false);
});

test("every temporary write boundary has durable idempotent recovery", () => {
  const names = TEMP_CONVEX_ENV_NAMES;
  for (
    let interruptedBoundary = 0;
    interruptedBoundary <= names.length;
    interruptedBoundary += 1
  ) {
    const filePath = recoveryPath();
    const previous = new Map<string, string | null>([
      [names[0], null],
      [names[1], "prior-admin"],
      [names[2], null],
      [names[3], "prior-hold"],
    ]);
    const current = new Map(previous);
    expect(() =>
      configureTemporaryConvexEnvironment(
        names,
        temporaryConvexEnv(),
        (args) => {
          const name = args[args[0] === "get" ? 1 : 2] ?? "";
          if (args[0] === "get") {
            const value = current.get(name);
            return { status: 0, stdout: value === null ? "" : `${value}\n` };
          }
          if (args[0] === "remove") current.set(args[1] ?? "", null);
          if (args[0] === "set") current.set(name, args[3] ?? "");
          return { status: 0 };
        },
        {
          onPrepared: (configuredNames, previousValues) =>
            writeQaEnvRecoveryJournal(
              filePath,
              configuredNames,
              previousValues,
            ),
          onWriteBoundary: (boundary) => {
            if (boundary === interruptedBoundary) throw new Error("interrupt");
          },
        },
      ),
    ).toThrow("interrupt");
    expect(existsSync(filePath)).toBe(true);
    expect(
      recoverQaEnvironment(filePath, (args) => {
        const name = args[args[0] === "remove" ? 1 : 2] ?? "";
        current.set(name, args[0] === "remove" ? null : (args[3] ?? ""));
        return { status: 0 };
      }),
    ).toEqual([]);
    expect(current).toEqual(previous);
    expect(recoverQaEnvironment(filePath, () => ({ status: 1 }))).toEqual([]);
  }
});

test("a failed interrupted restoration retains the recovery journal", () => {
  const filePath = recoveryPath();
  writeQaEnvRecoveryJournal(
    filePath,
    ["JEOMWON_QA_RESET"],
    new Map([["JEOMWON_QA_RESET", null]]),
  );

  expect(recoverQaEnvironment(filePath, () => ({ status: 1 }))).toEqual([
    "convex-env:JEOMWON_QA_RESET",
  ]);
  expect(existsSync(filePath)).toBe(true);
});
