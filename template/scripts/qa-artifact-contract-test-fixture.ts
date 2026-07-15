import { afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateQaRuntimeArtifacts } from "./qa-artifact-contract";
import { QA_GATE_CONTRACT } from "./qa-contract";

type GateStatus = "PASS" | "SKIP";

const tempDirs: string[] = [];
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

export function tempArtifactDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jeomwon-qa-artifacts-"));
  tempDirs.push(dir);
  return dir;
}

export function writeArtifactFixture(
  artifactDir: string,
  statuses: Readonly<Partial<Record<number, GateStatus>>> = {},
): void {
  const results = QA_GATE_CONTRACT.map(({ id, name }) => ({
    id,
    name,
    status: statuses[id] ?? "PASS",
    output: [],
  }));
  writeFileSync(
    join(artifactDir, "manifest.json"),
    JSON.stringify({
      runner: { status: "PASS" },
      qaReset: {
        reset: {
          domainKey: "generic-appointment",
          reservations: 0,
          chatThreads: 0,
          chatEvents: 0,
        },
        seed: { resources: 3 },
      },
      gateContract: QA_GATE_CONTRACT,
      browserArtifacts: {
        actions: "browser-actions.json",
        cleanup: "cleanup.json",
      },
      results,
    }),
  );
  writeFileSync(
    join(artifactDir, "browser-actions.json"),
    JSON.stringify([
      { identity: "A", action: "login", artifact: null },
      { identity: "B", action: "login", artifact: null },
      {
        identity: "A",
        action: "screenshot",
        artifact: "browser-a-login.png",
      },
      {
        identity: "B",
        action: "screenshot",
        artifact: "browser-b-login.png",
      },
    ]),
  );
  writeFileSync(
    join(artifactDir, "cleanup.json"),
    JSON.stringify({ browser: "closed", contexts: "closed" }),
  );
  writeFileSync(join(artifactDir, "browser-a-login.png"), png);
  writeFileSync(join(artifactDir, "browser-b-login.png"), png);
  for (const result of results) {
    const gate = QA_GATE_CONTRACT[result.id - 1];
    if (gate === undefined) throw new Error("fixture gate missing");
    writeFileSync(
      join(artifactDir, gate.artifact),
      JSON.stringify({
        id: result.id,
        name: result.name,
        status: result.status,
        evidence:
          result.id === 10 && result.status === "PASS"
            ? {
                unauthenticatedAdminRoute: { kind: "redirect" },
                authenticatedCustomerAdminRoute: {
                  kind: "response",
                  status: 404,
                },
                operatorCrudBoundarySubcase: {
                  status: "SKIP",
                  reason: "features.operatorCalendarCrud=false",
                },
                operatorSuccessSmoke: "BLOCKED_MAINTAINER_GOOGLE_IDENTITY",
              }
            : result.status === "SKIP"
              ? { status: "SKIP", reason: `gate-${result.id}-not-applicable` }
              : { proof: `gate-${result.id}` },
      }),
    );
  }
}

export function artifactIssues(artifactDir: string): readonly string[] {
  const result = validateQaRuntimeArtifacts(artifactDir);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues;
}
