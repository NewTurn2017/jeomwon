import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	blockedProcess,
	cleanupFixtures,
	fixture,
	output,
	run,
	state,
} from "./inject-test-helpers";

afterEach(cleanupFixtures);

describe("target lock and interruption contract", () => {
	test("rejects a concurrent same-target operation before it reads managed state", async () => {
		const item = fixture();
		const first = await blockedProcess(item);
		const targetPack = join(item.target, "domain-pack.json");
		writeFileSync(targetPack, "malformed target state");
		const second = run(item, {}, targetPack);
		expect(second.exitCode).not.toBe(0);
		expect(output(second)).toContain("inject_target_locked");
		expect(output(second)).not.toContain("pack_invalid");
		first.resume();
		expect(await first.child.exited).not.toBe(0);
	});

	test("different targets remain independent while one target is locked", async () => {
		const firstItem = fixture();
		const secondItem = fixture();
		const first = await blockedProcess(firstItem);
		const second = run(secondItem);
		expect(second.exitCode).toBe(0);
		first.resume();
		expect(await first.child.exited).toBe(0);
	});

	test("handles live, dead, and invalid lock metadata deterministically", () => {
		const live = fixture();
		mkdirSync(join(live.target, ".jeomwon-inject.lock"));
		writeFileSync(
			join(live.target, ".jeomwon-inject.lock/owner.json"),
			JSON.stringify({ pid: process.pid }),
		);
		expect(output(run(live))).toContain("inject_target_locked");

		const dead = fixture();
		mkdirSync(join(dead.target, ".jeomwon-inject.lock"));
		writeFileSync(
			join(dead.target, ".jeomwon-inject.lock/owner.json"),
			JSON.stringify({ pid: 2_147_483_647 }),
		);
		expect(run(dead).exitCode).toBe(0);

		const invalid = fixture();
		mkdirSync(join(invalid.target, ".jeomwon-inject.lock"));
		writeFileSync(
			join(invalid.target, ".jeomwon-inject.lock/owner.json"),
			"not json",
		);
		expect(output(run(invalid))).toContain("inject_lock_invalid");
	});

	for (const [signal, expected] of [
		["SIGINT", 130],
		["SIGTERM", 143],
	] as const) {
		test(`${signal} rolls back and exits with the conventional status`, async () => {
			const item = fixture();
			const before = state(item);
			const blocked = await blockedProcess(item);
			blocked.child.kill(signal);
			blocked.resume();
			expect(await blocked.child.exited).toBe(expected);
			expect(state(item)).toEqual(before);
			expect(existsSync(join(item.target, ".jeomwon-inject.lock"))).toBe(false);
		});
	}

	test("an incomplete rollback never later overwrites a successful same-target publication", async () => {
		const item = fixture();
		const failing = await blockedProcess(item, "publish:2,rollback:1");
		failing.resume();
		expect(await failing.child.exited).not.toBe(0);
		rmSync(join(item.target, ".jeomwon-inject-recovery"), { recursive: true });
		rmSync(join(item.target, ".jeomwon-inject-stage"), { recursive: true });
		const refused = run(item);
		expect(refused.exitCode).not.toBe(0);
		expect(output(refused)).toContain("inject_managed_state_mismatch");
		const retained = readFileSync(item.config);
		await Promise.resolve();
		expect(readFileSync(item.config)).toEqual(retained);
	});
});
