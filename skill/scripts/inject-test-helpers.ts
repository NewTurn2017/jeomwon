import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { establishFixture } from "./established-test-fixture";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const injectPath =
	process.env.JEOMWON_INJECT_PATH ?? join(repoRoot, "skill/scripts/inject.mjs");
const roots: string[] = [];

function readPack() {
	const examples = readFileSync(join(repoRoot, "skill/EXAMPLES.md"), "utf8");
	const source = examples.match(/```json\n([\s\S]*?)\n```/)?.[1];
	if (!source) throw new Error("missing example pack");
	return { schemaVersion: 1, ...JSON.parse(source) } as Record<string, unknown>;
}

export function fixture(options: { email?: boolean; receipt?: boolean } = {}) {
	const root = mkdtempSync(join(tmpdir(), "jeomwon-inject-publication-"));
	roots.push(root);
	const target = join(root, "target");
	const packPath = join(root, "input.json");
	const config = join(target, "packages/backend/domain.config.ts");
	const email = join(target, "packages/email/src/reservation-sample.ts");
	mkdirSync(dirname(config), { recursive: true });
	writeFileSync(config, "old config\n", { mode: 0o640 });
	if (options.email !== false) {
		mkdirSync(dirname(email), { recursive: true });
		writeFileSync(email, "old email\n", { mode: 0o600 });
	}
	const biome = join(target, "node_modules/.bin/biome");
	mkdirSync(dirname(biome), { recursive: true });
	writeFileSync(biome, "#!/bin/sh\nexit 0\n");
	chmodSync(biome, 0o755);
	establishFixture(target, [
		"packages/backend/domain.config.ts",
		...(options.email === false
			? []
			: ["packages/email/src/reservation-sample.ts"]),
	]);
	writeFileSync(packPath, JSON.stringify(readPack()));
	return { root, target, packPath, config, email };
}

export function run(
	item: ReturnType<typeof fixture>,
	env: Record<string, string> = {},
	packPath = item.packPath,
) {
	return Bun.spawnSync({
		cmd: ["bun", injectPath, item.target, packPath],
		cwd: repoRoot,
		env: { ...process.env, ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
}

export function output(result: ReturnType<typeof Bun.spawnSync>) {
	return `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`;
}

export function sha(path: string) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function state(item: ReturnType<typeof fixture>) {
	return [
		item.config,
		item.email,
		join(item.target, "domain-pack.json"),
		join(item.target, "jeomwon-project.json"),
	].map((path) =>
		existsSync(path)
			? { path, bytes: readFileSync(path), mode: statSync(path).mode & 0o777 }
			: { path, bytes: null, mode: null },
	);
}

export async function blockedProcess(
	item: ReturnType<typeof fixture>,
	fault?: string,
) {
	const barrierPath = join(item.root, "inject-barrier.fifo");
	const fifo = Bun.spawnSync({ cmd: ["mkfifo", barrierPath] });
	if (fifo.exitCode !== 0) throw new Error(fifo.stderr?.toString());
	const child = Bun.spawn({
		cmd: ["bun", injectPath, item.target, item.packPath],
		cwd: repoRoot,
		env: {
			...process.env,
			JEOMWON_INJECT_BARRIER_AFTER_LOCK: barrierPath,
			...(fault ? { JEOMWON_INJECT_FAULT: fault } : {}),
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const reader = child.stdout.getReader();
	const decoder = new TextDecoder();
	let seen = "";
	await Promise.race([
		(async () => {
			while (!seen.includes("[BARRIER inject_locked]")) {
				const chunk = await reader.read();
				if (chunk.done) throw new Error(`child exited before barrier: ${seen}`);
				seen += decoder.decode(chunk.value);
			}
		})(),
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error("barrier timeout")), 5_000),
		),
	]);
	reader.releaseLock();
	return {
		child,
		resume() {
			writeFileSync(barrierPath, "resume\n");
		},
	};
}

export function cleanupFixtures() {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
}
