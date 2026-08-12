import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	validateWorkshopChecksumManifest,
	validateWorkshopChecksumVariants,
} from "./workshop-checksums.mjs";

const names = ["a.txt", "b.json"];
const temporaryRoots: string[] = [];
type Variants = [string, string, string];

function fixture(): Variants {
	const root = mkdtempSync(join(tmpdir(), "workshop-checksums-"));
	temporaryRoots.push(root);
	const variants: Variants = [
		join(root, "root"),
		join(root, "instructor"),
		join(root, "student"),
	];
	for (const variant of variants) populate(variant);
	return variants;
}

function populate(variant: string) {
	const assets = join(variant, "assets/student");
	mkdirSync(assets, { recursive: true });
	for (const name of names) writeFileSync(join(assets, name), `${name}\n`);
	writeManifest(variant);
}

function writeManifest(variant: string) {
	const assets = join(variant, "assets/student");
	writeFileSync(
		join(assets, "SHA256SUMS"),
		`${names
			.map(
				(name) =>
					`${createHash("sha256")
						.update(readFileSync(join(assets, name)))
						.digest("hex")}  ${name}`,
			)
			.join("\n")}\n`,
	);
}

function manifest(variant: string) {
	return join(variant, "assets/student/SHA256SUMS");
}

function line(variant: string, index: number) {
	return readFileSync(manifest(variant), "utf8").trimEnd().split("\n")[index];
}

function twice(code: string, mutate: (variants: Variants) => void) {
	for (let attempt = 0; attempt < 2; attempt++) {
		const variants = fixture();
		mutate(variants);
		expect(() => validateWorkshopChecksumVariants(variants, names)).toThrow(
			code,
		);
	}
}

function outside(variant: string) {
	const path = join(variant, "../outside");
	populate(path);
	return path;
}

function replaceWithLink(path: string, target: string) {
	rmSync(path, { recursive: true });
	symlinkSync(target, path, "dir");
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0))
		rmSync(root, { recursive: true });
});

describe("strict workshop SHA256SUMS", () => {
	test("accepts exact regular artifacts bound to each variant root twice", () => {
		for (let attempt = 0; attempt < 2; attempt++) {
			expect(() =>
				validateWorkshopChecksumVariants(fixture(), names),
			).not.toThrow();
		}
	});

	test("rejects corrupt, missing, extra, duplicate, and malformed entries twice", () => {
		twice("checksum_digest_mismatch", ([root]) =>
			writeFileSync(
				manifest(root),
				`${"0".repeat(64)}  a.txt\n${line(root, 1)}\n`,
			),
		);
		twice("checksum_entry_missing", ([root]) =>
			writeFileSync(manifest(root), `${line(root, 0)}\n`),
		);
		twice("checksum_entry_extra", ([root]) =>
			writeFileSync(
				manifest(root),
				`${readFileSync(manifest(root), "utf8")}${"0".repeat(64)}  extra.txt\n`,
			),
		);
		twice("checksum_entry_duplicate", ([root]) =>
			writeFileSync(
				manifest(root),
				`${readFileSync(manifest(root), "utf8")}${line(root, 0)}\n`,
			),
		);
		twice("checksum_manifest_malformed", ([root]) =>
			writeFileSync(manifest(root), `${"0".repeat(63)}  a.txt\n`),
		);
	});

	test("rejects traversal, absolute paths, and leaf symlinks twice", () => {
		twice("checksum_path_unsafe", ([root]) =>
			writeFileSync(
				manifest(root),
				`${"0".repeat(64)}  ../a.txt\n${line(root, 1)}\n`,
			),
		);
		twice("checksum_path_unsafe", ([root]) =>
			writeFileSync(
				manifest(root),
				`${"0".repeat(64)}  /tmp/a.txt\n${line(root, 1)}\n`,
			),
		);
		twice("checksum_component_symlink", ([root]) => {
			rmSync(join(root, "assets/student/a.txt"));
			symlinkSync("b.json", join(root, "assets/student/a.txt"));
		});
	});

	test("rejects variant root and every intermediate symlink twice", () => {
		twice("checksum_component_symlink", ([root]) =>
			replaceWithLink(root, outside(root)),
		);
		twice("checksum_component_symlink", ([root]) =>
			replaceWithLink(join(root, "assets"), join(outside(root), "assets")),
		);
		twice("checksum_component_symlink", ([root]) =>
			replaceWithLink(
				join(root, "assets/student"),
				join(outside(root), "assets/student"),
			),
		);
		twice("checksum_component_symlink", ([root]) => {
			const target = join(outside(root), "assets");
			renameSync(join(root, "assets"), join(root, "real-assets"));
			symlinkSync("hop", join(root, "assets"), "dir");
			symlinkSync(target, join(root, "hop"), "dir");
		});
	});

	test("rejects before reading an outside FIFO sentinel twice", () => {
		for (let attempt = 0; attempt < 2; attempt++) {
			const variants = fixture();
			const target = outside(variants[0]);
			rmSync(manifest(target));
			expect(spawnSync("mkfifo", [manifest(target)]).status).toBe(0);
			replaceWithLink(
				join(variants[0], "assets/student"),
				join(target, "assets/student"),
			);
			const probe = spawnSync(
				process.execPath,
				[
					fileURLToPath(
						new URL("./workshop-checksums-fifo-probe.mjs", import.meta.url),
					),
					JSON.stringify(variants),
				],
				{ encoding: "utf8", timeout: 1_000 },
			);
			expect(probe.error).toBeUndefined();
			expect(probe.status).not.toBe(0);
			expect(probe.stderr).toContain("checksum_component_symlink");
		}
	});

	test("rejects root, instructor, or student divergence twice", () => {
		for (const index of [0, 1, 2] as const) {
			twice("checksum_manifest_divergence", (variants) => {
				writeFileSync(
					join(variants[index], "assets/student/a.txt"),
					`${index}\n`,
				);
				writeManifest(variants[index]);
			});
		}
	});

	test("direct manifest validation preserves strict syntax", () => {
		const [root] = fixture();
		expect(validateWorkshopChecksumManifest(root, names)).toBeInstanceOf(
			Buffer,
		);
	});
});
