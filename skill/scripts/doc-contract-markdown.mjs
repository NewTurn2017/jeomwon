import { spawnSync } from "node:child_process";
import {
	cpSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { resolveDocumentTarget } from "./doc-contract-paths.mjs";
import { DocContractError } from "./doc-contract-structured.mjs";

const EXCLUDED = new Set([
	".git",
	".gjc",
	".omo",
	"_generated",
	"node_modules",
	"samples",
	"upstream",
]);
const SAFE_VERIFY = [
	"bun",
	"skill/scripts/validate-doc-contracts.mjs",
	"--capabilities",
	"template/jeomwon-capabilities.json",
	"--project",
	"template/jeomwon-template.json",
	"--qa",
	"template/scripts/qa-contract.ts",
];

function fail(code, detail) {
	throw new DocContractError(`${code}: ${detail}`);
}

export function collectDocuments(root) {
	const output = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (EXCLUDED.has(entry.name)) continue;
			const path = join(directory, entry.name);
			if (entry.isDirectory()) visit(path);
			else if (entry.isFile() && [".md", ".html"].includes(extname(path)))
				output.push(relative(root, path).split(sep).join("/"));
		}
	};
	visit(root);
	return output.sort();
}

export function parseVerifyFences(markdown, document) {
	const lines = markdown.split("\n");
	const commands = [];
	for (let index = 0; index < lines.length; index += 1) {
		const opening = lines[index].match(/^\s*(`{3,}|~{3,})(.*)$/);
		if (!opening) continue;
		const marker = opening[1];
		const info = opening[2].trim();
		const shell = info.match(/^(bash|sh|shell)(?:\s+(.+))?$/);
		const body = [];
		let closed = false;
		for (index += 1; index < lines.length; index += 1) {
			if (
				new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(
					lines[index],
				)
			) {
				closed = true;
				break;
			}
			body.push(lines[index]);
		}
		if (!closed) {
			if (/\bverify\b/.test(info) || shell?.[2])
				fail("markdown_fence_unclosed", document);
			break;
		}
		if (!shell) {
			if (/\bverify\b/.test(info))
				fail("verify_marker_invalid", `${document}:${info}`);
			continue;
		}
		if (!shell[2]) continue;
		if (shell[2] !== "verify cwd=repo")
			fail("verify_marker_invalid", `${document}:${info}`);
		commands.push(parseVerifyCommand(body.join("\n"), document, shell[1]));
	}
	return commands;
}

function parseVerifyCommand(body, document, shell) {
	const command = body.trim();
	if (!command || command.includes("\n"))
		fail("verify_command_shape", `${document}: one command is required`);
	if (/[;&|<>$`(){}*?!\\'"[\]]/.test(command))
		fail("verify_command_metacharacter", document);
	const argv = command.split(/\s+/);
	if (JSON.stringify(argv) !== JSON.stringify(SAFE_VERIFY))
		fail("verify_command_unknown", `${document}:${argv[0] ?? "empty"}`);
	return { document, shell, cwd: "repo", argv };
}

export function executeVerifyCommands(commands, root) {
	if (process.env.JEOMWON_DOC_VERIFY_CHILD === "1") return [];
	const results = commands.map((command) => {
		const parent = mkdtempSync(join(tmpdir(), "jeomwon-doc-verify-"));
		const copy = join(parent, "repo");
		try {
			cpSync(root, copy, {
				recursive: true,
				filter: (source) => {
					const name = source.split(sep).at(-1);
					return !EXCLUDED.has(name);
				},
			});
			const result = spawnSync(command.argv[0], command.argv.slice(1), {
				cwd: copy,
				encoding: "utf8",
				timeout: 120_000,
				env: { ...process.env, JEOMWON_DOC_VERIFY_CHILD: "1" },
			});
			return {
				...command,
				exit: result.status,
				signal: result.signal,
				error: result.error?.message ?? null,
				stdout: result.stdout,
				stderr: result.stderr,
			};
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});
	if (results.some((result) => result.exit !== 0))
		fail("verify_commands_failed", JSON.stringify(results));
	return results;
}

export function validateDocumentLinks(documents, root) {
	const anchorCache = new Map();
	let checked = 0;
	for (const [document, source] of Object.entries(documents)) {
		for (const href of localDocumentHrefs(source)) {
			const [encodedPath, encodedFragment] = href.split("#", 2);
			const pathPart = decode(encodedPath.split("?")[0], document);
			const unresolvedTarget = pathPart
				? resolve(root, dirname(document), pathPart)
				: resolve(root, document);
			const target = resolveDocumentTarget(
				root,
				unresolvedTarget,
				`${document}:${href}`,
			);
			if (encodedFragment !== undefined && encodedFragment !== "") {
				const fragment = decode(encodedFragment, document);
				let anchors = anchorCache.get(target);
				if (!anchors) {
					anchors = documentAnchors(
						readFileSync(target, "utf8"),
						extname(target),
					);
					anchorCache.set(target, anchors);
				}
				if (!anchors.has(fragment))
					fail("local_anchor_missing", `${document}:${href}`);
			}
			checked += 1;
		}
	}
	return checked;
}

function localDocumentHrefs(source) {
	const values = [
		...[
			...source.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g),
		].map((match) => match[1]),
		...[
			...source.matchAll(/<(?:a|img)\s+[^>]*(?:href|src)=["']([^"']+)["']/gi),
		].map((match) => match[1]),
	];
	return values.filter((href) => {
		if (/^(?:https?:|mailto:|data:|javascript:|\$|\/)/i.test(href))
			return false;
		const path = href.split(/[?#]/)[0];
		return (
			href.startsWith("#") ||
			[".md", ".html"].includes(extname(path).toLowerCase())
		);
	});
}

export function documentAnchors(source, extension = ".md") {
	const anchors = new Set(
		[...source.matchAll(/\bid=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)].map(
			(match) => match[1] ?? match[2] ?? match[3],
		),
	);
	if (extension !== ".md") return anchors;
	const counts = new Map();
	const add = (heading) => {
		const base = headingSlug(heading);
		const count = counts.get(base) ?? 0;
		counts.set(base, count + 1);
		anchors.add(count === 0 ? base : `${base}-${count}`);
	};
	for (const match of source.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm))
		add(match[1]);
	for (const match of source.matchAll(/^(.+)\n(?:=+|-+)\s*$/gm)) add(match[1]);
	return anchors;
}

export function headingSlug(value) {
	return value
		.toLowerCase()
		.replace(/<[^>]*>/g, "")
		.replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, "$1")
		.replace(/[`*_~]/g, "")
		.replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
		.trim()
		.replace(/\s/g, "-");
}

function decode(value, document) {
	try {
		return decodeURIComponent(value);
	} catch {
		return fail("local_link_encoding", `${document}:${value}`);
	}
}
