import { spawn } from "node:child_process";
import path from "node:path";
import { domainConfig } from "../packages/backend/domain.config";
import {
  convexRunArgs,
  resolveQaConvexTarget,
  sanitizeConvexChildEnv,
} from "./qa-runtime-contract";
import {
  assertRecord,
  backendDir,
  isRecord,
  type JsonRecord,
  localEnv,
  type QaResetResult,
  type QaSeedResult,
  qaState,
} from "./qa-shared";

const convexCliTimeoutMs = 60_000;
export const qaConvexTarget = resolveQaConvexTarget(
  path.join(backendDir, ".env.local"),
);

export async function resetQaDeployment(): Promise<void> {
  try {
    const reset = parseResetResult(
      await runQaConvexFunction("qaReset:resetDomain", {
        domainKey: domainConfig.domainKey,
      }),
    );
    const seed = parseSeedResult(
      await runQaConvexFunction("jeomwonSeed:seed", {}),
    );
    qaState.qaResetSummary = { reset, seed };
    console.log(
      `QA reset ${reset.domainKey}: reservations=${reset.reservations}, reservationEmailDeliveries=${reset.reservationEmailDeliveries}, chatThreads=${reset.chatThreads}, chatEvents=${reset.chatEvents}, resources=${seed.resources}`,
    );
  } catch {
    throw new Error("qa_reset_failed");
  }
}

export async function runQaConvexFunction(
  functionName: string,
  args: JsonRecord,
): Promise<unknown> {
  const encodedArgs = JSON.stringify(args);
  return await new Promise<unknown>((resolve, reject) => {
    const child = spawn(
      "npx",
      convexRunArgs(qaConvexTarget, functionName, encodedArgs),
      {
        cwd: backendDir,
        env: sanitizeConvexChildEnv(process.env),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, convexCliTimeoutMs);
    if (!child.stdout || !child.stderr) {
      clearTimeout(timeout);
      reject(new Error("Convex CLI stdout/stderr pipes were not available."));
      return;
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(
          new Error(`Convex CLI timed out while running ${functionName}.`),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `Convex CLI exited with ${code ?? signal ?? "unknown"} while running ${functionName}. stderr: ${summarizeCliOutput(stderr)}`,
          ),
        );
        return;
      }
      try {
        resolve(parseConvexCliJson(stdout, functionName));
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new TypeError("Convex CLI parser failure"),
        );
      }
    });
  });
}

function parseConvexCliJson(stdout: string, functionName: string): unknown {
  const cleaned = stripAnsi(stdout).trim();
  const candidates = [cleaned, extractLastJsonObject(cleaned)].filter(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0,
  );
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return parsed;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  throw new Error(
    `Convex CLI did not return parseable JSON while running ${functionName}. stdout: ${summarizeCliOutput(stdout)}`,
  );
}

function extractLastJsonObject(value: string): string | null {
  const end = value.lastIndexOf("}");
  if (end === -1) return null;
  for (
    let start = value.indexOf("{");
    start !== -1 && start < end;
    start = value.indexOf("{", start + 1)
  ) {
    const candidate = value.slice(start, end + 1).trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  return null;
}

function summarizeCliOutput(value: string): string {
  const cleaned = stripAnsi(redactSecrets(value)).trim();
  if (!cleaned) return "(no output)";
  const summary = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join(" ");
  return summary.length > 1200 ? `${summary.slice(0, 1200)}...` : summary;
}

function stripAnsi(value: string): string {
  const escapeChar = String.fromCharCode(27);
  return value.replace(new RegExp(`${escapeChar}\\[[0-9;]*m`, "g"), "");
}

function redactSecrets(value: string): string {
  let redacted = value;
  const envValues: Record<string, string | undefined> = {
    ...localEnv,
    ...process.env,
  };
  for (const [key, secret] of Object.entries(envValues)) {
    if (
      !secret ||
      secret.length < 8 ||
      !/(AUTH|KEY|PASSWORD|SECRET|TOKEN)/i.test(key)
    )
      continue;
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

function parseResetResult(value: unknown): QaResetResult {
  assertRecord(value, "qa reset result");
  for (const key of [
    "domainKey",
    "reservations",
    "chatThreads",
    "chatEvents",
    "reservationEmailDeliveries",
  ] as const) {
    if (!(key in value)) throw new Error("qa_reset_result_invalid");
  }
  if (
    typeof value.domainKey !== "string" ||
    typeof value.reservations !== "number" ||
    typeof value.chatThreads !== "number" ||
    typeof value.chatEvents !== "number" ||
    typeof value.reservationEmailDeliveries !== "number"
  )
    throw new Error("qa_reset_result_invalid");
  return {
    domainKey: value.domainKey,
    reservations: value.reservations,
    chatThreads: value.chatThreads,
    chatEvents: value.chatEvents,
    reservationEmailDeliveries: value.reservationEmailDeliveries,
  };
}

function parseSeedResult(value: unknown): QaSeedResult {
  if (!isRecord(value) || typeof value.resources !== "number") {
    throw new Error("qa_seed_result_invalid");
  }
  return { resources: value.resources };
}
