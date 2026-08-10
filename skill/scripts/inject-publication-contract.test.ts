import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	cleanupFixtures,
	fixture,
	output,
	run,
	sha,
	state,
} from "./inject-test-helpers";

afterEach(cleanupFixtures);

function expectCompleteRollback(
	item: ReturnType<typeof fixture>,
	before: ReturnType<typeof state>,
	result: ReturnType<typeof run>,
) {
	const text = output(result);
	expect(result.exitCode).not.toBe(0);
	expect(text).toContain("ERROR [inject_publication_failed]");
	expect(text).not.toContain("Injected domain pack:");
	expect(state(item)).toEqual(before);
	expect(existsSync(join(item.target, ".jeomwon-inject-stage"))).toBe(false);
	expect(existsSync(join(item.target, ".jeomwon-inject-backup"))).toBe(false);
}

describe("transactional injector publication", () => {
	test("stages every output, restores bytes and modes, and never prints false success", () => {
		const item = fixture();
		const before = state(item);
		const result = run(item, { JEOMWON_INJECT_FAULT: "publish:2" });
		expect(result.exitCode).not.toBe(0);
		expect(output(result)).toContain("ERROR [inject_publication_failed]");
		expect(output(result)).not.toContain("Injected domain pack:");
		expect(state(item)).toEqual(before);
		expect(existsSync(join(item.target, ".jeomwon-inject-stage"))).toBe(false);
		expect(existsSync(join(item.target, ".jeomwon-inject-backup"))).toBe(false);
	});

	test("publishes a deterministic receipt last with the complete compatibility tuple and hashes", () => {
		const item = fixture();
		const first = run(item);
		expect(first.exitCode).toBe(0);
		const receiptPath = join(item.target, "jeomwon-project.json");
		const firstBytes = readFileSync(receiptPath);
		const receipt = JSON.parse(firstBytes.toString()) as {
			compatibility: Record<string, unknown>;
			managedOutputs: Record<string, { sha256: string }>;
		};
		expect(receipt.compatibility).toEqual({
			templateApi: 1,
			domainPackWriter: 0,
			domainPackSchema: 1,
			capabilitySchema: 1,
			capabilityManifestSha256: sha(
				join(item.target, "jeomwon-capabilities.json"),
			),
			setupSchema: 2,
			qaContract: 1,
		});
		for (const [path, value] of Object.entries(receipt.managedOutputs)) {
			expect(value.sha256).toBe(sha(join(item.target, path)));
		}
		expect(firstBytes.toString()).not.toMatch(/timestamp|createdAt|updatedAt/);
		const second = run(item);
		expect(second.exitCode).toBe(0);
		expect(readFileSync(receiptPath)).toEqual(firstBytes);

		const before = state(item);
		const receiptLastFailure = run(item, { JEOMWON_INJECT_FAULT: "publish:4" });
		expectCompleteRollback(item, before, receiptLastFailure);

		writeFileSync(
			join(item.target, "jeomwon-capabilities.json"),
			'{"schemaVersion":999}\n',
		);
		const mismatch = run(item);
		expect(mismatch.exitCode).not.toBe(0);
		expect(output(mismatch)).toContain("inject_compatibility_invalid");
		expect(state(item)).toEqual(before);
	});

	test("publishes the receipt last without an optional email sample", () => {
		const item = fixture({ email: false });
		expect(run(item).exitCode).toBe(0);
		const before = state(item);

		const receiptLastFailure = run(item, {
			JEOMWON_INJECT_FAULT: "publish:3",
		});

		expectCompleteRollback(item, before, receiptLastFailure);
	});

	test("rejects symlink and nonregular managed paths before publication", () => {
		const linked = fixture({ email: false });
		mkdirSync(dirname(linked.email), { recursive: true });
		symlinkSync(join(linked.root, "elsewhere"), linked.email);
		const symlinkResult = run(linked);
		expect(symlinkResult.exitCode).not.toBe(0);
		expect(output(symlinkResult)).toContain("inject_managed_path_invalid");

		const fifo = fixture({ email: false });
		mkdirSync(dirname(fifo.email), { recursive: true });
		const made = Bun.spawnSync({ cmd: ["mkfifo", fifo.email] });
		expect(made.exitCode).toBe(0);
		const fifoResult = run(fifo);
		expect(fifoResult.exitCode).not.toBe(0);
		expect(output(fifoResult)).toContain("inject_managed_path_invalid");
	});

	test("retains deterministic recovery and stage data when rollback is incomplete, preserving the primary error over release failure", () => {
		const item = fixture();
		const result = run(item, {
			JEOMWON_INJECT_FAULT: "publish:2,rollback:1,release",
		});
		const text = output(result);
		expect(result.exitCode).not.toBe(0);
		expect(text).toContain("ERROR [inject_recovery_required]");
		expect(text).toContain(join(item.target, ".jeomwon-inject-recovery"));
		expect(text).toContain("secondary lock cleanup error");
		expect(existsSync(join(item.target, ".jeomwon-inject-recovery"))).toBe(
			true,
		);
		expect(existsSync(join(item.target, ".jeomwon-inject-stage"))).toBe(true);
	});

	test("release-only and stage-cleanup failures fail without success output", () => {
		for (const fault of ["release", "cleanup"]) {
			const item = fixture();
			const result = run(item, { JEOMWON_INJECT_FAULT: fault });
			expect(result.exitCode).not.toBe(0);
			expect(output(result)).not.toContain("Injected domain pack:");
		}
	});
});
