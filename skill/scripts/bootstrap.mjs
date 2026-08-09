#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCli, fail, parseCommonArgs, signalExitCode } from "./cli.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const parsed = parseCommonArgs(process.argv.slice(2));
if (parsed.error) fail(parsed.error, parsed.detail);
const cli = createCli("bootstrap", parsed.language);
const usage =
	"bun bootstrap.mjs <target-dir> <project-name> <domain-pack.json> [--lang ko|en|auto]";
if (parsed.help) {
	cli.help(usage);
	process.exit(0);
}
if (parsed.positional.length < 3) fail("usage", usage);

const targetDir = resolve(process.cwd(), parsed.positional[0]);
const packPath = resolve(process.cwd(), parsed.positional.at(-1));
const nameParts = parsed.positional.slice(1, -1);
const childLanguage = parsed.language;
const baseEnv = {
	...process.env,
	JEOMWON_BOOTSTRAP: "1",
	JEOMWON_CLI_LANG: childLanguage,
};
const verifyEnv = { ...baseEnv };
delete verifyEnv.JEOMWON_QA_BASE_URL;

const stages = [
	{
		code: "stage_scaffold",
		name: "scaffold",
		script: join(SCRIPT_DIR, "scaffold.mjs"),
		args: [targetDir, ...nameParts, "--lang", childLanguage],
		env: baseEnv,
	},
	{
		code: "stage_inject",
		name: "inject",
		script: join(SCRIPT_DIR, "inject.mjs"),
		args: [targetDir, packPath, "--lang", childLanguage],
		env: baseEnv,
	},
	{
		code: "stage_verify",
		name: "verify",
		script: join(SCRIPT_DIR, "verify.mjs"),
		args: [targetDir, "--lang", childLanguage],
		env: verifyEnv,
	},
];

for (const stage of stages) {
	cli.stage("RUN", stage.code, stage.name);
	const result = await runStage(stage);
	if (result.ok) {
		cli.stage("PASS", stage.code, stage.name);
		continue;
	}
	const recovery = ["bun", stage.script, ...stage.args];
	console.error("");
	cli.recovery(recovery);
	if (result.signal)
		fail(
			"child_signal",
			`${stage.name}: ${result.signal}`,
			signalExitCode(result.signal),
		);
	if (result.error) fail("child_spawn", `${stage.name}: ${result.error}`);
	fail("child_exit", `${stage.name}: ${result.code}`, result.code);
}

cli.next([
	`cd ${JSON.stringify(targetDir)}`,
	"bun x convex login",
	"bun setup",
	"bun run qa",
]);

function runStage(stage) {
	return new Promise((settle) => {
		let settled = false;
		const child = spawn(process.execPath, [stage.script, ...stage.args], {
			stdio: "inherit",
			env: stage.env,
		});
		const finish = (result) => {
			if (settled) return;
			settled = true;
			process.off("SIGINT", forwardInterrupt);
			process.off("SIGTERM", forwardTerminate);
			settle(result);
		};
		const forwardInterrupt = () => child.kill("SIGINT");
		const forwardTerminate = () => child.kill("SIGTERM");
		process.once("SIGINT", forwardInterrupt);
		process.once("SIGTERM", forwardTerminate);
		child.once("error", (error) =>
			finish({ ok: false, error: error.message, code: 1 }),
		);
		child.once("close", (code, signal) => {
			if (signal)
				return finish({ ok: false, signal, code: signalExitCode(signal) });
			finish(
				code === 0 ? { ok: true, code: 0 } : { ok: false, code: code ?? 1 },
			);
		});
	});
}
