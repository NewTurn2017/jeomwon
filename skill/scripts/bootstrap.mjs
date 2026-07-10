#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function fail(message) {
	console.error(`ERROR: ${message}`);
	process.exit(1);
}

function usage() {
	fail(
		"usage: bun skill/scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>",
	);
}

// <target-dir> <project-name...> <domain-pack.json>: first arg is the target,
// last arg is the pack, everything between is the scaffold project-name (which
// may be one quoted argument or several bare words). Require at least one
// name part, so at least three arguments total.
const rawArgs = process.argv.slice(2);
if (rawArgs.length < 3) {
	usage();
}

const targetDir = resolve(process.cwd(), rawArgs[0]);
const packPath = resolve(process.cwd(), rawArgs[rawArgs.length - 1]);
const nameParts = rawArgs.slice(1, -1);

const scaffoldScript = join(SCRIPT_DIR, "scaffold.mjs");
const injectScript = join(SCRIPT_DIR, "inject.mjs");
const verifyScript = join(SCRIPT_DIR, "verify.mjs");

// Bootstrap is offline-only. verify.mjs runs live QA when JEOMWON_QA_BASE_URL
// is set in its environment, so strip that one key from the verify child even
// when the caller shell carries live-QA state. scaffold/inject inherit the
// caller environment unchanged.
const verifyEnv = { ...process.env };
delete verifyEnv.JEOMWON_QA_BASE_URL;

const stages = [
	{
		name: "scaffold",
		script: scaffoldScript,
		args: [targetDir, ...nameParts],
		env: process.env,
	},
	{
		name: "inject",
		script: injectScript,
		args: [targetDir, packPath],
		env: process.env,
	},
	{ name: "verify", script: verifyScript, args: [targetDir], env: verifyEnv },
];

for (const stage of stages) {
	const result = await runStage(stage);
	if (result.ok) {
		continue;
	}
	reportFailure(stage, result);
	process.exit(result.exitCode);
}

printSuccess();

function runStage(stage) {
	return new Promise((settle) => {
		const child = spawn(process.execPath, [stage.script, ...stage.args], {
			stdio: "inherit",
			env: stage.env,
		});
		child.on("error", (error) => {
			settle({ ok: false, reason: `spawn error: ${error.message}`, exitCode: 1 });
		});
		child.on("close", (code, signal) => {
			if (signal) {
				settle({
					ok: false,
					reason: `terminated by signal ${signal}`,
					exitCode: 1,
				});
				return;
			}
			if (code === 0) {
				settle({ ok: true });
				return;
			}
			settle({ ok: false, reason: `exit code ${code}`, exitCode: code });
		});
	});
}

function reportFailure(stage, result) {
	console.error("");
	console.error(`bootstrap failed at ${stage.name} (${result.reason}).`);
	console.error(`Recovery: ${recoveryCommand(stage)}`);
	if (stage.name === "scaffold") {
		console.error(
			`Note: scaffold refuses a non-empty target and never deletes one. If ${targetDir} was partially created, inspect it and remove it manually only when you are sure it is safe, then rerun the command above.`,
		);
	}
}

// Recovery is deliberately decoupled from the resolved runtime executable
// (process.execPath). It always uses the public `bun` token so the printed
// command stays runnable even when the process that produced it could not
// launch its own executable.
function recoveryCommand(stage) {
	const parts = ["bun", stage.script, ...stage.args];
	return parts.map(shellQuote).join(" ");
}

function shellQuote(value) {
	if (value === "") {
		return "''";
	}
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
		return value;
	}
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function printSuccess() {
	console.log("");
	console.log(`Bootstrap complete: ${targetDir}`);
	console.log("Next steps (run these yourself; bootstrap does not run them):");
	console.log(`  cd ${targetDir}`);
	console.log("  bun setup");
	console.log("  bun run qa");
}
