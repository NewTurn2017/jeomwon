import type { JsonRecord, JsonValue } from "./agent-contract";

export class BoundaryError extends Error {
  readonly details: string[];

  constructor(details: string[]) {
    super("Boundary value is not JSON serializable.");
    this.details = details;
  }
}

export function normalizeConvexArgs(input: unknown): JsonRecord {
  const normalized = normalizeJsonValue(input, "$");
  if (!isJsonRecord(normalized)) {
    throw new BoundaryError(["Expected a JSON object at the Convex boundary."]);
  }
  return normalized;
}

export function normalizeJsonValue(input: unknown, path = "$"): JsonValue {
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  ) {
    if (typeof input === "number" && !Number.isFinite(input)) {
      throw new BoundaryError([`${path} must be a finite number.`]);
    }
    return input;
  }

  if (typeof input === "undefined") {
    throw new BoundaryError([`${path} must not be undefined.`]);
  }

  if (input instanceof Date) {
    throw new BoundaryError([`${path} must be a timestamp, not a Date.`]);
  }

  if (input instanceof Map || input instanceof Set) {
    throw new BoundaryError([`${path} must be a plain JSON value.`]);
  }

  if (Array.isArray(input)) {
    return input.map((value, index) =>
      normalizeJsonValue(value, `${path}[${index}]`),
    );
  }

  if (typeof input === "object") {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new BoundaryError([`${path} must be a plain object.`]);
    }

    const output: JsonRecord = {};
    for (const [key, value] of Object.entries(input)) {
      output[key] = normalizeJsonValue(value, `${path}.${key}`);
    }
    return output;
  }

  throw new BoundaryError([`${path} contains an unsupported value.`]);
}

export function isJsonRecord(value: JsonValue): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function readStringField(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : null;
}

export function readNumberField(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function invalidRequest(details: string[]) {
  return {
    error: {
      code: "invalid_chat_request",
      details,
    },
  };
}
