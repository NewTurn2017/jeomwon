import { describe, expect, test } from "bun:test";
import {
  evaluateFirstSuccessRuns,
  type FirstSuccessRun,
} from "./first-success-report";

const allocations = [
  "macos-latest",
  "macos-latest",
  "macos-previous",
  "macos-previous",
  "ubuntu-lts",
  "ubuntu-lts",
  "ubuntu-lts",
  "windows-11-powershell-7",
  "windows-11-powershell-7",
  "windows-11-powershell-7",
] as const;

function passingRuns(): FirstSuccessRun[] {
  return allocations.map((platform, index) => ({
    participantId: `P${String(index + 1).padStart(2, "0")}`,
    platform,
    elapsedMinutes: 10 + index,
    outcome: "complete",
    setupAutomation: true,
    oauthPauseResume: true,
    securityBoundary: true,
    sessionSeparation: true,
    approveCancelRoundtrip: true,
    restartPersistence: true,
  }));
}

describe("first success report", () => {
  test("accepts the required 4/3/3 allocation and target metrics", () => {
    const report = evaluateFirstSuccessRuns(passingRuns());

    expect(report.status).toBe("PASS");
    expect(report.medianMinutes).toBe(14.5);
    expect(report.within25Minutes).toBe(10);
    expect(report.errors).toEqual([]);
  });

  test("counts incomplete runs above 25 minutes and fails platform proof", () => {
    const runs = passingRuns();
    runs[9] = {
      ...runs[9],
      elapsedMinutes: 26,
      outcome: "incomplete",
      restartPersistence: false,
    } as FirstSuccessRun;

    const report = evaluateFirstSuccessRuns(runs);

    expect(report.status).toBe("FAIL");
    expect(report.within25Minutes).toBe(9);
    expect(report.platformPass["windows-11-powershell-7"]).toBe(false);
  });
});
