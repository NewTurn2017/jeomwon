#!/usr/bin/env bun
import { createCli, parseCommonArgs } from "./cli.mjs";
import {
	checkBunVersion,
	disposeTemplate,
	installTemplate,
	prepareTemplate,
	readRequiredBun,
	readSkillManifest,
	resolveSkillRoot,
} from "./preflight-source.mjs";

const parsed = parseCommonArgs(process.argv.slice(2));
const cli = createCli("warm-cache", parsed.language);
if (parsed.error || parsed.positional.length > 0) {
	cli.error(
		parsed.error ?? "usage",
		parsed.detail ?? "bun warm-cache.mjs [--lang ko|en|auto]",
	);
	process.exit(1);
}
if (parsed.help) {
	cli.help("bun warm-cache.mjs [--lang ko|en|auto]");
	process.exit(0);
}
let source;
try {
	const root = await resolveSkillRoot();
	const manifest = await readSkillManifest(root);
	source = await prepareTemplate(root, manifest);
	await checkBunVersion(await readRequiredBun(source.templateRoot));
	console.log("CACHE WARMUP NETWORK ALLOWED");
	const result = installTemplate(source.templateRoot, false);
	if (result.exitCode !== 0)
		throw new Error(
			result.stderr.toString().trim() ||
				`bun install exited ${result.exitCode}`,
		);
	console.log("CACHE WARMUP PASS");
} catch (error) {
	cli.error(
		error?.code ?? "cache_warmup_failed",
		error instanceof Error ? error.message : String(error),
	);
	process.exitCode = 1;
} finally {
	if (source) await disposeTemplate(source);
}
