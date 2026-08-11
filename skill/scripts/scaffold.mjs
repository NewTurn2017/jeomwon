#!/usr/bin/env bun
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCli, fail, parseCommonArgs, signalExitCode } from "./cli.mjs";
import { slugify } from "./scaffold-files.mjs";
import { ScaffoldError } from "./scaffold-state.mjs";
import { initializeProject } from "./scaffold-transaction.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(SKILL_ROOT, "..");
const parsed = parseCommonArgs(process.argv.slice(2));
if (parsed.error) fail(parsed.error, parsed.detail);
const cli = createCli("scaffold", parsed.language);
const usage =
	"bun scaffold.mjs <target-dir> <project-name> <domain-pack.json> [--lang ko|en|auto]";
if (parsed.help) {
	cli.help(usage);
	process.exit(0);
}
const [targetArg, ...middle] = parsed.positional;
if (!targetArg || middle.length < 2)
	fail("initial_pack_required", `${usage}; recovery: add <domain-pack.json>`);
const packArg = middle.at(-1);
const projectName = middle.slice(0, -1).join(" ").trim();
if (!projectName || !packArg) fail("usage", usage);
const projectSlug = slugify(projectName);
if (!projectSlug) fail("project_name_invalid", projectName);
const target = resolve(targetArg);
const packPath = resolve(packArg);
let interruptedSignal;
const interrupt = (signal) => {
	interruptedSignal ||= signal;
};
const onInterrupt = () => interrupt("SIGINT");
const onTerminate = () => interrupt("SIGTERM");
const checkInterrupt = () => {
	if (interruptedSignal)
		throw new ScaffoldError(
			"interrupted",
			interruptedSignal,
			signalExitCode(interruptedSignal),
		);
};
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);
let operationError;
try {
	await initializeProject({
		target,
		projectName,
		projectSlug,
		packPath,
		skillRoot: SKILL_ROOT,
		repoRoot: REPO_ROOT,
		checkInterrupt,
	});
} catch (error) {
	operationError = error;
} finally {
	process.off("SIGINT", onInterrupt);
	process.off("SIGTERM", onTerminate);
}
if (operationError || interruptedSignal) {
	const error =
		operationError ??
		new ScaffoldError(
			"interrupted",
			interruptedSignal,
			signalExitCode(interruptedSignal),
		);
	fail(
		error?.code ?? "scaffold_failed",
		error instanceof Error ? error.message : String(error),
		error?.exitCode ?? 1,
	);
}
console.log(`[PASS scaffold_created] ${projectName}`);
console.log(`Target: ${target}`);
console.log(`NPM scope: @${projectSlug}/`);
if (process.env.JEOMWON_BOOTSTRAP !== "1") {
	cli.next([
		`cd ${JSON.stringify(relative(process.cwd(), target) || ".")}`,
		"bun setup",
		'git init && git add . && git commit -m "Initial jeomwon scaffold"',
	]);
}
