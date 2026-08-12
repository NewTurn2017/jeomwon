#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  type AuditMode,
  auditGitScope,
  auditMarkdown,
  auditPlanFile,
  gitSourceStateHash,
  relativeTo,
} from "./release-evidence-audit";
import { buildReleaseReceipt } from "./release-evidence-contract";
import {
  safeFile,
  safeRoot,
  writeEvidenceMarkdown,
  writeEvidenceReport,
} from "./release-evidence-files";

function usage() {
  return [
    "Usage:",
    "  bun scripts/release-evidence.ts --input <relative-fixture.json> --root <repository> --output-dir <trusted-directory> --output <relative-receipt.json>",
    "  bun scripts/release-evidence.ts audit-plan --plan <plan.md> --evidence <evidence-directory> --mode <in-progress|strict> --output-dir <trusted-directory> --output <report.json>",
    "  bun scripts/release-evidence.ts audit-scope --base <commit> --head <commit> --root <repository> --plan <plan.md> --capabilities <manifest.json> --mode <in-progress|strict> --output-dir <trusted-directory> --output <report.json>",
  ].join("\n");
}

function option(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
function required(args: string[], flag: string) {
  const value = option(args, flag);
  if (!value) throw new Error("arguments_invalid");
  return value;
}
function mode(args: string[]): AuditMode {
  const value = option(args, "--mode") ?? "strict";
  if (value !== "strict" && value !== "in-progress")
    throw new Error("audit_mode_invalid");
  return value;
}
function gitHead(root: string) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

async function main(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return 0;
  }
  const command = args[0]?.startsWith("audit-") ? args[0] : "receipt";
  const root = safeRoot(
    resolve(option(args, "--root") ?? process.cwd()),
    "repository_root_unsafe",
    process.cwd(),
  );
  const outputDir = resolve(required(args, "--output-dir"));
  const output = required(args, "--output");
  let report: { status: string; errors?: readonly string[] };
  if (command === "receipt") {
    const input = required(args, "--input");
    const parsed: unknown = JSON.parse(
      readFileSync(safeFile(root, input), "utf8"),
    );
    report = buildReleaseReceipt(
      parsed,
      root,
      gitHead(root),
      gitSourceStateHash(root),
    );
  } else if (command === "audit-plan") {
    report = auditPlanFile(
      root,
      relativeTo(root, required(args, "--plan")),
      mode(args),
      required(args, "--evidence"),
    );
  } else if (command === "audit-scope") {
    JSON.parse(
      readFileSync(
        safeFile(root, relativeTo(root, required(args, "--capabilities"))),
        "utf8",
      ),
    );
    report = auditGitScope(
      root,
      required(args, "--base"),
      required(args, "--head"),
      mode(args),
    );
  } else throw new Error("arguments_invalid");
  writeEvidenceReport(outputDir, output, report, root);
  if (command !== "receipt") {
    const markdown = `${basename(output, ".json")}.md`;
    writeEvidenceMarkdown(
      outputDir,
      markdown,
      auditMarkdown({
        kind: command,
        status: report.status,
        errors: report.errors ?? [],
      }),
      root,
    );
  }
  const marker =
    command === "receipt" ? "RELEASE EVIDENCE" : command.toUpperCase();
  console.log(`${marker} ${report.status.toUpperCase()}`);
  for (const error of report.errors ?? []) console.error(`ERROR [${error}]`);
  return report.status === "pass" ? 0 : 1;
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    const raw =
      error instanceof SyntaxError
        ? "input_json_invalid"
        : error instanceof Error
          ? error.message
          : "unexpected_error";
    const code = /^[a-z0-9_:-]+$/.test(raw) ? raw : "unexpected_error";
    console.error(`RELEASE EVIDENCE ERROR [${code}]`);
    process.exitCode = 1;
  }
}
