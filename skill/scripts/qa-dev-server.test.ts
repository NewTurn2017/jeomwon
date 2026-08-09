import { describe, expect, test } from "bun:test";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(`${import.meta.dir}/qa-dev-server.mjs`).href;

async function subject() {
	return import(`${moduleUrl}?test=${crypto.randomUUID()}`);
}

describe("qa dev server contract", () => {
	test("app and site use portable bind defaults", async () => {
		const { parseDevServerArgs, createLaunchSpec } = await subject();
		const app = parseDevServerArgs(["app", "--root", "/work/app"]);
		const site = parseDevServerArgs(["site", "--root", "/work/site"]);
		expect(app).toMatchObject({ kind: "app", host: "0.0.0.0", port: 3998 });
		expect(site).toMatchObject({ kind: "site", host: "0.0.0.0", port: 4173 });
		expect(createLaunchSpec(app).argv.slice(-4)).toEqual([
			"--hostname",
			"0.0.0.0",
			"--port",
			"3998",
		]);
	});

	test("explicit host, port, QA reset, and Convex URL reach the child", async () => {
		const { parseDevServerArgs, createLaunchSpec } = await subject();
		const options = parseDevServerArgs([
			"app",
			"--root",
			"/work/app with spaces",
			"--host",
			"0.0.0.0",
			"--port",
			"4998",
			"--qa-reset",
			"--convex-url",
			"https://example.convex.cloud",
		]);
		const spec = createLaunchSpec(options, { PATH: "/bin" });
		expect(options.port).toBe(4998);
		expect(spec.cwd).toBe("/work/app with spaces");
		expect(spec.env).toMatchObject({
			PATH: "/bin",
			JEOMWON_QA_RESET: "1",
			JEOMWON_QA_BROWSER: "1",
			NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
			CONVEX_URL: "https://example.convex.cloud",
		});
	});

	test("occupied ports fail before spawning with qa_port_unavailable", async () => {
		const { launchQaDevServer } = await subject();
		let spawned = false;
		await expect(
			launchQaDevServer(["app", "--root", "/work/app"], {
				checkPort: async (host: string, port: number) => {
					expect([host, port]).toEqual(["0.0.0.0", 3998]);
					return false;
				},
				spawn() {
					spawned = true;
					throw new Error("must not spawn");
				},
			}),
		).rejects.toMatchObject({ code: "qa_port_unavailable" });
		expect(spawned).toBe(false);
	});

	test("readiness is emitted from the child output event without polling", async () => {
		const { launchQaDevServer } = await subject();
		const lines: string[] = [];
		const child = {
			stdout: new Blob(["▲ Next.js\n✓ Ready in 21ms\n"]).stream(),
			stderr: new Blob([]).stream(),
			exited: Promise.resolve(0),
		};
		const exit = await launchQaDevServer(
			["site", "--root", "/work/site", "--port", "5173"],
			{
				checkPort: async () => true,
				spawn: () => child,
				writeStdout: (line: string) => lines.push(line),
				writeStderr: () => {},
			},
		);
		expect(exit).toBe(0);
		const events = lines
			.filter((line) => line.startsWith("{"))
			.map((line) => JSON.parse(line));
		expect(events).toContainEqual({
			event: "qa_server_ready",
			host: "0.0.0.0",
			kind: "site",
			port: 5173,
		});
	});

	test("invalid ports are rejected deterministically", async () => {
		const { parseDevServerArgs } = await subject();
		for (const value of ["0", "65536", "3.2", "nope"]) {
			expect(() =>
				parseDevServerArgs(["app", "--root", "/work/app", "--port", value]),
			).toThrow();
		}
	});
});
