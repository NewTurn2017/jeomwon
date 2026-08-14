import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const preflight = join(repoRoot, "skill/scripts/preflight.mjs");
const bootstrap = join(repoRoot, "skill/scripts/bootstrap.mjs");
const roots: string[] = [];
let pack = "";

function temporaryRoot(): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "jeomwon ancestry ")));
	roots.push(root);
	return root;
}

function run(entry: string, target: string) {
	return Bun.spawnSync([process.execPath, entry, target, "Ancestry", pack], {
		cwd: repoRoot,
		env: {
			...process.env,
			BUN_INSTALL_CACHE_DIR: join(dirname(target), ".cold-cache"),
			NO_COLOR: "1",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
}

function text(result: ReturnType<typeof run>): string {
	return `${result.stdout.toString()}${result.stderr.toString()}`;
}

function expectRejected(target: string, code = "target_unsafe") {
	const before = existsSync(target) ? readFileIfRegular(target) : null;
	const result = run(preflight, target);
	const output = text(result);
	expect(result.exitCode).toBe(1);
	expect(output).toContain(`ERROR [${code}]`);
	expect(output).not.toContain("PREFLIGHT PASS");
	expect(output.match(/\[RECOVERY recovery\]/g)).toHaveLength(1);
	if (before !== null) expect(readFileIfRegular(target)).toEqual(before);
	return output;
}

function readFileIfRegular(path: string): Buffer | "non-file" {
	try {
		return readFileSync(path);
	} catch {
		return "non-file";
	}
}

beforeEach(() => {
	const root = temporaryRoot();
	const example = readFileSync(
		join(repoRoot, "skill/EXAMPLES.md"),
		"utf8",
	).match(/```json\n([\s\S]*?)\n```/)?.[1];
	if (example === undefined) throw new Error("missing domain pack example");
	pack = join(root, "domain-pack.json");
	writeFileSync(pack, example);
});

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe("target ancestry safety", () => {
	test("cold bootstrap preserves the exact warm-cache recovery before stages", () => {
		const root = temporaryRoot();
		const target = join(root, "target");
		const cache = join(root, ".cold-cache");
		const result = run(bootstrap, target);
		const output = text(result);
		const lines = output.split("\n");
		const start = lines.indexOf("[");
		const end = lines.findIndex((line, index) => index > start && line === "]");

		expect(result.exitCode).toBe(1);
		expect(output).toContain("ERROR [cache_not_ready]");
		expect(output.match(/\[RECOVERY recovery\]/g)).toHaveLength(1);
		expect(JSON.parse(lines.slice(start, end + 1).join("\n"))).toEqual([
			"env",
			`BUN_INSTALL_CACHE_DIR=${cache}`,
			"bun",
			join(repoRoot, "skill/scripts/warm-cache.mjs"),
			"--lang",
			"en",
		]);
		expect(output).not.toContain("[RUN stage_");
		expect(existsSync(target)).toBe(false);
	});

	test("rejects symlink ancestors and nested missing descendants", () => {
		const root = temporaryRoot();
		const destination = join(root, "destination");
		mkdirSync(destination);
		const link = join(root, "redirect");
		symlinkSync(destination, link);

		expectRejected(join(link, "target"));
		expectRejected(join(link, "missing", "nested", "target"));
		expect(existsSync(join(destination, "target"))).toBe(false);
		expect(existsSync(join(destination, "missing"))).toBe(false);
	});

	test("rejects file ancestors and nested missing descendants", () => {
		const root = temporaryRoot();
		const file = join(root, "parent-file");
		writeFileSync(file, "preserve-parent");

		expectRejected(join(file, "target"));
		expectRejected(join(file, "missing", "nested", "target"));
		expect(readFileSync(file, "utf8")).toBe("preserve-parent");
	});

	test("rejects target symlink, target file, and dirty target", () => {
		const root = temporaryRoot();
		const destination = join(root, "destination");
		const file = join(root, "file");
		const dirty = join(root, "dirty");
		mkdirSync(destination);
		mkdirSync(dirty);
		writeFileSync(file, "preserve-file");
		writeFileSync(join(dirty, "keep"), "preserve-dirty");
		const link = join(root, "link");
		symlinkSync(destination, link);

		expectRejected(link);
		expectRejected(file);
		expectRejected(dirty, "target_not_empty");
		expect(readFileSync(file, "utf8")).toBe("preserve-file");
		expect(readFileSync(join(dirty, "keep"), "utf8")).toBe("preserve-dirty");
	});

	test("accepts only safe real-directory ancestry", () => {
		const root = temporaryRoot();
		const parent = join(root, "real", "directory");
		mkdirSync(parent, { recursive: true });
		for (const target of [join(parent, "absent"), join(parent, "empty")]) {
			if (target.endsWith("empty")) mkdirSync(target);
			const result = run(preflight, target);
			const output = text(result);
			expect(result.exitCode).toBe(1);
			expect(output).toContain("[PASS preflight_target]");
			expect(output).toContain("ERROR [cache_not_ready]");
		}
	});

	test("bootstrap rejects hostile ancestry before every stage and mutation", () => {
		const root = temporaryRoot();
		const destination = join(root, "destination");
		const file = join(root, "parent-file");
		mkdirSync(destination);
		writeFileSync(file, "preserve");
		const link = join(root, "redirect");
		symlinkSync(destination, link);

		for (const target of [
			join(link, "nested", "target"),
			join(file, "nested", "target"),
		]) {
			const result = run(bootstrap, target);
			const output = text(result);
			expect(result.exitCode).toBe(1);
			expect(output).toContain("ERROR [target_unsafe]");
			expect(output.match(/\[RECOVERY recovery\]/g)).toHaveLength(1);
			expect(output).not.toContain("[RUN stage_");
			expect(existsSync(target)).toBe(false);
		}
	});
});
