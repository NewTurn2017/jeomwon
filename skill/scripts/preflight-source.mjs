import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export class PreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function resolveSkillRoot(env = process.env) {
  const inferred = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const requested = env.CLAUDE_SKILL_DIR
    ? resolve(env.CLAUDE_SKILL_DIR)
    : inferred;
  let root;
  try {
    root = await realpath(requested);
  } catch {
    throw new PreflightError("skill_root_unresolved", requested);
  }
  for (const path of [
    "SKILL.md",
    "jeomwon-skill.json",
    "scripts/preflight.mjs",
  ]) {
    if (!existsSync(join(root, path)))
      throw new PreflightError(
        "skill_root_unresolved",
        `${root}: missing ${path}`,
      );
  }
  return root;
}

export async function readSkillManifest(root) {
  let value;
  try {
    value = JSON.parse(
      await readFile(join(root, "jeomwon-skill.json"), "utf8"),
    );
  } catch (error) {
    throw new PreflightError("skill_manifest_invalid", String(error));
  }
  if (
    value?.schemaVersion !== 1 ||
    value?.templateSource?.kind !== "bundled-archive" ||
    !isSha(value.templateSource.archiveSha256) ||
    !isSha(value.templateSource.contentSha256)
  )
    throw new PreflightError(
      "skill_manifest_invalid",
      join(root, "jeomwon-skill.json"),
    );
  return value;
}

export async function readRequiredBun(templateRoot) {
  let value;
  try {
    value = JSON.parse(
      await readFile(join(templateRoot, "package.json"), "utf8"),
    );
  } catch (error) {
    throw new PreflightError("toolchain_pin_invalid", String(error));
  }
  const match =
    typeof value.packageManager === "string"
      ? value.packageManager.match(/^bun@(\d+\.\d+\.\d+)$/)
      : null;
  if (!match)
    throw new PreflightError(
      "toolchain_pin_invalid",
      "packageManager must pin bun exactly",
    );
  return match[1];
}

export async function checkBunVersion(required) {
  if (Bun.version !== required)
    throw new PreflightError(
      "bun_version_mismatch",
      `${Bun.version} (expected ${required})`,
    );
}

export async function prepareTemplate(root, manifest, env = process.env) {
  const configured = env.JEOMWON_TEMPLATE_ARCHIVE;
  const archivePath = resolve(
    configured ?? join(root, manifest.templateSource.archivePath),
  );
  const expected = configured
    ? env.JEOMWON_TEMPLATE_ARCHIVE_SHA256?.toLowerCase()
    : manifest.templateSource.archiveSha256;
  if (!expected)
    throw new PreflightError(
      "archive_checksum_missing",
      "JEOMWON_TEMPLATE_ARCHIVE_SHA256",
    );
  if (!isSha(expected))
    throw new PreflightError("archive_checksum_invalid", expected);
  if (!existsSync(archivePath))
    throw new PreflightError("archive_missing", archivePath);
  const bytes = new Uint8Array(await Bun.file(archivePath).arrayBuffer());
  const actual = sha(bytes);
  if (actual !== expected)
    throw new PreflightError(
      "archive_checksum_mismatch",
      `${actual} (expected ${expected})`,
    );
  let files;
  try {
    files = await new Bun.Archive(bytes).files();
  } catch (error) {
    throw new PreflightError("archive_invalid", String(error));
  }
  const entries = [...files.entries()];
  const prefix = templatePrefix(entries.map(([name]) => name));
  const content = createHash("sha256");
  for (const [name, file] of entries
    .filter(([name]) => name.startsWith(prefix) && name !== prefix)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
    const key = name.slice(prefix.length);
    if (unsafe(key)) throw new PreflightError("archive_traversal", name);
    content
      .update(key)
      .update("\0")
      .update(new Uint8Array(await file.arrayBuffer()))
      .update("\0");
  }
  const contentHash = content.digest("hex");
  if (contentHash !== manifest.templateSource.contentSha256)
    throw new PreflightError(
      "archive_content_mismatch",
      `${contentHash} (expected ${manifest.templateSource.contentSha256})`,
    );
  const workspace = await mkdtemp(join(tmpdir(), "jeomwon-preflight-"));
  const templateRoot = join(workspace, "template");
  try {
    for (const [name, file] of entries) {
      if (!name.startsWith(prefix) || name === prefix) continue;
      const key = name.slice(prefix.length);
      if (unsafe(key)) throw new PreflightError("archive_traversal", name);
      const destination = resolve(templateRoot, ...key.split("/"));
      if (!destination.startsWith(`${templateRoot}${sep}`))
        throw new PreflightError("archive_traversal", name);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, new Uint8Array(await file.arrayBuffer()));
    }
    return { archivePath, contentHash, templateRoot, workspace };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
}

export async function assertCacheCandidate(env = process.env) {
  const cache = env.BUN_INSTALL_CACHE_DIR;
  if (!cache) return;
  try {
    if ((await readdir(cache)).length > 0) return;
  } catch {}
  throw new PreflightError("cache_not_ready", `empty cache: ${cache}`);
}

export function installTemplate(templateRoot, offline, env = process.env) {
  const isolatedHome =
    offline && env.BUN_INSTALL_CACHE_DIR
      ? { HOME: join(dirname(templateRoot), "offline-home") }
      : {};
  return Bun.spawnSync({
    cmd: [
      process.execPath,
      "install",
      "--frozen-lockfile",
      ...(offline ? ["--offline"] : []),
      "--ignore-scripts",
    ],
    cwd: templateRoot,
    env: { ...env, ...isolatedHome, CI: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
}

export async function disposeTemplate(source) {
  await rm(source.workspace, { recursive: true, force: true });
}

export function assertCacheReady(result) {
  if (result.exitCode !== 0)
    throw new PreflightError(
      "cache_not_ready",
      "offline frozen install requires cached packages",
    );
}

function templatePrefix(names) {
  const candidates = names
    .map((name) => name.replaceAll("\\", "/"))
    .filter((name) => !unsafe(name))
    .map((name) => {
      const parts = name.split("/");
      const index = parts.indexOf("template");
      return index < 0 ? "" : `${parts.slice(0, index + 1).join("/")}/`;
    })
    .filter(Boolean)
    .sort(
      (left, right) => left.length - right.length || left.localeCompare(right),
    );
  if (!candidates[0])
    throw new PreflightError(
      "archive_template_missing",
      `${names.length} entries`,
    );
  return candidates[0];
}

function unsafe(path) {
  const normalized = path.replaceAll("\\", "/");
  return (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  );
}

function isSha(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
