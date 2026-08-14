import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const archive = join(root, "skill/assets/jeomwon-template-v0.1.5.tar.gz");
const prefix = "jeomwon-bundled/template/";
const included = [
	"scripts/qa-contract.ts",
	"scripts/qa-gate-no-show.ts",
	"scripts/qa-no-show-artifact-contract.ts",
	"packages/backend/convex/qaNoShow.ts",
	"packages/backend/tests/qa-no-show-fixture.test.ts",
] as const;

describe("generated no-show QA contract", () => {
	test("binds template and skill compatibility to QA evidence v2", () => {
		const template = JSON.parse(
			readFileSync(join(root, "template/jeomwon-template.json"), "utf8"),
		);
		const skill = JSON.parse(
			readFileSync(join(root, "skill/jeomwon-skill.json"), "utf8"),
		);
		expect(template.contracts.qaContract).toBe(2);
		expect(skill.compatibility.qaContract).toBe(2);
	});

	test("immutable archive includes exact canonical no-show gate bytes", () => {
		for (const path of included) {
			const extracted = spawnSync("tar", [
				"-xOzf",
				archive,
				`${prefix}${path}`,
			]);
			expect(extracted.status).toBe(0);
			expect(
				extracted.stdout.equals(readFileSync(join(root, "template", path))),
			).toBe(true);
		}
	});
});
