import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const skillSource = readFileSync(join(repoRoot, "skill/SKILL.md"), "utf8");
const verifySource = readFileSync(
	join(repoRoot, "skill/scripts/verify.mjs"),
	"utf8",
);
const qaSource = readFileSync(
	join(repoRoot, "template/scripts/qa-shared.ts"),
	"utf8",
);

describe("authenticated app operator guidance", () => {
	test("Given the live QA guidance When an operator follows it Then every target is apps/app on port 3000", () => {
		expect(skillSource).toContain(
			"the command verifies one canonical dev deployment and starts the authenticated app itself",
		);
		expect(skillSource).toContain(
			"running generated authenticated app (`apps/app`)",
		);
		expect(skillSource).not.toContain("Convex/web");
		expect(skillSource).not.toContain("generated web app");
		expect(verifySource).toContain(
			"JEOMWON_QA_BASE_URL=http://localhost:3000 after Convex and the authenticated app are running",
		);
		expect(verifySource).not.toContain(
			"JEOMWON_QA_BASE_URL=http://localhost:3001",
		);
		expect(qaSource).toContain(
			'process.env.JEOMWON_QA_BASE_URL ?? "http://localhost:3000"',
		);
		expect(qaSource).not.toContain(
			'process.env.JEOMWON_QA_BASE_URL ?? "http://localhost:3001"',
		);
	});
});
