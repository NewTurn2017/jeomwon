import fs from "node:fs";
import {
  assertExactGateResults,
  finalizeGateArtifacts,
} from "./qa-artifact-writer";
import { launchQaBrowser, writeBrowserActions } from "./qa-browser";
import { QA_CONTRACT_VERSION, QA_GATE_CONTRACT } from "./qa-contract";
import { resetQaDeployment } from "./qa-convex-runner";
import { qaCustomerAccountsGate } from "./qa-gate-accounts";
import { qaNoShowGate } from "./qa-gate-no-show";
import { qaOperatorCalendarCrudGate } from "./qa-gate-operator";
import { qaWaitlistGate } from "./qa-gate-waitlist";
import {
  qaCancelWindow,
  qaConfirmationGuardrail,
  qaHappyPath,
  qaMalformedInput,
  qaPrivacy,
  qaRelevanceGuardrail,
} from "./qa-gates-basic";
import { qaEmailCaptureGate, qaHoldExpiry } from "./qa-gates-email";
import {
  type QaFunctionalFailure,
  qaFailureCause,
  qaRunnerOutcome,
} from "./qa-run-outcome";
import {
  artifactDir,
  baseUrl,
  type QaResult,
  qaState,
  writeJson,
} from "./qa-shared";
import { readAuthenticatedThreadId } from "./qa-transport";

fs.mkdirSync(artifactDir, { recursive: true });
void main();

async function main(): Promise<void> {
  let functionalFailure: QaFunctionalFailure | null = null;
  const cleanupFailures: string[] = [];
  let runnerStage = "initial-reset";
  let cleanup = { browser: "not-started", contexts: "not-started" };
  let browserActions: Awaited<ReturnType<typeof launchQaBrowser>>["actions"] =
    [];
  let browser: Awaited<ReturnType<typeof launchQaBrowser>>["browser"] | null =
    null;
  try {
    await resetQaDeployment();
    runnerStage = "browser-launch";
    const harness = await launchQaBrowser(baseUrl, artifactDir);
    browser = harness.browser;
    qaState.pageA = harness.pageA;
    qaState.pageB = harness.pageB;
    qaState.unauthenticatedAdminRoute = harness.unauthenticatedAdminRoute;
    browserActions = harness.actions;
    if (harness.contextA === harness.contextB) {
      throw new Error("QA identities must use isolated contexts");
    }
    runnerStage = "identity-a";
    qaState.threadA = await readAuthenticatedThreadId(harness.pageA);
    runnerStage = "identity-b";
    qaState.threadB = await readAuthenticatedThreadId(harness.pageB);
    if (qaState.threadA === qaState.threadB) {
      throw new Error("QA identities resolved to the same thread");
    }
    const gates = [
      qaHappyPath,
      qaCancelWindow,
      qaConfirmationGuardrail,
      qaRelevanceGuardrail,
      qaMalformedInput,
      qaPrivacy,
      qaHoldExpiry,
      qaEmailCaptureGate,
      qaWaitlistGate,
      qaOperatorCalendarCrudGate,
      qaCustomerAccountsGate,
      qaNoShowGate,
    ];
    for (const [index, gate] of gates.entries()) {
      runnerStage = `gate-${index + 1}`;
      qaState.results.push(await runIsolatedGate(gate));
    }
    runnerStage = "gate-contract";
    assertExactGateResults(qaState.results);
    finalizeGateArtifacts(qaState.results);
    runnerStage = "final-reset";
    await resetQaDeployment();
    runnerStage = "final-reset-verification";
    await resetQaDeployment();
  } catch (error) {
    const cause =
      error instanceof Error ? qaFailureCause(error) : "unexpected_error";
    functionalFailure = {
      wrapperCode: "qa_runner_failed",
      stage: runnerStage,
      cause,
    };
    console.error(
      "FAIL QA-STAGE",
      functionalFailure.stage,
      functionalFailure.cause,
    );
  } finally {
    try {
      await resetQaDeployment();
    } catch {
      cleanupFailures.push("fixtures:reset");
    }
    if (browser !== null) {
      try {
        await browser.close();
        cleanup = { browser: "closed", contexts: "closed" };
      } catch {
        cleanup = { browser: "close-failed", contexts: "close-failed" };
        cleanupFailures.push("browser:close");
      }
    }
    writeBrowserActions(artifactDir, browserActions);
    writeJson("cleanup.json", cleanup);
  }
  const runner = qaRunnerOutcome(functionalFailure, cleanupFailures);
  writeJson("manifest.json", {
    qaContractVersion: QA_CONTRACT_VERSION,
    baseUrl,
    artifactDir,
    qaReset: qaState.qaResetSummary,
    runner,
    gateContract: QA_GATE_CONTRACT,
    browserArtifacts: {
      actions: "browser-actions.json",
      cleanup: "cleanup.json",
    },
    results: qaState.results,
  });
  for (const result of qaState.results) {
    console.log(`${result.status} QA-${result.id} ${result.name}`);
    for (const line of result.output) console.log(`  ${line}`);
  }
  console.log(`ARTIFACT_DIR ${artifactDir}`);
  if (runner.status === "FAIL") {
    console.error(
      "FAIL QA-RUNNER",
      runner.code,
      runner.functionalFailure?.wrapperCode ?? "no_functional_failure",
      runner.functionalFailure?.cause ?? "no_functional_cause",
      ...runner.cleanupFailures,
    );
  }
  if (
    runner.status === "FAIL" ||
    qaState.results.some((result) => result.status === "FAIL")
  ) {
    process.exitCode = 1;
  }
}

async function runIsolatedGate(
  run: () => Promise<QaResult>,
): Promise<QaResult> {
  await resetQaDeployment();
  return await run();
}
