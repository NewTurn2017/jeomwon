import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { QaCommandResult } from "./qa-runtime-contract";
import { restoreConvexEnvironment } from "./qa-runtime-contract";

const RECOVERY_VERSION = 1 as const;

type RecoveryJournal = {
  readonly version: typeof RECOVERY_VERSION;
  readonly configuredNames: readonly string[];
  readonly previousValues: Readonly<Record<string, string | null>>;
};

export function writeQaEnvRecoveryJournal(
  filePath: string,
  configuredNames: readonly string[],
  previousValues: ReadonlyMap<string, string | null>,
): void {
  const previous: Record<string, string | null> = {};
  for (const name of configuredNames) {
    previous[name] = previousValues.get(name) ?? null;
  }
  const journal: RecoveryJournal = {
    version: RECOVERY_VERSION,
    configuredNames,
    previousValues: previous,
  };
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(journal)}\n`, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  syncPath(temporaryPath);
  renameSync(temporaryPath, filePath);
  syncPath(dirname(filePath));
}

function syncPath(filePath: string): void {
  const descriptor = openSync(filePath, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function recoverQaEnvironment(
  filePath: string,
  run: (args: readonly string[]) => QaCommandResult,
): readonly string[] {
  if (!existsSync(filePath)) return [];
  const journal = parseJournal(JSON.parse(readFileSync(filePath, "utf8")));
  const previous = new Map<string, string | null>();
  for (const name of journal.configuredNames) {
    previous.set(name, journal.previousValues[name] ?? null);
  }
  const failures = restoreConvexEnvironment(
    journal.configuredNames,
    previous,
    run,
  );
  if (failures.length === 0) rmSync(filePath);
  return failures;
}

export function removeQaEnvRecoveryJournal(filePath: string): boolean {
  try {
    rmSync(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

function parseJournal(value: unknown): RecoveryJournal {
  if (
    value === null ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== RECOVERY_VERSION ||
    !("configuredNames" in value) ||
    !Array.isArray(value.configuredNames) ||
    !value.configuredNames.every((name) => typeof name === "string") ||
    !("previousValues" in value) ||
    value.previousValues === null ||
    typeof value.previousValues !== "object"
  ) {
    throw new Error("qa_env_recovery_invalid");
  }
  const previousValues: Record<string, string | null> = {};
  for (const name of value.configuredNames) {
    const entry = Object.entries(value.previousValues).find(
      ([entryName]) => entryName === name,
    );
    if (entry === undefined) throw new Error("qa_env_recovery_invalid");
    const previous = entry[1];
    if (previous !== null && typeof previous !== "string") {
      throw new Error("qa_env_recovery_invalid");
    }
    previousValues[name] = previous;
  }
  return {
    version: RECOVERY_VERSION,
    configuredNames: value.configuredNames,
    previousValues,
  };
}
