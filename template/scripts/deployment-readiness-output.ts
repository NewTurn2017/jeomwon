import { lstatSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function writeDeploymentReport(
  trustedRoot: string,
  relativeOutput: string,
  report: unknown,
) {
  const root = inspectRoot(trustedRoot);
  const parts = inspectRelativePath(relativeOutput);
  const leaf = parts.at(-1);
  if (!leaf) throw new Error("report_path_invalid");
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    inspectParent(parent);
  }
  const canonicalParent = realpathSync(parent);
  if (!contained(root, canonicalParent))
    throw new Error("report_parent_unsafe");
  const output = join(canonicalParent, leaf);
  inspectLeaf(output);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function inspectRoot(candidate: string) {
  const lexical = resolve(candidate);
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(lexical);
  } catch {
    throw new Error("report_root_missing");
  }
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error("report_root_unsafe");
  return realpathSync(lexical);
}

function inspectRelativePath(candidate: string) {
  if (!candidate || isAbsolute(candidate) || candidate.includes("\\"))
    throw new Error("report_path_invalid");
  const parts = candidate.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw new Error("report_path_invalid");
  return parts;
}

function inspectParent(path: string) {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch {
    throw new Error("report_parent_missing");
  }
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error("report_parent_unsafe");
}

function inspectLeaf(path: string) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error("report_output_unsafe");
    throw new Error("report_output_exists");
  } catch (error) {
    if (
      error instanceof Error &&
      ["report_output_unsafe", "report_output_exists"].includes(error.message)
    )
      throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("report_output_unsafe");
  }
}

function contained(root: string, candidate: string) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}
