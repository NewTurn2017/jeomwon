import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const root = join(import.meta.dir, "..");
const qaSource = readFileSync(join(root, "scripts/qa.ts"), "utf8");
const localSource = readFileSync(join(root, "scripts/qa-local.ts"), "utf8");
const runtimeContractSource = readFileSync(
  join(root, "scripts/qa-runtime-contract.ts"),
  "utf8",
);
const browserSource = readFileSync(join(root, "scripts/qa-browser.ts"), "utf8");
const gitignoreSource = readFileSync(join(root, ".gitignore"), "utf8");
const bridgePath = join(root, "apps/app/src/components/qa-browser-bridge.tsx");
const bridgeSource = existsSync(bridgePath)
  ? readFileSync(bridgePath, "utf8")
  : "";
const dashboardLayoutSource = readFileSync(
  join(root, "apps/app/src/app/[locale]/(dashboard)/layout.tsx"),
  "utf8",
);

function identifiers(source: string) {
  const file = ts.createSourceFile(
    "contract.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

describe("Todo 15 authenticated-app QA contract", () => {
  test("Given local QA tooling, When generated artifacts are written, Then git ignores every disposable output root", () => {
    expect(gitignoreSource.split("\n")).toEqual(
      expect.arrayContaining([
        "qa-artifacts/",
        "playwright-report/",
        "test-results/",
      ]),
    );
  });

  test("Given the QA runner, When its gate manifest is imported, Then IDs and artifacts are exact", async () => {
    const { QA_GATE_CONTRACT } = await import("./qa-contract");

    expect(QA_GATE_CONTRACT.map(({ id }) => id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(QA_GATE_CONTRACT.map(({ artifact }) => artifact)).toEqual([
      "01-happy-path.json",
      "02-cancel-window.json",
      "03-confirmation-guardrail.json",
      "04-relevance-guardrail.json",
      "05-malformed-input.json",
      "06-privacy-grep.json",
      "07-hold-expiry.json",
      "08-email-capture.json",
      "09-waitlist.json",
      "10-operator-calendar-crud.json",
      "11-customer-accounts.json",
    ]);
    const gateArtifactWrites = [
      ...qaSource.matchAll(/writeJson\("((?:0[1-9]|1[01])-[^"]+\.json)"/g),
    ]
      .map((match) => match[1])
      .filter((artifact): artifact is string => artifact !== undefined);
    expect([...new Set(gateArtifactWrites)]).toEqual(
      QA_GATE_CONTRACT.map(({ artifact }) => artifact),
    );
  });

  test("Given completed gate evidence, When the manifest is finalized, Then every gate artifact is wrapped with exact identity and status", () => {
    const names = identifiers(qaSource);

    expect(names.has("finalizeGateArtifacts")).toBe(true);
    expect(qaSource).toContain("evidence: readJsonArtifact(gate.artifact)");
  });

  test("Given qa-local, When the app lifecycle is inspected, Then it boots apps/app and owns every temporary env", () => {
    const names = identifiers(`${localSource}\n${runtimeContractSource}`);

    expect(names.has("appDir")).toBe(true);
    expect(names.has("webDir")).toBe(false);
    expect(localSource).toContain('join(root, "apps/app")');
    expect(localSource).toContain('AUTH_ANONYMOUS_LOGIN: "1"');
    expect(localSource).toContain('AGENT_RUNTIME: "mock"');
    expect(localSource).toContain('"JEOMWON_ADMIN_EMAILS"');
    expect(localSource).toContain('"AUTH_ANONYMOUS_LOGIN"');
    expect(localSource).toContain('"JEOMWON_QA_RESET"');
    expect(localSource).toContain('"JEOMWON_TEST_HOLD_MS"');
  });

  test("Given the runner, When browser symbols are inspected, Then two isolated contexts login through the app", () => {
    const names = identifiers(`${qaSource}\n${browserSource}`);

    expect(names.has("chromium")).toBe(true);
    expect(names.has("contextA")).toBe(true);
    expect(names.has("contextB")).toBe(true);
    expect(
      browserSource.match(/\.newContext\(/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(browserSource).toContain("pageA.goto(");
    expect(browserSource).toContain("pageB.goto(");
    expect(browserSource.match(/\/login`\)/g)?.length).toBe(2);
    expect(
      browserSource.match(/getByRole\("button"/g)?.length,
    ).toBeGreaterThanOrEqual(2);
  });

  test("Given authenticated chat requests, When transport is inspected, Then fetch runs inside the page origin", () => {
    expect(browserSource).toContain("page.evaluate");
    expect(browserSource).toContain("fetch(request.pathname");
    expect(qaSource).not.toContain("cookieHeader");
    expect(qaSource).not.toContain("context.cookies");
    expect(identifiers(qaSource).has("fetch")).toBe(false);
  });

  test("Given privacy gate 6, When targets are inspected, Then authenticated agent source and emitted artifacts are scanned", () => {
    expect(qaSource).toContain('"packages/agents/src/index.ts"');
    expect(qaSource).toContain("...responseFiles");
    expect(qaSource).toContain("publicSourcePaths");
  });

  test("Given canonical account probes, When A and B execute them, Then the browser-authenticated Convex client owns all calls", () => {
    const canonicalOperations = [
      "createHold",
      "confirmReservation",
      "cancelReservation",
      "rescheduleReservation",
    ];

    expect(bridgeSource).toContain("useConvex");
    expect(dashboardLayoutSource).toContain('env.JEOMWON_QA_BROWSER === "1"');
    expect(dashboardLayoutSource).toContain(
      'process.env.NODE_ENV !== "production"',
    );
    for (const operation of canonicalOperations) {
      expect(bridgeSource).toContain(
        `jeomwonConvex.customerReservations.${operation}`,
      );
      expect(
        qaSource.match(new RegExp(`operation: "${operation}"`, "g"))?.length,
      ).toBeGreaterThanOrEqual(2);
    }
    expect(qaSource).not.toContain("postChatToRequestedThread");
  });

  test("Given gates 10 and 11, When deterministic QA runs, Then neither whole gate may skip", () => {
    expect(qaSource).toContain("crossOwnerRejected");
    expect(qaSource).toContain("ownCrudSucceeded");
    expect(qaSource).not.toContain(
      'id: 10,\n      name: "운영자 캘린더 CRUD",\n      status: "SKIP"',
    );
    expect(qaSource).not.toContain(
      'id: 11,\n      name: "고객 계정 경계",\n      status: "SKIP"',
    );
  });

  test("Given success, failure, or cancellation, When either runner exits, Then teardown is registered", () => {
    expect(localSource).toContain('process.on("exit"');
    expect(localSource).toContain("const failures = teardown()");
    expect(localSource).toContain('process.on("SIGINT"');
    expect(localSource).toContain('process.on("SIGTERM"');
    expect(qaSource).toContain("await browser.close()");
    expect(browserSource).toContain("await browser.close()");
    expect(qaSource).toContain('writeJson("cleanup.json"');
    expect(qaSource.indexOf("launchQaBrowser(")).toBeLessThan(
      qaSource.indexOf("results.push("),
    );
    expect(
      browserSource.indexOf(
        "await browser.close()",
        browserSource.indexOf("catch"),
      ),
    ).toBeGreaterThan(browserSource.indexOf("catch"));
  });

  test("Given an expired hold, When gate 7 runs, Then confirmation is rejected and the expired snapshot is retained", () => {
    const names = identifiers(qaSource);

    expect(names.has("expiredConfirmation")).toBe(true);
    expect(names.has("expiredSnapshot")).toBe(true);
    expect(qaSource).toContain('"reservation_not_actionable"');
  });

  test("Given gate 10, When the deterministic identity runs, Then reserved non-operator denial is exact and operator success remains a separate smoke", () => {
    const names = identifiers(qaSource);

    expect(names.has("authenticatedCustomerCreateRejected")).toBe(true);
    expect(names.has("authenticatedCustomerUpdateRejected")).toBe(true);
    expect(names.has("authenticatedCustomerDeleteRejected")).toBe(true);
    expect(names.has("operatorCrudSucceeded")).toBe(false);
    expect(names.has("operatorPage")).toBe(false);
    expect(localSource).toContain("jeomwon-qa-nonoperator@reserved.invalid");
    expect(localSource).not.toContain("JEOMWON_QA_OPERATOR_EMAIL");
    expect(localSource).not.toContain("JEOMWON_QA_OPERATOR_STORAGE_STATE");
    expect(qaSource).toContain(
      'operatorSuccessSmoke: "BLOCKED_MAINTAINER_GOOGLE_IDENTITY"',
    );
    expect(qaSource).toContain('unauthenticatedAdminRoute.kind === "redirect"');
    expect(qaSource).toContain(
      "if (!domainConfig.features.operatorCalendarCrud)",
    );
    expect(qaSource).toContain('status: "SKIP"');
    expect(qaSource).toContain('reason: "features.operatorCalendarCrud=false"');
    expect(qaSource).toContain('status: "PASS"');
    expect(qaSource).toContain("operatorCrudBoundarySubcase");
    expect(qaSource).not.toContain("unauthenticatedAdminRouteStatus >= 300");
  });

  test("Given the canonical call union, When browser dispatch runs, Then every operation is handled by an exhaustive switch", async () => {
    const { QA_CANONICAL_OPERATIONS } = await import(
      "../packages/backend/src/qa-browser-contract"
    );

    for (const operation of QA_CANONICAL_OPERATIONS) {
      expect(browserSource).toContain(`case "${operation}":`);
    }
    expect(browserSource).toContain("request satisfies never");
    expect(browserSource).not.toContain(
      "Reflect.get(bridge, request.operation)",
    );
  });

  test("Given browser or runner failures, When evidence is persisted, Then raw Error messages are never returned or written", () => {
    expect(browserSource).not.toContain(
      'error instanceof Error ? error.message : "unknown mutation failure"',
    );
    expect(browserSource).toContain(
      'error: stableCode ?? "canonical_call_failed"',
    );
    expect(qaSource).not.toContain("output: runnerFailure");
    expect(qaSource).toContain('runnerFailure = "qa_runner_failed"');
    expect(qaSource).not.toContain("console.error(`FAIL QA-RUNNER");
  });

  test("Given identity B, When gate 11 probes A data, Then exact ownership-safe failures and an empty B snapshot are required", () => {
    const names = identifiers(qaSource);

    expect(names.has("identityBSnapshot")).toBe(true);
    expect(names.has("crossOwnerCreateHoldRejected")).toBe(true);
    expect(names.has("crossOwnerLifecycleRejected")).toBe(true);
    expect(qaSource).toContain('"slot_conflict"');
    expect(qaSource).toContain('"reservation_not_found"');
  });

  test("Given a production app build, When the QA bridge module is compiled, Then the implementation is behind a build-time production branch", () => {
    expect(bridgeSource).toContain('process.env.NODE_ENV === "production"');
    expect(bridgeSource).toContain("QaBrowserBridgeDevelopment");
  });
});
