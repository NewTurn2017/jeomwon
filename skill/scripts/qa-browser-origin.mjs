#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import {
	optionValue,
	parsePort,
	QaRuntimeError,
	reportQaError,
} from "./qa-runtime.mjs";

const DEFAULT_CONTAINER = "browser-use-qa";
const RUNTIMES = new Set(["auto", "native", "docker", "custom"]);

export function parseBrowserOriginArgs(argv) {
	if (argv.includes("--help") || argv.includes("-h")) return { help: true };
	let runtime = "auto";
	let port;
	let probePath = "/";
	let format = "json";
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === "--runtime")
			runtime = optionValue(argv, index++, argument);
		else if (argument === "--port") port = optionValue(argv, index++, argument);
		else if (argument === "--probe-path")
			probePath = optionValue(argv, index++, argument);
		else if (argument === "--format")
			format = optionValue(argv, index++, argument);
		else
			throw new QaRuntimeError(
				"qa_origin_invalid",
				`unknown argument: ${argument}`,
			);
	}
	if (!RUNTIMES.has(runtime))
		throw new QaRuntimeError(
			"qa_origin_invalid",
			`invalid runtime: ${runtime}`,
		);
	if (!probePath.startsWith("/") || probePath.startsWith("//"))
		throw new QaRuntimeError(
			"qa_origin_invalid",
			"probe path must be root-relative",
		);
	if (format !== "json" && format !== "url")
		throw new QaRuntimeError("qa_origin_invalid", `invalid format: ${format}`);
	return { runtime, port: parsePort(port, 3998), probePath, format };
}

export function inspectDockerContainer(name) {
	const result = spawnSync("docker", ["inspect", name], { encoding: "utf8" });
	if (result.status !== 0) return { running: false, gateways: [] };
	try {
		const inspected = JSON.parse(result.stdout)[0];
		const networks = Object.values(inspected?.NetworkSettings?.Networks ?? {});
		return {
			running: inspected?.State?.Running === true,
			gateways: [
				...new Set(networks.map((network) => network?.Gateway).filter(Boolean)),
			],
		};
	} catch {
		return { running: false, gateways: [] };
	}
}

export async function probeFromNative(url) {
	try {
		const response = await fetch(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(5000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

export function probeFromContainer(container, url) {
	const source =
		"import sys,urllib.request\n" +
		"try:\n r=urllib.request.urlopen(sys.argv[1],timeout=5); sys.exit(0 if 200<=r.status<400 else 1)\n" +
		"except Exception: sys.exit(1)";
	const result = spawnSync(
		"docker",
		["exec", container, "python3", "-c", source, url],
		{ stdio: "ignore" },
	);
	return result.status === 0;
}

function parseCustomOrigin(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new QaRuntimeError(
			"qa_origin_invalid",
			"custom origin is not an absolute URL",
		);
	}
	if (
		(url.protocol !== "http:" && url.protocol !== "https:") ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new QaRuntimeError(
			"qa_origin_invalid",
			"custom origin must be an HTTP(S) origin",
		);
	}
	return url.origin;
}

function isLoopback(origin) {
	const hostname = new URL(origin).hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, "");
	return (
		hostname === "localhost" ||
		hostname === "::1" ||
		hostname === "0.0.0.0" ||
		/^127(?:\.|$)/.test(hostname)
	);
}

function probeUrl(origin, path) {
	return new URL(path, `${origin}/`).href;
}

export async function resolveBrowserOrigin(options, dependencies = {}) {
	const env = dependencies.env ?? process.env;
	const inspectContainer =
		dependencies.inspectContainer ?? inspectDockerContainer;
	const probeNative = dependencies.probeNative ?? probeFromNative;
	const probeContainer = dependencies.probeContainer ?? probeFromContainer;
	const container = env.JEOMWON_QA_BROWSER_CONTAINER || DEFAULT_CONTAINER;
	const customValue = env.JEOMWON_QA_BROWSER_ORIGIN;
	const acceptsCustom =
		options.runtime === "auto" || options.runtime === "custom";
	const custom =
		acceptsCustom && customValue ? parseCustomOrigin(customValue) : undefined;
	if (options.runtime === "custom" && !custom)
		throw new QaRuntimeError(
			"qa_origin_unresolved",
			"custom origin is not configured",
		);

	let inspection = { running: false, gateways: [] };
	if (options.runtime !== "native")
		inspection = await inspectContainer(container);

	if ((options.runtime === "auto" && custom) || options.runtime === "custom") {
		if (inspection.running && isLoopback(custom))
			throw new QaRuntimeError(
				"qa_origin_loopback",
				"container browsers cannot reach a loopback origin on the host",
			);
		const reachable = inspection.running
			? await probeContainer(container, probeUrl(custom, options.probePath))
			: await probeNative(probeUrl(custom, options.probePath));
		if (!reachable)
			throw new QaRuntimeError(
				"qa_origin_unreachable",
				`probe failed for ${custom}`,
			);
		return { origin: custom, runtime: "custom" };
	}

	const useDocker =
		options.runtime === "docker" ||
		(options.runtime === "auto" && inspection.running);
	if (useDocker) {
		if (!inspection.running)
			throw new QaRuntimeError(
				"qa_origin_unresolved",
				`container ${container} is not running`,
			);
		const candidates = [
			`http://host.docker.internal:${options.port}`,
			...[...new Set(inspection.gateways)].map(
				(gateway) => `http://${gateway}:${options.port}`,
			),
		];
		for (const origin of candidates) {
			if (await probeContainer(container, probeUrl(origin, options.probePath)))
				return { origin, runtime: "docker" };
		}
		if (candidates.length === 1 && inspection.gateways.length === 0)
			throw new QaRuntimeError(
				"qa_origin_unresolved",
				"no reachable Docker host alias or inspected gateway",
			);
		throw new QaRuntimeError(
			"qa_origin_unreachable",
			"Docker browser probe failed",
		);
	}

	const origin = `http://127.0.0.1:${options.port}`;
	if (!(await probeNative(probeUrl(origin, options.probePath))))
		throw new QaRuntimeError(
			"qa_origin_unreachable",
			`probe failed for ${origin}`,
		);
	return { origin, runtime: "native" };
}

export async function runBrowserOrigin(argv, dependencies = {}) {
	const options = parseBrowserOriginArgs(argv);
	if (options.help) {
		(
			dependencies.writeStdout ??
			((value) => process.stdout.write(`${value}\n`))
		)(
			"Usage: bun qa-browser-origin.mjs [--runtime auto|native|docker|custom] [--port <port>] [--probe-path </path>] [--format json|url]",
		);
		return 0;
	}
	const result = await resolveBrowserOrigin(options, dependencies);
	const output =
		options.format === "url" ? result.origin : JSON.stringify(result);
	(dependencies.writeStdout ?? ((value) => process.stdout.write(`${value}\n`)))(
		output,
	);
	return 0;
}

if (import.meta.main) {
	try {
		process.exitCode = await runBrowserOrigin(process.argv.slice(2));
	} catch (error) {
		process.exitCode = reportQaError(error);
	}
}
