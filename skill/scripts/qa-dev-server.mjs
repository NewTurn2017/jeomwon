#!/usr/bin/env bun

import { createServer } from "node:net";
import {
	optionValue,
	parsePort,
	QaRuntimeError,
	reportQaError,
} from "./qa-runtime.mjs";

const DEFAULT_PORTS = { app: 3998, site: 4173 };

export function parseDevServerArgs(argv) {
	if (argv.includes("--help") || argv.includes("-h")) return { help: true };
	const kind = argv[0];
	if (!(kind in DEFAULT_PORTS)) {
		throw new QaRuntimeError("qa_server_invalid", "expected app or site");
	}
	let root;
	let host = "0.0.0.0";
	let port;
	let qaReset = false;
	let convexUrl;
	for (let index = 1; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === "--root") root = optionValue(argv, index++, argument);
		else if (argument === "--host") host = optionValue(argv, index++, argument);
		else if (argument === "--port") port = optionValue(argv, index++, argument);
		else if (argument === "--convex-url")
			convexUrl = optionValue(argv, index++, argument);
		else if (argument === "--qa-reset") qaReset = true;
		else
			throw new QaRuntimeError(
				"qa_server_invalid",
				`unknown argument: ${argument}`,
			);
	}
	if (!root)
		throw new QaRuntimeError("qa_server_invalid", "--root is required");
	let parsedPort;
	try {
		parsedPort = parsePort(port, DEFAULT_PORTS[kind]);
	} catch (error) {
		throw new QaRuntimeError("qa_server_invalid", error.message);
	}
	if (!host) throw new QaRuntimeError("qa_server_invalid", "host is required");
	if (convexUrl) {
		let parsed;
		try {
			parsed = new URL(convexUrl);
		} catch {
			throw new QaRuntimeError("qa_server_invalid", "invalid Convex URL");
		}
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
			throw new QaRuntimeError("qa_server_invalid", "invalid Convex URL");
	}
	return { kind, root, host, port: parsedPort, qaReset, convexUrl };
}

export function createLaunchSpec(options, baseEnv = process.env) {
	const env = { ...baseEnv };
	if (options.qaReset) {
		env.JEOMWON_QA_RESET = "1";
		env.JEOMWON_QA_BROWSER = "1";
	}
	if (options.convexUrl) {
		env.NEXT_PUBLIC_CONVEX_URL = options.convexUrl;
		env.CONVEX_URL = options.convexUrl;
	}
	return {
		argv: [
			process.execPath,
			"x",
			"next",
			"dev",
			"--hostname",
			options.host,
			"--port",
			String(options.port),
		],
		cwd: options.root,
		env,
	};
}

export function checkPortAvailable(host, port) {
	return new Promise((resolve) => {
		const server = createServer();
		server.unref();
		server.once("error", () => resolve(false));
		server.listen({ host, port, exclusive: true }, () => {
			server.close(() => resolve(true));
		});
	});
}

async function copyOutput(stream, write, onLine) {
	if (!stream) return;
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let pending = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		const text = decoder.decode(value, { stream: true });
		write(text);
		pending += text;
		let newline = pending.indexOf("\n");
		while (newline !== -1) {
			onLine(pending.slice(0, newline));
			pending = pending.slice(newline + 1);
			newline = pending.indexOf("\n");
		}
	}
	pending += decoder.decode();
	if (pending) onLine(pending);
}

export async function launchQaDevServer(argv, dependencies = {}) {
	const options = parseDevServerArgs(argv);
	if (options.help) {
		(
			dependencies.writeStdout ??
			((value) => process.stdout.write(`${value}\n`))
		)(
			"Usage: bun qa-dev-server.mjs <app|site> --root <dir> [--host 0.0.0.0] [--port <port>] [--qa-reset] [--convex-url <url>]",
		);
		return 0;
	}
	const checkPort = dependencies.checkPort ?? checkPortAvailable;
	if (!(await checkPort(options.host, options.port))) {
		throw new QaRuntimeError(
			"qa_port_unavailable",
			`${options.host}:${options.port} is unavailable`,
		);
	}
	const spec = createLaunchSpec(options, dependencies.env ?? process.env);
	const spawn =
		dependencies.spawn ??
		((launch) =>
			Bun.spawn(launch.argv, {
				cwd: launch.cwd,
				env: launch.env,
				stdout: "pipe",
				stderr: "pipe",
			}));
	const child = spawn(spec);
	const writeStdout =
		dependencies.writeStdout ?? ((value) => process.stdout.write(value));
	const writeStderr =
		dependencies.writeStderr ?? ((value) => process.stderr.write(value));
	let ready = false;
	const readyLine = (line) => {
		if (ready || !/(?:^|\s)(?:ready|ready in)(?:\s|$)/i.test(line)) return;
		ready = true;
		writeStdout(
			`${JSON.stringify({
				event: "qa_server_ready",
				host: options.host,
				kind: options.kind,
				port: options.port,
			})}\n`,
		);
	};
	const forwardSignal = (signal) => {
		if (typeof child.kill === "function") child.kill(signal);
	};
	const onSigint = () => forwardSignal("SIGINT");
	const onSigterm = () => forwardSignal("SIGTERM");
	process.once("SIGINT", onSigint);
	process.once("SIGTERM", onSigterm);
	try {
		const stdoutTask = copyOutput(child.stdout, writeStdout, readyLine);
		const stderrTask = copyOutput(child.stderr, writeStderr, () => {});
		const exitCode = await child.exited;
		await Promise.all([stdoutTask, stderrTask]);
		return exitCode;
	} finally {
		process.off("SIGINT", onSigint);
		process.off("SIGTERM", onSigterm);
	}
}

if (import.meta.main) {
	try {
		process.exitCode = await launchQaDevServer(process.argv.slice(2));
	} catch (error) {
		process.exitCode = reportQaError(error);
	}
}
