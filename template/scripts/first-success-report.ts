import { readFileSync } from "node:fs";
import path from "node:path";

export const firstSuccessPlatforms = [
  "macos-latest",
  "macos-previous",
  "ubuntu-lts",
  "windows-11-powershell-7",
] as const;

type FirstSuccessPlatform = (typeof firstSuccessPlatforms)[number];
type FirstSuccessOutcome =
  | "complete"
  | "failure"
  | "incomplete"
  | "prerequisite_error"
  | "external_environment_failure";

export type FirstSuccessRun = {
  participantId: string;
  platform: FirstSuccessPlatform;
  elapsedMinutes: number;
  outcome: FirstSuccessOutcome;
  setupAutomation: boolean;
  oauthPauseResume: boolean;
  securityBoundary: boolean;
  sessionSeparation: boolean;
  approveCancelRoundtrip: boolean;
  restartPersistence: boolean;
};

const expectedAllocation: Readonly<Record<FirstSuccessPlatform, number>> = {
  "macos-latest": 2,
  "macos-previous": 2,
  "ubuntu-lts": 3,
  "windows-11-powershell-7": 3,
};

const requiredChecks = [
  "setupAutomation",
  "oauthPauseResume",
  "securityBoundary",
  "sessionSeparation",
  "approveCancelRoundtrip",
  "restartPersistence",
] as const;

export function evaluateFirstSuccessRuns(runs: readonly FirstSuccessRun[]) {
  const errors: string[] = [];
  const ids = new Set<string>();

  if (runs.length !== 10) {
    errors.push(`exactly 10 runs are required (received ${runs.length})`);
  }
  for (const run of runs) {
    if (!run.participantId.trim() || ids.has(run.participantId)) {
      errors.push(
        `participantId must be unique: ${run.participantId || "(empty)"}`,
      );
    }
    ids.add(run.participantId);
    if (
      !Number.isFinite(run.elapsedMinutes) ||
      run.elapsedMinutes < 0 ||
      (run.outcome !== "complete" && run.elapsedMinutes <= 25)
    ) {
      errors.push(
        `${run.participantId}: failed or incomplete runs must be recorded above 25 minutes`,
      );
    }
  }

  const allocation = Object.fromEntries(
    firstSuccessPlatforms.map((platform) => [
      platform,
      runs.filter((run) => run.platform === platform).length,
    ]),
  ) as Record<FirstSuccessPlatform, number>;
  for (const platform of firstSuccessPlatforms) {
    if (allocation[platform] !== expectedAllocation[platform]) {
      errors.push(
        `${platform}: expected ${expectedAllocation[platform]} runs, received ${allocation[platform]}`,
      );
    }
  }

  const sortedMinutes = runs
    .map((run) => run.elapsedMinutes)
    .sort((left, right) => left - right);
  const medianMinutes =
    sortedMinutes.length === 10
      ? ((sortedMinutes[4] ?? 0) + (sortedMinutes[5] ?? 0)) / 2
      : null;
  const within25Minutes = runs.filter(
    (run) => run.outcome === "complete" && run.elapsedMinutes <= 25,
  ).length;
  const platformPass = Object.fromEntries(
    firstSuccessPlatforms.map((platform) => {
      const platformRuns = runs.filter((run) => run.platform === platform);
      const passed =
        platformRuns.length === expectedAllocation[platform] &&
        platformRuns.every(
          (run) =>
            run.outcome === "complete" &&
            requiredChecks.every((check) => run[check]),
        );
      return [platform, passed];
    }),
  ) as Record<FirstSuccessPlatform, boolean>;

  if (medianMinutes === null || medianMinutes > 15) {
    errors.push(
      `median must be <= 15 minutes (received ${medianMinutes ?? "n/a"})`,
    );
  }
  if (within25Minutes < 9) {
    errors.push(
      `at least 9 complete runs must finish within 25 minutes (received ${within25Minutes})`,
    );
  }
  for (const platform of firstSuccessPlatforms) {
    if (!platformPass[platform]) {
      errors.push(
        `${platform}: all functionality and security checks must pass`,
      );
    }
  }

  return {
    status: errors.length === 0 ? ("PASS" as const) : ("FAIL" as const),
    participants: runs.length,
    allocation,
    medianMinutes,
    within25Minutes,
    platformPass,
    errors,
  };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error(
      "Usage: bun run first-success:report <first-success-runs.json>",
    );
    process.exitCode = 1;
    return;
  }

  const filePath = path.resolve(process.cwd(), input);
  const document = JSON.parse(readFileSync(filePath, "utf8")) as {
    runs?: FirstSuccessRun[];
  };
  const report = evaluateFirstSuccessRuns(document.runs ?? []);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
