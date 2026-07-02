#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function fail(message) {
	console.error(`ERROR: ${message}`);
	process.exit(1);
}

const args = process.argv.slice(2);
const forceQa = args.includes("--qa");
const targetArg = args.find((arg) => !arg.startsWith("--"));

if (!targetArg) {
	fail("usage: bun skill/scripts/verify.mjs <target-dir> [--qa]");
}

const targetDir = resolve(process.cwd(), targetArg);
if (!existsSync(targetDir)) {
	fail(`missing target directory: ${targetDir}`);
}

const verifyEnv = {
	NEXT_TELEMETRY_DISABLED: "1",
	NEXT_PUBLIC_CONVEX_URL: "https://jeomwon-example.convex.cloud",
	NEXT_PUBLIC_APP_URL: "http://localhost:3000",
	SITE_URL: "http://localhost:3001",
	AGENT_RUNTIME: "mock",
	AUTH_DEV_ANONYMOUS: "1",
	...process.env,
	TMPDIR: "/private/tmp",
};

const steps = [
	{
		name: "install",
		command: "bun",
		args: ["install", "--frozen-lockfile", "--offline"],
	},
	{ name: "typecheck", command: "bun", args: ["run", "typecheck"] },
	{ name: "lint", command: "bun", args: ["run", "lint"] },
];

for (const step of steps) {
	await runStep(step, targetDir);
}

await runBuildSteps(targetDir);

if (forceQa || process.env.JEOMWON_QA_BASE_URL) {
	await runStep({ name: "qa", command: "bun", args: ["run", "qa"] }, targetDir);
} else {
	console.log(
		"SKIP qa: set JEOMWON_QA_BASE_URL=http://localhost:3001 after Convex/web are running, or pass --qa.",
	);
}

console.log("VERIFY PASS");

async function runBuildSteps(root) {
	const buildSteps = [
		{
			name: "build:email",
			cwd: join(root, "packages/email"),
			command: "bun",
			args: ["run", "build"],
		},
		{
			name: "build:app",
			cwd: join(root, "apps/app"),
			command: "bun",
			args: ["run", "build", "--", "--webpack"],
		},
		{
			name: "build:web",
			cwd: join(root, "apps/web"),
			command: "bun",
			args: ["run", "build", "--", "--webpack"],
		},
	];

	for (const step of buildSteps) {
		if (!existsSync(join(step.cwd, "package.json"))) {
			console.log(`SKIP ${step.name}: missing ${step.cwd}`);
			continue;
		}
		await runStep(step, step.cwd);
	}
}

async function runStep(step, cwd) {
	console.log(`RUN ${step.name}: ${step.command} ${step.args.join(" ")}`);
	const code = await spawnProcess(step.command, step.args, cwd);
	if (code !== 0) {
		fail(`${step.name} failed with exit code ${code}`);
	}
}

function spawnProcess(command, args, cwd) {
	return new Promise((resolveCode, reject) => {
		const child = spawn(command, args, {
			cwd,
			env: verifyEnv,
			stdio: "inherit",
		});

		child.on("error", reject);
		child.on("close", (code) => resolveCode(code ?? 1));
	});
}
