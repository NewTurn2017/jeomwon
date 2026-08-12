import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function safeDirectory(
  trustedAnchor: string,
  candidate: string,
  code: string,
) {
  const anchorLexical = resolve(trustedAnchor);
  const anchor = inspectDirectory(anchorLexical, code);
  const lexical = resolve(candidate);
  if (lexical === anchor) return anchor;
  const offset = relative(anchorLexical, lexical);
  if (outside(offset)) throw new Error(code);
  let current = anchorLexical;
  if (offset) {
    for (const part of offset.split(sep)) {
      current = join(current, part);
      inspectDirectory(current, code);
    }
  }
  const canonical = realpathSync(current);
  if (outside(relative(anchor, canonical))) throw new Error(code);
  return canonical;
}

export function safeRelativeParts(candidate: string, code: string) {
  if (
    !candidate ||
    isAbsolute(candidate) ||
    candidate.includes("\\") ||
    candidate.includes("\0")
  )
    throw new Error(code);
  const parts = candidate.split("/");
  if (
    parts.some(
      (part) => !part || part === "." || part === ".." || /[\r\n]/.test(part),
    )
  )
    throw new Error(code);
  return parts;
}

export function inspectPathComponents(
  root: string,
  parts: readonly string[],
  options: { missing: string; symlink: string; nonDirectory: string },
) {
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(current);
    } catch {
      throw new Error(options.missing);
    }
    if (stat.isSymbolicLink()) throw new Error(options.symlink);
    if (index < parts.length - 1 && !stat.isDirectory())
      throw new Error(options.nonDirectory);
  }
  return current;
}

function inspectDirectory(path: string, code: string) {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch {
    throw new Error(code);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(code);
  return realpathSync(path);
}

function outside(offset: string) {
  return offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset);
}
