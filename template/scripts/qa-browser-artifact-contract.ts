import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function validateBrowserArtifactBundle(
  artifactDir: string,
  browserArtifacts: unknown,
  issues: string[],
): void {
  if (
    !isRecord(browserArtifacts) ||
    browserArtifacts.actions !== "browser-actions.json" ||
    browserArtifacts.cleanup !== "cleanup.json"
  ) {
    issues.push("manifest:browser-artifacts");
    return;
  }
  validateBrowserActions(
    artifactDir,
    join(artifactDir, browserArtifacts.actions),
    issues,
  );
  validateCleanup(join(artifactDir, browserArtifacts.cleanup), issues);
}

function validateBrowserActions(
  artifactDir: string,
  actionsPath: string,
  issues: string[],
): void {
  const actions = readJson(actionsPath);
  if (!Array.isArray(actions)) {
    issues.push("browser-actions:invalid");
    return;
  }
  const screenshots = actions.filter(
    (action) => isRecord(action) && action.action === "screenshot",
  );
  for (const identity of ["A", "B"] as const) {
    const login = actions.find(
      (candidate) =>
        isRecord(candidate) &&
        candidate.identity === identity &&
        candidate.action === "login" &&
        candidate.artifact === null,
    );
    if (!isRecord(login)) issues.push(`browser-login:missing:${identity}`);
    const action = screenshots.find(
      (candidate) => isRecord(candidate) && candidate.identity === identity,
    );
    const expectedArtifact = `browser-${identity.toLowerCase()}-login.png`;
    if (!isRecord(action) || action.artifact !== expectedArtifact) {
      issues.push(`screenshot:missing:${identity}`);
      continue;
    }
    if (!isNonemptyPng(join(artifactDir, expectedArtifact))) {
      issues.push(`screenshot:invalid:${identity}`);
    }
  }
}

function validateCleanup(cleanupPath: string, issues: string[]): void {
  const cleanup = readJson(cleanupPath);
  if (
    !isRecord(cleanup) ||
    cleanup.browser !== "closed" ||
    cleanup.contexts !== "closed"
  ) {
    issues.push("cleanup:not-closed");
  }
}

function isNonemptyPng(filePath: string): boolean {
  if (
    !existsSync(filePath) ||
    statSync(filePath).size <= PNG_SIGNATURE.length
  ) {
    return false;
  }
  return readFileSync(filePath)
    .subarray(0, PNG_SIGNATURE.length)
    .equals(PNG_SIGNATURE);
}

function readJson(filePath: string): unknown {
  if (!existsSync(filePath) || statSync(filePath).size === 0) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
