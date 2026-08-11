import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { establishFixture } from "./established-test-fixture";

const repo = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const inject = join(repo, "skill/scripts/inject.mjs");
const scaffold = join(repo, "skill/scripts/scaffold.mjs");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function root() {
	const path = mkdtempSync(join(tmpdir(), "jeomwon-lifecycle-"));
	roots.push(path);
	return path;
}

function pack(path: string) {
	const source = readFileSync(join(repo, "skill/EXAMPLES.md"), "utf8").match(
		/```json\n([\s\S]*?)\n```/,
	)?.[1];
	if (!source) throw new Error("missing example pack");
	writeFileSync(path, source);
}

function fixture() {
	const base = root();
	const target = join(base, "target");
	const config = join(target, "packages/backend/domain.config.ts");
	const email = join(target, "packages/email/src/reservation-sample.ts");
	mkdirSync(dirname(config), { recursive: true });
	mkdirSync(dirname(email), { recursive: true });
	writeFileSync(config, "config\n");
	writeFileSync(email, "email\n");
	establishFixture(target, [
		"packages/backend/domain.config.ts",
		"packages/email/src/reservation-sample.ts",
	]);
	const input = join(base, "pack.json");
	pack(input);
	return { base, target, input };
}

function runInject(item: ReturnType<typeof fixture>) {
	return spawnSync("bun", [inject, item.target, item.input], {
		cwd: repo,
		encoding: "utf8",
	});
}

function tree(rootPath: string) {
	const entries: string[] = [];
	function visit(path: string, key: string) {
		const metadata = lstatSync(path);
		const mode = metadata.mode & 0o777;
		if (metadata.isDirectory()) {
			entries.push(`${key}:dir:${mode}`);
			for (const name of readdirSync(path).sort())
				visit(join(path, name), `${key}/${name}`);
		} else if (metadata.isFile()) {
			entries.push(
				`${key}:file:${mode}:${createHash("sha256").update(readFileSync(path)).digest("hex")}`,
			);
		} else entries.push(`${key}:other:${mode}`);
	}
	visit(rootPath, ".");
	return entries;
}

function replaceType(
	item: ReturnType<typeof fixture>,
	path: string,
	type: "directory" | "symlink" | "fifo" | "socket",
) {
	const retained = join(item.base, `retained-${path.replaceAll("/", "-")}`);
	renameSync(path, retained);
	if (type === "directory") mkdirSync(path);
	else if (type === "symlink") symlinkSync(retained, path);
	else if (type === "fifo") {
		const result = spawnSync("mkfifo", [path]);
		if (result.status !== 0) throw new Error(String(result.stderr));
	} else {
		const result = spawnSync(
			"python3",
			[
				"-c",
				"import socket,sys;s=socket.socket(socket.AF_UNIX);s.bind(sys.argv[1]);s.close()",
				relative(item.target, path),
			],
			{ cwd: item.target },
		);
		if (result.status !== 0) throw new Error(String(result.stderr));
	}
}

function expectRefusal(item: ReturnType<typeof fixture>, code: string) {
	const before = tree(item.target);
	const result = runInject(item);
	expect(result.status).not.toBe(0);
	expect(`${result.stdout}${result.stderr}`).toContain(`ERROR [${code}]`);
	expect(`${result.stdout}${result.stderr}`).not.toContain(
		"Injected domain pack:",
	);
	expect(tree(item.target)).toEqual(before);
	for (const name of [
		".jeomwon-inject-stage",
		".jeomwon-inject-backup",
		".jeomwon-inject-recovery",
		".jeomwon-inject.lock",
	])
		expect(existsSync(join(item.target, name))).toBe(false);
}

