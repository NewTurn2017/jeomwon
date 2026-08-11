#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createCli, parseCommonArgs } from "./cli.mjs";
import {
	assertCacheCandidate,
	assertCacheReady,
	checkBunVersion,
	disposeTemplate,
	installTemplate,
	PreflightError,
	prepareTemplate,
	readRequiredBun,
	readSkillManifest,
	resolveSkillRoot,
} from "./preflight-source.mjs";

const resolveOnly = process.argv.includes("--resolve-root");
const argv = process.argv
	.slice(2)
	.filter((value) => value !== "--resolve-root");
const parsed = parseCommonArgs(argv);
const cli = createCli("preflight", parsed.language);
const usage =
	"bun preflight.mjs <target-dir> <project-name> <domain-pack.json> [--lang ko|en|auto]";
if (parsed.error)
	stop(parsed.error, parsed.detail, ["bun", process.argv[1], "--help"]);
if (parsed.help) {
	cli.help(usage);
	process.exit(0);
}

let source;
try {
	const skillRoot = await resolveSkillRoot();
	if (resolveOnly) {
		console.log(`SKILL ROOT PASS ${skillRoot}`);
		process.exit(0);
	}
	const [targetArg, ...middle] = parsed.positional;
	const packArg = middle.at(-1);
	const nameParts = middle.slice(0, -1);
	if (!targetArg || !packArg || nameParts.length === 0)
		throw new PreflightError("usage", usage);
	const target = resolve(targetArg);
	const pack = resolve(packArg);
	const manifest = await readSkillManifest(skillRoot);
	await validatePack(skillRoot, pack);
	cli.stage("PASS", "preflight_pack", pack);
	await validateTarget(target, skillRoot);
	cli.stage("PASS", "preflight_target", target);
	source = await prepareTemplate(skillRoot, manifest);
	cli.stage("PASS", "preflight_archive", source.archivePath);
	const requiredBun = await readRequiredBun(source.templateRoot);
	await checkBunVersion(requiredBun);
	cli.stage("PASS", "preflight_bun", requiredBun);
	try {
		await assertCacheCandidate();
		const install = installTemplate(source.templateRoot, true);
		assertCacheReady(install);
	} catch (error) {
		const cache =
			process.env.BUN_INSTALL_CACHE_DIR ?? `${homedir()}/.bun/install/cache`;
		throw Object.assign(error, {
			recovery: [
				"env",
				`BUN_INSTALL_CACHE_DIR=${cache}`,
				"bun",
				`${skillRoot}/scripts/warm-cache.mjs`,
				"--lang",
				parsed.language,
			],
		});
	}
	cli.stage(
		"PASS",
		"preflight_cache",
		process.env.BUN_INSTALL_CACHE_DIR ?? "default",
	);
	console.log(`PREFLIGHT PASS ${skillRoot}`);
} catch (error) {
	const code = error?.code ?? "preflight_failed";
	const inferred = resolve(dirname(process.argv[1]), "..");
	const recovery =
		error?.recovery ??
		defaultRecovery(code, inferred, parsed.positional, parsed.language);
	stop(code, error instanceof Error ? error.message : String(error), recovery);
} finally {
	if (source) await disposeTemplate(source);
}

async function validatePack(skillRoot, packPath) {
	if (!existsSync(packPath)) throw new PreflightError("pack_missing", packPath);
	const json = await import(
		pathToFileURL(`${skillRoot}/scripts/domain-pack-json.mjs`).href
	);
	const schema = await import(
		pathToFileURL(`${skillRoot}/scripts/domain-pack-schema.mjs`).href
	);
	try {
		schema.normalizeDomainPack(await json.readDomainPackJson(packPath));
	} catch (error) {
		throw new PreflightError(
			error?.code ?? "pack_invalid",
			error instanceof Error ? error.message : String(error),
		);
	}
}

async function validateTarget(target, skillRoot) {
	const skillBoundary = await realpath(skillRoot);
	const forbidden = [resolve("/"), resolve(homedir()), skillBoundary];
	const boundaries = [skillBoundary];
	const repository = resolve(skillRoot, "..");
	if (existsSync(resolve(repository, "template"))) {
		const repositoryBoundary = await realpath(repository);
		forbidden.push(repositoryBoundary);
		boundaries.push(repositoryBoundary);
	}
	if (
		forbidden.includes(target) ||
		boundaries.some((boundary) => target.startsWith(`${boundary}/`))
	)
		throw new PreflightError("target_unsafe", target);
	const targetExists = await validateTargetAncestry(target);
	if (!targetExists) return;
	if ((await readdir(target)).length > 0)
		throw Object.assign(new PreflightError("target_not_empty", target), {
			alternateTarget: `${target}.new`,
		});
}

async function validateTargetAncestry(target) {
	const paths = [];
	for (let current = target; ; current = dirname(current)) {
		paths.push(current);
		if (dirname(current) === current) break;
	}
	for (const path of paths.reverse()) {
		let metadata;
		try {
			metadata = await lstat(path);
		} catch (error) {
			if (error?.code === "ENOENT") return false;
			throw new PreflightError(
				"target_unsafe",
				`${path}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		if (metadata.isSymbolicLink() || !metadata.isDirectory())
			throw new PreflightError("target_unsafe", path);
	}
	return true;
}

function defaultRecovery(code, root, positional, language) {
	if (code === "bun_version_mismatch")
		return ["bun", "upgrade", "--version", "1.3.14"];
	if (code === "skill_root_unresolved")
		return [
			"env",
			`CLAUDE_SKILL_DIR=${root}`,
			"bun",
			`${root}/scripts/preflight.mjs`,
			...positional,
			"--lang",
			language,
		];
	const rerun = [...positional];
	if (code === "target_not_empty" && rerun[0])
		rerun[0] = `${resolve(rerun[0])}.new`;
	return ["bun", `${root}/scripts/preflight.mjs`, ...rerun, "--lang", language];
}

function stop(code, detail, recovery) {
	cli.recovery(recovery);
	cli.error(code, detail);
	process.exit(1);
}
