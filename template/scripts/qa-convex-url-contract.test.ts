import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveQaConvexTarget,
  validateQaAppConvexUrl,
} from "./qa-runtime-contract";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jeomwon-qa-url-"));
  tempDirs.push(dir);
  return dir;
}

describe("QA Convex URL preflight", () => {
  test("Given app and backend URLs differ, When preflight runs, Then it fails before env mutation, app spawn, or reset", () => {
    const dir = tempDir();
    const backendEnv = join(dir, "backend.env");
    const appEnv = join(dir, "app.env");
    writeFileSync(
      backendEnv,
      "CONVEX_DEPLOYMENT=dev:verified-dev-123\nCONVEX_URL=https://verified-dev-123.convex.cloud\n",
    );
    writeFileSync(
      appEnv,
      "NEXT_PUBLIC_CONVEX_URL=https://different-dev.convex.cloud\n",
    );
    const sideEffects: string[] = [];
    const target = resolveQaConvexTarget(backendEnv);

    let failure: Error | null = null;
    try {
      validateQaAppConvexUrl(target, appEnv);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      failure = error;
    }
    expect(failure?.message).toContain("NEXT_PUBLIC_CONVEX_URL");
    expect(failure?.message).not.toContain("different-dev");
    expect(sideEffects).toEqual([]);
  });

  test("Given app and backend URLs match, When preflight runs, Then the canonical URL cannot drift", () => {
    const dir = tempDir();
    const backendEnv = join(dir, "backend.env");
    const appEnv = join(dir, "app.env");
    const canonicalUrl = "https://verified-dev-123.convex.cloud";
    writeFileSync(
      backendEnv,
      `CONVEX_DEPLOYMENT=dev:verified-dev-123\nCONVEX_URL=${canonicalUrl}\n`,
    );
    writeFileSync(appEnv, `NEXT_PUBLIC_CONVEX_URL=${canonicalUrl}\n`);

    const target = resolveQaConvexTarget(backendEnv);
    expect(target.convexUrl).toBe(canonicalUrl);
    expect(validateQaAppConvexUrl(target, appEnv)).toBeUndefined();
  });
});
