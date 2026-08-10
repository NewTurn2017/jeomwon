import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { makeFunctionReference } from "convex/server";
import { parse as parseDotenv } from "dotenv";
import { domainConfig } from "../packages/backend/domain.config";
import type { pageRequestRoute } from "./qa-browser";
import type { QaGateId } from "./qa-contract";
import { QaStableAssertionError, qaAssertionCause } from "./qa-run-outcome";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };
export type QaResult = {
  readonly id: QaGateId;
  readonly name: string;
  readonly status: "PASS" | "FAIL" | "SKIP";
  readonly output: readonly string[];
};
export type QaResetResult = {
  readonly domainKey: string;
  readonly reservations: number;
  readonly chatThreads: number;
  readonly chatEvents: number;
  readonly reservationEmailDeliveries: number;
};
export type QaSeedResult = { readonly resources: number };

export const root = process.cwd();
export const backendDir = path.join(root, "packages/backend");
export const baseUrl =
  process.env.JEOMWON_QA_BASE_URL ?? "http://localhost:3000";
export const artifactDir =
  process.env.JEOMWON_QA_ARTIFACT_DIR ??
  path.join(root, "qa-artifacts", `jeomwon-${stamp()}`);
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const qaService = domainConfig.services[0];
export const qaServiceLabel = qaService?.label ?? "예약";
export const forbiddenPublicMarkers = [
  "operatorMemo",
  "privateDecision",
  "riskSignals",
  "costBasisCents",
] as const;
export const localEnv = readLocalEnvFiles([
  path.join(root, "apps/app/.env.local"),
  path.join(root, "packages/backend/.env.local"),
]);

export const qaState: {
  results: QaResult[];
  qaResetSummary: { reset: QaResetResult; seed: QaSeedResult } | null;
  pageA: Page | null;
  pageB: Page | null;
  unauthenticatedAdminRoute: Awaited<
    ReturnType<typeof pageRequestRoute>
  > | null;
  threadA: string | null;
  threadB: string | null;
} = {
  results: [],
  qaResetSummary: null,
  pageA: null,
  pageB: null,
  unauthenticatedAdminRoute: null,
  threadA: null,
  threadB: null,
};

export const createSessionMutation = makeFunctionReference<
  "mutation",
  {
    title: string;
    serviceKey: string;
    resourceKey: string;
    dateKey: string;
    startTime: string;
  },
  unknown
>("admin:createSession");
export const updateSessionMutation = makeFunctionReference<
  "mutation",
  {
    reservationId: string;
    title: string;
    serviceKey: string;
    resourceKey: string;
    dateKey: string;
    startTime: string;
  },
  unknown
>("admin:updateSession");
export const deleteSessionMutation = makeFunctionReference<
  "mutation",
  { reservationId: string },
  unknown
>("admin:deleteSession");
export const customerSnapshotQuery = makeFunctionReference<
  "query",
  Record<string, never>,
  unknown
>("customerReservations:snapshot");
export const customerCreateHoldMutation = makeFunctionReference<
  "mutation",
  { serviceKey: string; resourceKey: string; startMs: number },
  unknown
>("customerReservations:createHold");
export const customerConfirmReservationMutation = makeFunctionReference<
  "mutation",
  { reservationId: string },
  unknown
>("customerReservations:confirmReservation");
export const customerCancelReservationMutation = makeFunctionReference<
  "mutation",
  { reservationId: string },
  unknown
>("customerReservations:cancelReservation");
export const customerRescheduleReservationMutation = makeFunctionReference<
  "mutation",
  {
    reservationId: string;
    serviceKey: string;
    resourceKey: string;
    startMs: number;
  },
  unknown
>("customerReservations:rescheduleReservation");

export function writeJson(fileName: string, value: unknown): void {
  fs.writeFileSync(
    path.join(artifactDir, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new QaStableAssertionError(qaAssertionCause(message));
  }
}

export function assertRecord(
  value: unknown,
  label: string,
): asserts value is JsonRecord {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} is not an object`,
  );
}

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function readPath(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      return undefined;
    }
    current = Object.entries(current).find(
      ([entryKey]) => entryKey === key,
    )?.[1];
  }
  return current;
}

export function isPublicReservationNumber(value: string): boolean {
  return /^[A-Z0-9]{2,6}-\d{6}-[A-Z0-9]{6}$/.test(value);
}

export function findRawReservationIdLeaks(content: string): readonly string[] {
  const matches = content.matchAll(/"reservationId"\s*:\s*"([a-z0-9]{20,})"/g);
  return [...matches].map((match) => match[1] ?? "");
}

function readLocalEnvFiles(
  filePaths: readonly string[],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const parsed = parseDotenv(fs.readFileSync(filePath));
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in values) && value.trim() !== "") values[key] = value;
    }
  }
  return values;
}

function stamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}
