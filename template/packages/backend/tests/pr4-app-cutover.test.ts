import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getFunctionName } from "convex/server";
import ts from "typescript";
import en from "../../../apps/app/src/locales/en";
import ko from "../../../apps/app/src/locales/ko";
import { jeomwonConvex } from "../src/convex-refs";

const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appSourceRoot = `${templateRoot}apps/app/src`;
const dashboardRoot = `${appSourceRoot}/app/[locale]/(dashboard)`;

async function typescriptFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "_generated") {
        files.push(...(await typescriptFiles(path)));
      }
      continue;
    }
    if (
      /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.(?:test|d)\.(?:ts|tsx)$/.test(entry.name)
    ) {
      files.push(path);
    }
  }

  return files;
}

function customerAccountConditionals(path: string, source: string) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: string[] = [];

  function record(expression: ts.Expression) {
    const text = expression.getText(sourceFile);
    if (/\bcustomerAccounts\b/.test(text)) {
      findings.push(
        `${path}:${sourceFile.getLineAndCharacterOfPosition(expression.getStart(sourceFile)).line + 1}:${text}`,
      );
    }
  }

  function visit(node: ts.Node) {
    if (
      ts.isIfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isSwitchStatement(node)
    ) {
      record(node.expression);
    } else if (ts.isConditionalExpression(node)) {
      record(node.condition);
    } else if (ts.isForStatement(node) && node.condition !== undefined) {
      record(node.condition);
    } else if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(node.operatorToken.kind)
    ) {
      record(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

test("authenticated app runtime has no customerAccounts feature branch", async () => {
  // Given
  const roots = [
    appSourceRoot,
    `${templateRoot}packages/agents/src`,
    `${templateRoot}packages/backend/convex`,
    `${templateRoot}packages/backend/src`,
  ];
  const files = (
    await Promise.all(roots.map(async (root) => await typescriptFiles(root)))
  ).flat();

  // When
  const findings = (
    await Promise.all(
      files.map(async (path) =>
        customerAccountConditionals(path, await readFile(path, "utf8")),
      ),
    )
  ).flat();

  // Then
  expect(JSON.stringify(findings)).toBe("[]");
});

test("root always mounts the customer manager and only the admin page mounts AdminDashboard", async () => {
  // Given
  const rootPage = `${dashboardRoot}/(onboarded)/page.tsx`;
  const adminPage = `${dashboardRoot}/admin/page.tsx`;

  // When
  const [rootSource, adminSource] = await Promise.all([
    readFile(rootPage, "utf8"),
    readFile(adminPage, "utf8"),
  ]);

  // Then
  expect(rootSource.match(/<CustomerReservationManager \/>/g)?.length).toBe(1);
  expect(rootSource.includes("AdminDashboard")).toBe(false);
  expect(rootSource.includes("viewerRole")).toBe(false);
  expect(rootSource.includes("rootDashboardSurface")).toBe(false);
  expect(adminSource.match(/<AdminDashboard \/>/g)?.length).toBe(1);
  expect(adminSource).toMatch('role !== "operator"');
  expect(adminSource).toMatch("notFound()");
});

test("authenticated dashboard always mounts chat and its API has no legacy 404 feature branch", async () => {
  // Given
  const layoutPath = `${dashboardRoot}/layout.tsx`;
  const routePath = `${appSourceRoot}/app/api/chat/route.ts`;

  // When
  const [layoutSource, routeSource] = await Promise.all([
    readFile(layoutPath, "utf8"),
    readFile(routePath, "utf8"),
  ]);

  // Then
  expect(layoutSource.match(/<CustomerChatWidget \/>/g)?.length).toBe(1);
  expect(layoutSource.includes("customerAccounts")).toBe(false);
  expect(routeSource.includes("customerAccounts")).toBe(false);
  expect(routeSource.includes("Not Found")).toBe(false);
  expect(routeSource).toMatch("status: 401");
  expect(routeSource).toMatch("authToken: token");
});

test("chat and customer UI expose only canonical reservation mutation references", async () => {
  // Given
  const legacyNames = [
    "createHold",
    "confirmReservation",
    "cancelReservation",
    "rescheduleReservation",
  ] as const;
  const refsSource = await readFile(
    `${templateRoot}packages/backend/src/convex-refs.ts`,
    "utf8",
  );
  const agentsSource = await readFile(
    `${templateRoot}packages/agents/src/index.ts`,
    "utf8",
  );
  const agentToolsSource = await readFile(
    `${templateRoot}packages/backend/convex/agentTools.ts`,
    "utf8",
  );

  for (const name of legacyNames) {
    // When
    const canonicalName = getFunctionName(
      jeomwonConvex.customerReservations[name],
    );

    // Then
    expect(name in jeomwonConvex.agentTools).toBe(false);
    expect(canonicalName).toBe(`customerReservations:${name}`);
    expect(new RegExp(`export const ${name}\\s*=`).test(agentToolsSource)).toBe(
      false,
    );
  }

  expect("customerSnapshot" in jeomwonConvex.admin).toBe(false);
  expect(refsSource.includes("admin:customerSnapshot")).toBe(false);
  expect(refsSource.includes("customerSnapshot:")).toBe(false);
  expect(agentsSource.includes("customerReservationToolReferences")).toBe(
    false,
  );
  expect(agentsSource.includes("legacyCustomerReservationToolReferences")).toBe(
    false,
  );
  expect(
    agentToolsSource.includes("assertLegacyReservationAdapterEnabled"),
  ).toBe(false);
});

test("customer-first locale contracts expose reservations navigation without a root admin metadata override", async () => {
  // Given
  const rootSource = await readFile(
    `${dashboardRoot}/(onboarded)/page.tsx`,
    "utf8",
  );

  // When
  const localeContracts = [ko.navigation, en.navigation];

  // Then
  for (const navigation of localeContracts) {
    expect("reservations" in navigation).toBe(true);
  }
  expect(rootSource.includes("export const metadata")).toBe(false);
});
