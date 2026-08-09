#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createCli, fail, parseCommonArgs, signalExitCode } from "./cli.mjs";

const parsed = parseCommonArgs(process.argv.slice(2), { allowQa: true });
if (parsed.error) fail(parsed.error, parsed.detail);
const cli = createCli("verify", parsed.language);
const usage = "bun verify.mjs <target-dir> [--qa] [--lang ko|en|auto]";
if (parsed.help) {
	cli.help(usage);
	process.exit(0);
}
const [targetArg, ...extra] = parsed.positional;
if (!targetArg || extra.length > 0) fail("usage", usage);
const targetDir = resolve(process.cwd(), targetArg);
if (!existsSync(targetDir)) fail("target_missing", targetDir);

const verifyEnv = {
	NEXT_TELEMETRY_DISABLED: "1",
	NEXT_PUBLIC_CONVEX_URL: "https://jeomwon-example.convex.cloud",
	NEXT_PUBLIC_APP_URL: "http://localhost:3000",
	SITE_URL: "http://localhost:3001",
	AGENT_RUNTIME: "mock",
	AUTH_ANONYMOUS_LOGIN: "1",
	...process.env,
	TMPDIR: tmpdir(),
	JEOMWON_CLI_LANG: parsed.language,
};

const steps = [
	{
		name: "install",
		command: "bun",
		args: ["install", "--frozen-lockfile", "--offline"],
	},
	{ name: "typecheck", command: "bun", args: ["run", "typecheck"] },
	{ name: "lint", command: "bun", args: ["run", "lint"] },
	{ name: "test", command: "bun", args: ["test"] },
];
for (const step of steps) await runStep(step, targetDir);
await runBuildSteps(targetDir);

if (parsed.qa || process.env.JEOMWON_QA_BASE_URL) {
	await runStep({ name: "qa", command: "bun", args: ["run", "qa"] }, targetDir);
} else {
	console.log(
		"[SKIP verify_qa] QA is opt-in; set JEOMWON_QA_BASE_URL=http://localhost:3000 after Convex and the authenticated app are running, or pass --qa.",
	);
}
console.log("VERIFY PASS");

async function runBuildSteps(root) {
	const buildSteps = [
		{
			name: "build_email",
			cwd: join(root, "packages/email"),
			command: "bun",
			args: ["run", "build"],
		},
		{
			name: "build_app",
			cwd: join(root, "apps/app"),
			command: "bun",
			args: ["run", "build", "--", "--webpack"],
		},
		{
			name: "build_web",
			cwd: join(root, "apps/web"),
			command: "bun",
			args: ["run", "build", "--", "--webpack"],
		},
	];
	for (const step of buildSteps) {
		if (!existsSync(join(step.cwd, "package.json"))) {
			console.log(`[SKIP verify_${step.name}] missing package`);
			continue;
		}
		await runStep(step, step.cwd);
	}
}

async function runStep(step, cwd) {
	const code = `verify_${step.name}`;
	cli.stage("RUN", code, `${step.command} ${step.args.join(" ")}`);
	const result = await spawnProcess(step.command, step.args, cwd);
	if (result.signal)
		fail(
			"child_signal",
			`${step.name}: ${result.signal}`,
			signalExitCode(result.signal),
		);
	if (result.error) fail("child_spawn", `${step.name}: ${result.error}`);
	if (result.code !== 0)
		fail("step_failed", `${step.name}: ${result.code}`, result.code);
	cli.stage("PASS", code, step.name);
}

function spawnProcess(command, args, cwd) {
	return new Promise((settle) => {
		const child = spawn(command, args, {
			cwd,
			env: verifyEnv,
			stdio: "inherit",
		});
		let done = false;
		const finish = (value) => {
			if (done) return;
			done = true;
			process.off("SIGINT", interrupt);
			process.off("SIGTERM", terminate);
			settle(value);
		};
		const interrupt = () => child.kill("SIGINT");
		const terminate = () => child.kill("SIGTERM");
		process.once("SIGINT", interrupt);
		process.once("SIGTERM", terminate);
		child.once("error", (error) => finish({ code: 1, error: error.message }));
		child.once("close", (code, signal) =>
			finish({ code: code ?? signalExitCode(signal), signal }),
		);
	});
}
