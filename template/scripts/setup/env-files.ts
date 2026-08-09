import fs from "node:fs";
import path from "node:path";
import { getProject } from "./config";
import { localized } from "./locales";
import type { RuntimeContext } from "./types";

export function assertEnvLocalIgnored(ctx: RuntimeContext) {
  const gitignorePath = path.join(ctx.root, ".gitignore");
  const gitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";
  const lines = gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.includes(".env*.local") && !lines.includes(".env.local")) {
    throw new Error("env_local_not_ignored");
  }
}

export type AtomicWriteOptions = {
  rename?: (temporaryPath: string, targetPath: string) => void;
};

const activeTemporaryFiles = new Set<string>();

export function cleanupAtomicTemps() {
  for (const temporaryPath of activeTemporaryFiles) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // The original write error remains authoritative.
    }
    activeTemporaryFiles.delete(temporaryPath);
  }
}

export function atomicWriteEnvFile(
  targetPath: string,
  contents: string,
  options: AtomicWriteOptions = {},
) {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `${path.basename(targetPath)}.tmp-${process.pid}-${crypto.randomUUID()}`,
  );
  const existingMode = fs.existsSync(targetPath)
    ? fs.statSync(targetPath).mode & 0o777
    : 0o600;
  activeTemporaryFiles.add(temporaryPath);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, contents, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    (options.rename ?? fs.renameSync)(temporaryPath, targetPath);
    fs.chmodSync(targetPath, existingMode);
    activeTemporaryFiles.delete(temporaryPath);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.rmSync(temporaryPath, { force: true });
    } finally {
      activeTemporaryFiles.delete(temporaryPath);
    }
    throw error;
  }
}

export async function setLocalEnv(
  ctx: RuntimeContext,
  projectId: string,
  name: string,
  value: string,
) {
  const project = getProject(ctx, projectId);
  if (!project.envFile) {
    throw new Error(`setup_project_env_file_missing:${projectId}`);
  }

  if (isLikelySecretName(name)) {
    ctx.knownSecrets.add(value);
  }

  let pending = ctx.localEnvWrites.get(projectId);
  if (!pending) {
    pending = new Map();
    ctx.localEnvWrites.set(projectId, pending);
  }
  pending.set(name, value);

  if (ctx.options.dryRun) {
    console.log(
      `[local_env_write:${projectId}:${name}] ${localized(
        ctx.locale,
        `DRY RUN: ${name}을 ${project.envFile}에 쓸 예정입니다.`,
        `DRY RUN: would write ${name} to ${project.envFile}.`,
      )}`,
    );
    return;
  }

  const envPath = path.join(ctx.root, project.envFile);
  const current = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8")
    : "";
  const next = upsertEnvText(current, new Map([[name, value]]));
  atomicWriteEnvFile(envPath, next);
  console.log(
    `[local_env_write:${projectId}:${name}] ${localized(
      ctx.locale,
      `${project.envFile}: ${name} 설정됨.`,
      `${project.envFile}: ${name} configured.`,
    )}`,
  );
}
export function readLocalEnv(ctx: RuntimeContext, projectId: string) {
  const project = getProject(ctx, projectId);
  const fromStub = ctx.stubs.existingLocalEnv?.[projectId];
  const values = new Map<string, string>();
  if (fromStub) {
    for (const [key, value] of Object.entries(fromStub)) {
      values.set(key, value);
    }
  }

  if (project.envFile && !ctx.options.freshDryRun) {
    const envPath = path.join(ctx.root, project.envFile);
    if (fs.existsSync(envPath)) {
      for (const [key, value] of parseEnv(fs.readFileSync(envPath, "utf8"))) {
        values.set(key, value);
      }
    }
  }

  const pending = ctx.localEnvWrites.get(projectId);
  if (pending) {
    for (const [key, value] of pending) {
      values.set(key, value);
    }
  }
  return values;
}

export function parseEnv(text: string) {
  const values = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equals = line.indexOf("=");
    if (equals === -1) {
      continue;
    }
    const key = line.slice(0, equals).trim();
    const value = line.slice(equals + 1).trim();
    values.set(key, unquoteEnvValue(value));
  }
  return values;
}

export function parseEnvKeys(text: string) {
  return [...parseEnv(text).keys()];
}

export function upsertEnvText(text: string, updates: Map<string, string>) {
  const lines = text ? text.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const trimmed = line.trim();
    const equals = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || equals === -1) {
      return line;
    }
    const key = trimmed.slice(0, equals).trim();
    if (!updates.has(key)) {
      return line;
    }
    seen.add(key);
    return `${key}=${quoteEnvValue(updates.get(key) ?? "")}`;
  });

  for (const [key, value] of updates) {
    if (!seen.has(key)) {
      if (next.length > 0 && next[next.length - 1] !== "") {
        next.push("");
      }
      next.push(`${key}=${quoteEnvValue(value)}`);
    }
  }

  return `${next.join("\n").replace(/\n+$/, "")}\n`;
}

export function quoteEnvValue(value: string) {
  if (!value) {
    return "";
  }
  if (/[\s"'#]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}
export function isLikelySecretName(name: string) {
  return /SECRET|TOKEN|PRIVATE|API_KEY|OPENAI_API_KEY/i.test(name);
}
