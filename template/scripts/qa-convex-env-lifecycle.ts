import {
  type QaCommandResult,
  QaRuntimeContractError,
  restoreConvexEnvironment,
} from "./qa-runtime-contract";

export type QaConfiguredEnvironment = {
  readonly configuredNames: readonly string[];
  readonly previousValues: ReadonlyMap<string, string | null>;
};

export function configureTemporaryConvexEnvironment(
  names: readonly string[],
  values: Readonly<Record<string, string>>,
  run: (args: readonly string[]) => QaCommandResult,
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
    previousValues.set(name, current.stdout?.trim() || null);
  }

  for (const name of names) {
    configuredNames.push(name);
    if (run(["set", "--", name, values[name] ?? ""]).status !== 0) {
      rollbackOrThrow(configuredNames, previousValues, run);
      throw new QaRuntimeContractError(
        `Safety stop: temporary environment write failed for ${name}.`,
      );
    }
  }

  return { configuredNames, previousValues };
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
