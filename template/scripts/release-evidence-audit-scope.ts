import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { AuditMode } from "./release-evidence-audit";
import { safeRoot, sha256Bytes } from "./release-evidence-files";

const ALLOWED_ROOTS = new Set([
  ".github",
  ".omo",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "FEATURES.md",
  "README.md",
  "README.en.md",
  "VISION.md",
  "docs",
  "lectures",
  "skill",
  "site",
  "template",
]);

export function auditScopePaths(
  committed: string[],
  uncommitted: string[],
  mode: AuditMode,
  root?: string,
) {
  const errors: string[] = [];
  for (const path of [...committed].sort())
    validateScopePath(path, "committed", root, errors);
  if (mode === "strict")
    for (const path of [...uncommitted].sort()) {
      validateScopePath(path, "uncommitted", root, errors);
      errors.push(`scope_uncommitted_source:${path}`);
    }
  return report(mode, [...new Set(errors)], {
    committedPaths: [...committed].sort(),
    uncommittedPaths: [...uncommitted].sort(),
  });
}

export function gitSourceStateHash(
  rootCandidate: string,
  anchor = rootCandidate,
) {
  const root = safeRoot(rootCandidate, "scope_root_unsafe", anchor);
  const records = statusRecords(
    execFileSync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: root },
    ),
  );
  const filtered = records.filter(
    (item) => !item.path.startsWith(".omo/evidence/"),
  );
  if (!filtered.length) return null;
  const chunks: Buffer[] = [];
  for (const item of filtered.sort((a, b) => a.path.localeCompare(b.path))) {
    chunks.push(
      Buffer.from(`${item.status}\0${item.path}\0${item.from ?? ""}\0`),
    );
    const absolute = resolve(root, item.path);
    if (
      existsSync(absolute) &&
      lstatSync(absolute).isFile() &&
      !lstatSync(absolute).isSymbolicLink()
    )
      chunks.push(readFileSync(absolute));
  }
  return sha256Bytes(Buffer.concat(chunks));
}

export function auditGitScope(
  rootCandidate: string,
  base: string,
  head: string,
  mode: AuditMode,
  anchor = rootCandidate,
) {
  const root = safeRoot(rootCandidate, "scope_root_unsafe", anchor);
  const committed = nul(
    execFileSync(
      "git",
      ["diff", "--name-only", "-z", `${base}..${head}`, "--"],
      { cwd: root },
    ),
  );
  const uncommitted = statusRecords(
    execFileSync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: root },
    ),
  ).flatMap((item) => (item.from ? [item.path, item.from] : [item.path]));
  return auditScopePaths(committed, uncommitted, mode, root);
}

function validateScopePath(
  path: string,
  kind: string,
  root: string | undefined,
  errors: string[],
) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    /[\0\r\n]/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    errors.push(`scope_path_invalid:${path}`);
    return;
  }
  const first = path.split("/")[0] ?? "";
  if (
    [".gjc", "samples", "upstream"].includes(first) ||
    path.split("/").includes("_generated") ||
    /(?:^|\/)(?:secrets?|credentials?|prod(?:uction)?)[^/]*|\.(?:pem|key|p12)$/i.test(
      path,
    )
  )
    errors.push(`scope_forbidden_path:${path}`);
  else if (!ALLOWED_ROOTS.has(first))
    errors.push(`scope_unrelated_path:${path}`);
  if (root) inspectExistingComponents(root, path, kind, errors);
}

function inspectExistingComponents(
  rootCandidate: string,
  path: string,
  kind: string,
  errors: string[],
) {
  const root = safeRoot(rootCandidate, "scope_root_unsafe", rootCandidate);
  let current = root;
  for (const part of path.split("/")) {
    current = resolve(current, part);
    if (!existsSync(current)) return;
    if (lstatSync(current).isSymbolicLink()) {
      errors.push(`scope_${kind}_symlink:${path}`);
      return;
    }
  }
}

function statusRecords(output: Buffer) {
  const values = nul(output);
  const records: Array<{ status: string; path: string; from?: string }> = [];
  for (let index = 0; index < values.length; index++) {
    const record = values[index] ?? "";
    const status = record.slice(0, 2);
    const path = record.slice(3);
    if (/^[RC]/.test(status) || /[RC]$/.test(status))
      records.push({ status, path, from: values[++index] });
    else records.push({ status, path });
  }
  return records;
}
function nul(output: Buffer) {
  const values = output.toString("utf8").split("\0");
  if (values.at(-1) === "") values.pop();
  return values;
}
function report(
  mode: AuditMode,
  errors: string[],
  extra: Record<string, unknown>,
) {
  return {
    schemaVersion: 1,
    kind: "scope-audit",
    mode,
    status: errors.length ? ("fail" as const) : ("pass" as const),
    ...extra,
    errors,
    ok: !errors.length,
  };
}
