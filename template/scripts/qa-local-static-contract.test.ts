import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const localSource = readFileSync(join(root, "scripts/qa-local.ts"), "utf8");
const runtimeContractSource = readFileSync(
  join(root, "scripts/qa-runtime-contract.ts"),
  "utf8",
);
const readyRouteSource = readFileSync(
  join(root, "apps/app/src/app/api/qa-ready/route.ts"),
  "utf8",
);

describe("QA local runner static contract", () => {
  test("Given ambient Convex credentials, When children launch, Then target and environment are pinned", () => {
    expect(localSource).toContain("sanitizeConvexChildEnv");
    expect(localSource).toContain("resolveQaConvexTarget");
    expect(localSource).toContain("validateQaRuntimeArtifacts");
    expect(runtimeContractSource).toContain('"--env-file"');
    expect(runtimeContractSource).toContain('"--deployment"');
    expect(localSource).toContain("cleanupFailures");
    expect(localSource).not.toContain("env: process.env");
    const convexDevCapture = localSource.slice(
      localSource.indexOf('spawnSync("npx", convexDevArgs(target)'),
      localSource.indexOf("if (convexDev.status !== 0)"),
    );
    expect(convexDevCapture).toContain('stdio: ["ignore", "pipe", "pipe"]');
    expect(convexDevCapture).not.toContain('stdio: "inherit"');
    expect(localSource.indexOf("validateQaAppConvexUrl(")).toBeLessThan(
      localSource.indexOf("configureTemporaryConvexEnvironment("),
    );
    expect(localSource.indexOf("validateQaAppConvexUrl(")).toBeLessThan(
      localSource.indexOf('spawn("bun", ["next", "dev"'),
    );
    expect(localSource).toContain("NEXT_PUBLIC_CONVEX_URL: target.convexUrl");
    expect(localSource).toContain("CONVEX_URL: target.convexUrl");
  });

  test("Given an occupied or unrelated port, When lifecycle runs, Then it fails closed around owned resources", () => {
    expect(localSource.indexOf("runAfterQaPortPreflight(")).toBeLessThan(
      localSource.indexOf("configureTemporaryConvexEnvironment("),
    );
    expect(localSource).not.toContain("lsof");
    expect(localSource).not.toContain("app:port-cleanup");
    expect(localSource).toContain("terminateOwnedQaProcess");
    expect(localSource).toContain("detached: true");
    expect(localSource).toContain("JEOMWON_QA_READY_NONCE");
    expect(localSource).toContain("waitForOwnedQaAppReady");
    expect(readyRouteSource).toContain("JEOMWON_QA_BROWSER");
    expect(readyRouteSource).toContain("JEOMWON_QA_READY_NONCE");
    expect(readyRouteSource).toContain('"x-jeomwon-qa-ready"');
    expect(readyRouteSource).toContain('"jeomwon-qa-ready"');
  });
});
