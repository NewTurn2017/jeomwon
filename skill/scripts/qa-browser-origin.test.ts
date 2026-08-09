import { describe, expect, test } from "bun:test";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(
	`${import.meta.dir}/qa-browser-origin.mjs`,
).href;

async function subject() {
	return import(`${moduleUrl}?test=${crypto.randomUUID()}`);
}

function dependencies(overrides: Record<string, unknown> = {}) {
	return {
		env: {},
		inspectContainer: async () => ({ running: false, gateways: [] }),
		probeNative: async () => true,
		probeContainer: async () => true,
		...overrides,
	};
}

describe("QA browser origin precedence and runtime probes", () => {
	test("auto prefers explicit custom origin and preserves explicit port independence", async () => {
		const { resolveBrowserOrigin } = await subject();
		const seen: string[] = [];
		const result = await resolveBrowserOrigin(
			{ runtime: "auto", port: 4998, probePath: "/health?q=1" },
			dependencies({
				env: { JEOMWON_QA_BROWSER_ORIGIN: "https://qa.example.test/" },
				probeNative: async (url: string) => {
					seen.push(url);
					return true;
				},
			}),
		);
		expect(result).toEqual({
			origin: "https://qa.example.test",
			runtime: "custom",
		});
		expect(seen).toEqual(["https://qa.example.test/health?q=1"]);
	});

	test("auto uses a running configured container before native", async () => {
		const { resolveBrowserOrigin } = await subject();
		const calls: Array<[string, string]> = [];
		const result = await resolveBrowserOrigin(
			{ runtime: "auto", port: 3998, probePath: "/qa" },
			dependencies({
				env: { JEOMWON_QA_BROWSER_CONTAINER: "qa-browser" },
				inspectContainer: async (name: string) => {
					expect(name).toBe("qa-browser");
					return { running: true, gateways: ["172.18.0.1"] };
				},
				probeContainer: async (name: string, url: string) => {
					calls.push([name, url]);
					return true;
				},
			}),
		);
		expect(result).toEqual({
			origin: "http://host.docker.internal:3998",
			runtime: "docker",
		});
		expect(calls).toEqual([
			["qa-browser", "http://host.docker.internal:3998/qa"],
		]);
	});

	test("Docker Desktop alias failure falls back to the inspected Linux gateway", async () => {
		const { resolveBrowserOrigin } = await subject();
		const urls: string[] = [];
		const result = await resolveBrowserOrigin(
			{ runtime: "docker", port: 4010, probePath: "/ready" },
			dependencies({
				inspectContainer: async () => ({
					running: true,
					gateways: ["172.19.0.1", "172.19.0.1"],
				}),
				probeContainer: async (_name: string, url: string) => {
					urls.push(url);
					return url.includes("172.19.0.1");
				},
			}),
		);
		expect(result.origin).toBe("http://172.19.0.1:4010");
		expect(urls).toEqual([
			"http://host.docker.internal:4010/ready",
			"http://172.19.0.1:4010/ready",
		]);
	});

	test("explicit native ignores custom configuration and probes loopback natively", async () => {
		const { resolveBrowserOrigin } = await subject();
		const seen: string[] = [];
		const result = await resolveBrowserOrigin(
			{ runtime: "native", port: 4173, probePath: "/" },
			dependencies({
				env: { JEOMWON_QA_BROWSER_ORIGIN: "not-an-origin" },
				probeNative: async (url: string) => {
					seen.push(url);
					return true;
				},
			}),
		);
		expect(result).toEqual({
			origin: "http://127.0.0.1:4173",
			runtime: "native",
		});
		expect(seen).toEqual(["http://127.0.0.1:4173/"]);
	});

	test("auto falls back to native when the configured container is not running", async () => {
		const { resolveBrowserOrigin } = await subject();
		const result = await resolveBrowserOrigin(
			{ runtime: "auto", port: 3998, probePath: "/ready" },
			dependencies(),
		);
		expect(result).toEqual({
			origin: "http://127.0.0.1:3998",
			runtime: "native",
		});
	});

	test("custom origin is probed inside the actual running browser container", async () => {
		const { resolveBrowserOrigin } = await subject();
		let nativeCalls = 0;
		const containerCalls: string[] = [];
		await resolveBrowserOrigin(
			{ runtime: "auto", port: 3998, probePath: "/probe" },
			dependencies({
				env: { JEOMWON_QA_BROWSER_ORIGIN: "https://qa.example.test" },
				inspectContainer: async () => ({ running: true, gateways: [] }),
				probeNative: async () => {
					nativeCalls++;
					return true;
				},
				probeContainer: async (_name: string, url: string) => {
					containerCalls.push(url);
					return true;
				},
			}),
		);
		expect(nativeCalls).toBe(0);
		expect(containerCalls).toEqual(["https://qa.example.test/probe"]);
	});
});

describe("stable QA origin failures", () => {
	test("invalid custom origins use qa_origin_invalid", async () => {
		const { resolveBrowserOrigin } = await subject();
		for (const origin of [
			"qa.example.test",
			"ftp://qa.example.test",
			"https://qa.example.test/path",
		]) {
			await expect(
				resolveBrowserOrigin(
					{ runtime: "auto", port: 3998, probePath: "/" },
					dependencies({ env: { JEOMWON_QA_BROWSER_ORIGIN: origin } }),
				),
			).rejects.toMatchObject({ code: "qa_origin_invalid" });
		}
	});

	test("container-loopback custom origins use qa_origin_loopback", async () => {
		const { resolveBrowserOrigin } = await subject();
		for (const origin of [
			"http://localhost:3998",
			"http://127.0.0.1:3998",
			"http://[::1]:3998",
			"http://0.0.0.0:3998",
		]) {
			await expect(
				resolveBrowserOrigin(
					{ runtime: "auto", port: 3998, probePath: "/" },
					dependencies({
						env: { JEOMWON_QA_BROWSER_ORIGIN: origin },
						inspectContainer: async () => ({ running: true, gateways: [] }),
					}),
				),
			).rejects.toMatchObject({ code: "qa_origin_loopback" });
		}
	});

	test("missing Docker runtime or address uses qa_origin_unresolved", async () => {
		const { resolveBrowserOrigin } = await subject();
		await expect(
			resolveBrowserOrigin(
				{ runtime: "docker", port: 3998, probePath: "/" },
				dependencies(),
			),
		).rejects.toMatchObject({ code: "qa_origin_unresolved" });
	});

	test("failed probes use qa_origin_unreachable after all Docker candidates", async () => {
		const { resolveBrowserOrigin } = await subject();
		const seen: string[] = [];
		await expect(
			resolveBrowserOrigin(
				{ runtime: "docker", port: 3998, probePath: "/qa" },
				dependencies({
					inspectContainer: async () => ({
						running: true,
						gateways: ["172.20.0.1"],
					}),
					probeContainer: async (_name: string, url: string) => {
						seen.push(url);
						return false;
					},
				}),
			),
		).rejects.toMatchObject({ code: "qa_origin_unreachable" });
		expect(seen).toHaveLength(2);
	});

	test("native unreachable service uses qa_origin_unreachable", async () => {
		const { resolveBrowserOrigin } = await subject();
		await expect(
			resolveBrowserOrigin(
				{ runtime: "native", port: 3998, probePath: "/" },
				dependencies({ probeNative: async () => false }),
			),
		).rejects.toMatchObject({ code: "qa_origin_unreachable" });
	});
});
