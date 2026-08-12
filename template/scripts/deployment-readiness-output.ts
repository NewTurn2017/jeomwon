import { lstatSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { safeDirectory, safeRelativeParts } from "./release-evidence-paths";

export function writeDeploymentReport(
  trustedRoot: string,
  relativeOutput: string,
  report: unknown,
  trustedAnchor = trustedRoot,
) {
  writeTrustedText(
    trustedRoot,
    relativeOutput,
    `${JSON.stringify(report, null, 2)}\n`,
    trustedAnchor,
  );
}

export function writeTrustedText(
  trustedRoot: string,
  relativeOutput: string,
  content: string,
  trustedAnchor = trustedRoot,
) {
  const root = safeDirectory(trustedAnchor, trustedRoot, "report_root_unsafe");
  const parts = safeRelativeParts(relativeOutput, "report_path_invalid");
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
  writeFileSync(output, content, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
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