describe("established-only injection", () => {
	test("missing and schema-v1 receipts fail closed before staging", () => {
		const missing = fixture();
		rmSync(join(missing.target, "jeomwon-project.json"));
		expectRefusal(missing, "inject_receipt_missing");
		const legacy = fixture();
		writeFileSync(
			join(legacy.target, "jeomwon-project.json"),
			'{"schemaVersion":1}\n',
		);
		expectRefusal(legacy, "inject_receipt_unsupported");
	});

	test("strict receipt keys, values, mode, and regular-file type fail closed", () => {
		for (const mutation of [
			"extra",
			"identity",
			"mode",
			"directory",
			"symlink",
			"fifo",
			"socket",
		] as const) {
			const item = fixture();
			const receipt = join(item.target, "jeomwon-project.json");
			if (mutation === "mode") chmodSync(receipt, 0o600);
			else if (
				mutation === "directory" ||
				mutation === "symlink" ||
				mutation === "fifo" ||
				mutation === "socket"
			)
				replaceType(item, receipt, mutation);
			else {
				const value = JSON.parse(readFileSync(receipt, "utf8"));
				if (mutation === "extra") value.extra = true;
				else value.projectName = "Different Project";
				writeFileSync(receipt, `${JSON.stringify(value, null, 2)}\n`);
			}
			expectRefusal(
				item,
				mutation === "identity"
					? "inject_receipt_invalid"
					: "inject_receipt_invalid",
			);
		}
	});

	test("every managed missing, byte, mode, and type drift fails closed", () => {
		for (const path of [
			"domain-pack.json",
			"packages/backend/domain.config.ts",
			"packages/email/src/reservation-sample.ts",
		])
			for (const mutation of [
				"missing",
				"bytes",
				"mode",
				"directory",
				"symlink",
				"fifo",
				"socket",
			] as const) {
				const item = fixture();
				const full = join(item.target, path);
				if (mutation === "missing") rmSync(full);
				else if (mutation === "bytes")
					writeFileSync(full, `${readFileSync(full)}drift`);
				else if (mutation === "mode") chmodSync(full, 0o600);
				else replaceType(item, full, mutation);
				expectRefusal(item, "inject_managed_state_mismatch");
			}
	});

	test("receipt source and domain identity edits fail before writes", () => {
		for (const mutation of [
			"archiveSha256",
			"contentSha256",
			"domainSha256",
			"domainKey",
		] as const) {
			const item = fixture();
			const receiptPath = join(item.target, "jeomwon-project.json");
			const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
			if (mutation === "archiveSha256")
				receipt.templateSource.archiveSha256 = "a".repeat(64);
			else if (mutation === "contentSha256")
				receipt.templateSource.contentSha256 = "b".repeat(64);
			else if (mutation === "domainSha256")
				receipt.domainPack.sha256 = "c".repeat(64);
			else receipt.domainPack.domainKey = "attacker-edited";
			writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
			expectRefusal(
				item,
				mutation.startsWith("domain")
					? "inject_receipt_invalid"
					: "inject_receipt_mismatch",
			);
		}
	});

	test("canonical pack evidence is exact, ordered, typed, complete, and hashed", () => {
		for (const mutation of [
			"order",
			"value",
			"type",
			"missing",
			"extra",
			"hash",
		] as const) {
			const item = fixture();
			const receiptPath = join(item.target, "jeomwon-project.json");
			const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
			const canonical = receipt.domainPack.canonical;
			if (mutation === "order") {
				const { schemaVersion, domainKey, ...rest } = canonical;
				receipt.domainPack.canonical = { domainKey, schemaVersion, ...rest };
			} else if (mutation === "value") canonical.storeName += " drift";
			else if (mutation === "type") canonical.storeName = 42;
			else if (mutation === "missing") delete canonical.storeName;
			else if (mutation === "extra") canonical.extra = true;
			else receipt.domainPack.sha256 = "d".repeat(64);
			writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
			expectRefusal(item, "inject_receipt_invalid");
		}
	});

	test("self-consistent receipt pack rewrites and target manifest drift are rejected", () => {
		const packRewrite = fixture();
		const receiptPath = join(packRewrite.target, "jeomwon-project.json");
		const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
		receipt.domainPack.canonical.storeName += " rewritten";
		receipt.domainPack.sha256 = createHash("sha256")
			.update(JSON.stringify(receipt.domainPack.canonical))
			.digest("hex");
		writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
		expectRefusal(packRewrite, "inject_receipt_mismatch");

		const manifestDrift = fixture();
		const manifestPath = join(manifestDrift.target, "jeomwon-template.json");
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
		manifest.templateSource.archiveSha256 = "e".repeat(64);
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
		expectRefusal(manifestDrift, "inject_receipt_mismatch");
	});

	test("schema v2 is explicitly unsupported and mixed v2-v3 receipts are invalid", () => {
		for (const mutation of ["v2", "v3WithV2Domain"] as const) {
			const item = fixture();
			const receiptPath = join(item.target, "jeomwon-project.json");
			const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
			if (mutation === "v2") receipt.schemaVersion = 2;
			else
				receipt.domainPack = {
					domainKey: receipt.domainPack.canonical.domainKey,
					schemaVersion: 1,
					writerVersion: 0,
					sha256: receipt.managedOutputs["domain-pack.json"].sha256,
				};
			writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
			expectRefusal(
				item,
				mutation === "v2"
					? "inject_receipt_unsupported"
					: "inject_receipt_invalid",
			);
		}
	});

	test("same-pack and supported changed-pack reinjection remain public", () => {
		const same = fixture();
		expect(runInject(same).status).toBe(0);

		const changed = fixture();
		const nextPack = JSON.parse(readFileSync(changed.input, "utf8"));
		nextPack.storeName += " Updated";
		writeFileSync(changed.input, `${JSON.stringify(nextPack)}\n`);
		expect(runInject(changed).status).toBe(0);
		const receipt = JSON.parse(
			readFileSync(join(changed.target, "jeomwon-project.json"), "utf8"),
		);
		expect(receipt.domainPack.canonical.storeName).toBe(nextPack.storeName);
	});

	test("an established project remains portable after its directory is moved", () => {
		const item = fixture();
		const moved = join(item.base, "moved-project");
		renameSync(item.target, moved);
		const result = runInject({ ...item, target: moved });
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Injected domain pack:");
	});

	test("a receipt copied between different stable project identities is rejected", () => {
		const source = fixture();
		const destination = fixture();
		const value = JSON.parse(
			readFileSync(join(destination.target, "jeomwon-project.json"), "utf8"),
		);
		value.projectName = "Destination Project";
		value.projectSlug = "destination-project";
		value.projectIdentity = createHash("sha256")
			.update("Destination Project\0destination-project")
			.digest("hex");
		writeFileSync(
			join(destination.target, "package.json"),
			'{"name":"destination-project","packageManager":"bun@1.3.14"}\n',
		);
		writeFileSync(
			join(destination.target, "jeomwon-project.json"),
			readFileSync(join(source.target, "jeomwon-project.json")),
		);
		expectRefusal(destination, "inject_receipt_mismatch");
	});
});

