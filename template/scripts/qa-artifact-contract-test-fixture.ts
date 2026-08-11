import { afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateQaRuntimeArtifacts } from "./qa-artifact-contract";
import {
  QA_CONTRACT_VERSION,
  type QaContractVersion,
  qaGateContractForVersion,
} from "./qa-contract";

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
  version: QaContractVersion = QA_CONTRACT_VERSION,
): void {
  const contract = qaGateContractForVersion(version);
  const results = contract.map(({ id, name }) => ({
    id,
    name,
    status: statuses[id] ?? "PASS",
    output: [],
  }));
  writeFileSync(
    join(artifactDir, "manifest.json"),
    JSON.stringify({
      qaContractVersion: version,
      runner: { status: "PASS" },
      qaReset: {
        reset: {
          domainKey: "generic-appointment",
          reservations: 0,
          chatThreads: 0,
          chatEvents: 0,
          reservationEmailDeliveries: 0,
        },
        seed: { resources: 3 },
      },
      gateContract: contract,
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
    const gate = contract.find(({ id }) => id === result.id);
    if (gate === undefined) throw new Error("fixture gate missing");
    writeFileSync(
      join(artifactDir, gate.artifact),
      JSON.stringify({
        qaContractVersion: version,
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
            : result.id === 12
              ? noShowEvidence(result.status)
              : result.status === "SKIP"
                ? { status: "SKIP", reason: `gate-${result.id}-not-applicable` }
                : { proof: `gate-${result.id}` },
      }),
    );
  }
}

function noShowEvidence(status: GateStatus) {
  const unchanged = { before: 0, after: 0, unchanged: true } as const;
  const sideEffects = {
    reservationEmailDeliveries: unchanged,
    waitlistReservations: unchanged,
    chatEvents: unchanged,
  };
  const billingSnapshot = {
    source: "accountDeletionJobs.phase+subscriptionCompleted",
    rowCount: 0,
    subscriptionCompleted: 0,
    subscriptionPending: 0,
    phases: {
      requested: 0,
      subscription_done: 0,
      storage_done: 0,
      records_redacted: 0,
      auth_deleted: 0,
    },
  } as const;
  const accountBillingState = {
    source: billingSnapshot.source,
    before: billingSnapshot,
    after: billingSnapshot,
    unchanged: true,
  } as const;
  return status === "SKIP"
    ? {
        status,
        reason: "features.noShow=false",
        mutationAttempted: false,
        sideEffects,
        accountBillingState,
        operatorSuccessSmoke: "BLOCKED_MAINTAINER_GOOGLE_IDENTITY",
      }
    : {
        status,
        fixtureVersion: 1,
        transition: {
          reservationId: "QA-260811-NOSHOW",
          from: "confirmed",
          to: "no_show",
          auditType: "reservation.no_show",
          auditCount: 1,
          publicContextStatus: "no_show",
          publicContextCount: 1,
        },
        rejections: {
          repeat: "no_show_already_marked",
          future: "no_show_future",
          ineligible: "no_show_wrong_status",
        },
        negativeStatuses: { future: "confirmed", ineligible: "cancelled" },
        sideEffects,
        accountBillingState,
        operatorSuccessSmoke: "BLOCKED_MAINTAINER_GOOGLE_IDENTITY",
      };
}

export function artifactIssues(artifactDir: string): readonly string[] {
  const result = validateQaRuntimeArtifacts(artifactDir);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues;
}
