import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	documentAnchors,
	executeVerifyCommands,
	headingSlug,
	parseVerifyFences,
	validateDocumentLinks,
} from "./doc-contract-markdown.mjs";

const safe =
	"bun skill/scripts/validate-doc-contracts.mjs --capabilities template/jeomwon-capabilities.json --project template/jeomwon-template.json --qa template/scripts/qa-contract.ts";
const fenced = (info: string, command = safe) =>
	`before\n\`\`\`${info}\n${command}\n\`\`\`\nafter`;

function rejects(run: () => unknown, code: string) {
	expect(run).toThrow(code);
}

describe("marked verify fence grammar", () => {
	test("parses only the exact marker, context, and allowlisted argv", () => {
		expect(
			parseVerifyFences(fenced("bash verify cwd=repo"), "README.md"),
		).toEqual([
			{
				document: "README.md",
				shell: "bash",
				cwd: "repo",
				argv: safe.split(" "),
			},
		]);
	});

	test("ignores arbitrary bare shell prose fences", () => {
		expect(parseVerifyFences(fenced("bash", "echo prose"), "doc.md")).toEqual(
			[],
		);
	});

	test("executes every command in separate copies and aggregates exact exits", () => {
		const root = mkdtempSync(join(tmpdir(), "doc-command-root-"));
		try {
			writeFileSync(join(root, "sentinel"), "unchanged");
			let failure: Error | undefined;
			try {
				executeVerifyCommands(
					["one.md", "two.md"].map((document) => ({
						document,
						shell: "bash",
						cwd: "repo" as const,
						argv: ["/usr/bin/false"],
					})),
					root,
				);
			} catch (error) {
				failure = error as Error;
			}
			expect(failure?.message).toContain("verify_commands_failed");
			expect(failure?.message.match(/"exit":1/g)?.length).toBe(2);
			expect(readFileSync(join(root, "sentinel"), "utf8")).toBe("unchanged");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.each([
		["near-miss marker", "bash verifx cwd=repo", safe, "verify_marker_invalid"],
		["missing context", "bash verify", safe, "verify_marker_invalid"],
		["non-shell marker", "text verify cwd=repo", safe, "verify_marker_invalid"],
		[
			"unknown context",
			"bash verify cwd=template",
			safe,
			"verify_marker_invalid",
		],
		[
			"unsafe replacement",
			"bash verify cwd=repo",
			"rm -rf /tmp/probe",
			"verify_command_unknown",
		],
		[
			"network command",
			"bash verify cwd=repo",
			"curl https://example.com",
			"verify_command_unknown",
		],
		[
			"shell injection",
			"bash verify cwd=repo",
			`${safe}; rm -rf /tmp/probe`,
			"verify_command_metacharacter",
		],
		[
			"command substitution",
			"bash verify cwd=repo",
			"bun $(touch probe)",
			"verify_command_metacharacter",
		],
		[
			"multiple commands",
			"bash verify cwd=repo",
			`${safe}\nbun --version`,
			"verify_command_shape",
		],
	])("rejects %s", (_name, marker, command, code) => {
		rejects(() => parseVerifyFences(fenced(marker, command), "doc.md"), code);
	});
});

describe("renderer-compatible local anchors", () => {
	test("derives Unicode, duplicate, inline-markup, setext, and explicit ids", () => {
		const anchors = documentAnchors(
			'# 설정 & QA\n# 설정 & QA\n## `Bun` [명령](x.md)\n제목\n---\n<a id="fixed"></a>',
		);
		expect([...anchors]).toEqual([
			"fixed",
			"설정--qa",
			"설정--qa-1",
			"bun-명령",
			"제목",
		]);
		expect(headingSlug("Hello, 世界!")).toBe("hello-世界");
	});

	test("resolves relative files, same-file fragments, decoded Unicode, and HTML ids", () => {
		const root = mkdtempSync(join(tmpdir(), "doc-links-"));
		try {
			mkdirSync(join(root, "guide"));
			writeFileSync(
				join(root, "README.md"),
				"# 루트\n[guide](guide/one.md#반복-1)\n[self](#루트)\n[html](page.html#fixed)",
			);
			writeFileSync(join(root, "guide/one.md"), "# 반복\n# 반복");
			writeFileSync(join(root, "page.html"), '<h2 id="fixed">Fixed</h2>');
			expect(
				validateDocumentLinks(
					{
						"README.md":
							"# 루트\n[guide](guide/one.md#%EB%B0%98%EB%B3%B5-1)\n[self](#루트)\n[html](page.html#fixed)",
					},
					root,
				),
			).toBe(3);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed on a missing anchor", () => {
		const root = mkdtempSync(join(tmpdir(), "doc-links-"));
		try {
			writeFileSync(join(root, "README.md"), "# Present");
			rejects(
				() => validateDocumentLinks({ "README.md": "[bad](#missing)" }, root),
				"local_anchor_missing",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects an intermediate directory symlink before reading outside content", () => {
		const root = mkdtempSync(join(tmpdir(), "doc-links-root-"));
		const outside = mkdtempSync(join(tmpdir(), "doc-links-outside-"));
		try {
			writeFileSync(join(outside, "doc.md"), "# Escaped");
			chmodSync(join(outside, "doc.md"), 0);
			symlinkSync(outside, join(root, "escape-link"), "dir");
			rejects(
				() =>
					validateDocumentLinks(
						{ "README.md": "[escape](escape-link/doc.md#escaped)" },
						root,
					),
				"local_link_symlink: README.md:escape-link/doc.md#escaped",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});

	test("rejects a nested symlink chain that resolves outside the repository", () => {
		const root = mkdtempSync(join(tmpdir(), "doc-links-root-"));
		const outside = mkdtempSync(join(tmpdir(), "doc-links-outside-"));
		try {
			writeFileSync(join(outside, "doc.md"), "# Escaped");
			chmodSync(join(outside, "doc.md"), 0);
			symlinkSync(outside, join(root, "outside-chain"), "dir");
			symlinkSync("outside-chain", join(root, "entry-chain"), "dir");
			rejects(
				() =>
					validateDocumentLinks(
						{ "README.md": "[chain](entry-chain/doc.md#escaped)" },
						root,
					),
				"local_link_symlink: README.md:entry-chain/doc.md#escaped",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});
});