describe("private initialization transaction", () => {
	test("public CLI and old scaffold usage cannot initialize a receipt-less target", () => {
		const item = fixture();
		rmSync(join(item.target, "jeomwon-project.json"));
		expectRefusal(item, "inject_receipt_missing");
		const result = spawnSync(
			"bun",
			[scaffold, join(item.base, "new"), "No Pack"],
			{ cwd: repo, encoding: "utf8" },
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("initial_pack_required");
	});

	test("scaffold, initial stage/publish, validation, and final publication faults leave no target or ordinary residue", () => {
		for (const fault of [
			"scaffold",
			"initial:render",
			"initial:stage:1",
			"initial:publish:1",
			"initial:publish:4",
			"validation",
			"publication",
		]) {
			const base = root();
			const target = join(base, "fresh");
			const input = join(base, "pack.json");
			pack(input);
			const result = spawnSync(
				"bun",
				[scaffold, target, "Fault Project", input],
				{
					cwd: repo,
					encoding: "utf8",
					env: { ...process.env, JEOMWON_BOOTSTRAP_FAULT: fault },
				},
			);
			expect(result.status).not.toBe(0);
			expect(result.stdout).not.toContain("scaffold_created");
			expect(existsSync(target)).toBe(false);
			expect(existsSync(join(base, ".fresh.jeomwon-bootstrap.lock"))).toBe(
				false,
			);
		}
	});

	test("no durable initialization metadata or public initial-mode switch exists", () => {
		const source = [
			"scaffold.mjs",
			"inject.mjs",
			"inject-publication.mjs",
			"inject-receipt.mjs",
		]
			.map((name) => readFileSync(join(repo, "skill/scripts", name), "utf8"))
			.join("\n");
		expect(source).not.toMatch(
			/initializationToken|initializationNonce|initialized\.json|receiptIdentitySha256/,
		);
		expect(readFileSync(inject, "utf8")).not.toMatch(
			/--initial|INITIAL_MODE|JEOMWON_INITIAL_MODE/,
		);
	});
});
