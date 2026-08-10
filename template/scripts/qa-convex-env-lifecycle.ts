import {
  type QaCommandResult,
  QaRuntimeContractError,
  restoreConvexEnvironment,
} from "./qa-runtime-contract";

export type QaConfiguredEnvironment = {
  readonly configuredNames: readonly string[];
  readonly previousValues: ReadonlyMap<string, string | null>;
};

type QaEnvironmentWriteHooks = {
  readonly onPrepared?: (
    names: readonly string[],
    previousValues: ReadonlyMap<string, string | null>,
  ) => void;
  readonly onWriteBoundary?: (completedWrites: number) => void;
};

export function configureTemporaryConvexEnvironment(
  names: readonly string[],
  values: Readonly<Record<string, string>>,
  run: (args: readonly string[]) => QaCommandResult,
  hooks: QaEnvironmentWriteHooks = {},
): QaConfiguredEnvironment {
  const previousValues = new Map<string, string | null>();
  const configuredNames: string[] = [];

  for (const name of names) {
    const current = run(["get", name]);
    if (current.status !== 0) {
      throw new QaRuntimeContractError(
        `Safety stop: environment read failed for ${name}.`,
      );
    }
    previousValues.set(name, exactConvexEnvValue(current.stdout));
  }

  hooks.onPrepared?.(names, previousValues);
  hooks.onWriteBoundary?.(0);
  for (const name of names) {
    configuredNames.push(name);
    if (run(["set", "--", name, values[name] ?? ""]).status !== 0) {
      rollbackOrThrow(configuredNames, previousValues, run);
      throw new QaRuntimeContractError(
        `Safety stop: temporary environment write failed for ${name}.`,
      );
    }
    hooks.onWriteBoundary?.(configuredNames.length);
  }

  return { configuredNames, previousValues };
}

function exactConvexEnvValue(stdout: string | undefined): string | null {
  if (stdout === undefined || stdout === "") return null;
  return stdout.replace(/\r?\n$/, "");
}

function rollbackOrThrow(
  names: readonly string[],
  previous: ReadonlyMap<string, string | null>,
  run: (args: readonly string[]) => QaCommandResult,
): void {
  const failures = restoreConvexEnvironment(names, previous, run);
  if (failures.length > 0) {
    throw new QaRuntimeContractError(
      `Safety stop: temporary environment rollback failed (${failures.join(", ")}).`,
    );
  }
}
