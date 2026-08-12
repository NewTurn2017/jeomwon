import { relative, resolve } from "node:path";

export {
  auditEvidenceCoverage,
  auditPlanFile,
  auditPlanText,
} from "./release-evidence-audit-plan";
export {
  auditGitScope,
  auditScopePaths,
  gitSourceStateHash,
} from "./release-evidence-audit-scope";

export type AuditMode = "in-progress" | "strict";

export function auditMarkdown(value: {
  kind: string;
  status: string;
  errors: readonly string[];
}) {
  return [
    `# ${value.kind}`,
    "",
    `Status: ${value.status.toUpperCase()}`,
    "",
    "## Errors",
    ...(value.errors.length
      ? value.errors.map((item) => `- ${item}`)
      : ["- none"]),
    "",
  ].join("\n");
}

export function relativeTo(root: string, path: string) {
  return relative(resolve(root), resolve(path)).split("\\").join("/");
}
