import { existsSync } from "node:fs";
import {
	chmod,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	rmdir,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { readDomainPackJson } from "./domain-pack-json.mjs";
import {
	renderDomainConfig,
	renderReservationSample,
} from "./domain-pack-render.mjs";
import {
	normalizeDomainPack,
	withoutSchemaVersion,
} from "./domain-pack-schema.mjs";
import {
	MANAGED_DOMAIN_CONFIG,
	MANAGED_DOMAIN_PACK,
	MANAGED_EMAIL_SAMPLE,
} from "./inject-managed.mjs";
import { formatGeneratedFiles } from "./inject-paths.mjs";
import {
	createEstablishedReceipt,
	validateEstablishedReceipt,
} from "./inject-receipt.mjs";
import { hashReleaseContracts } from "./release-contract.mjs";
import { validateTemplateCompatibility } from "./scaffold-contract.mjs";
import {
	copyTemplate,
	hashTemplateContent,
	rewriteProject,
	sameSnapshot,
	snapshotFile,
	stampTemplateSource,
} from "./scaffold-files.mjs";
import { acquireBootstrapLock } from "./scaffold-lock.mjs";
import {
	readSkillManifest,
	resolveTemplateSource,
} from "./scaffold-source.mjs";
import { bootstrapFault, ScaffoldError } from "./scaffold-state.mjs";

export async function initializeProject({
	target,
	projectName,
	projectSlug,
	packPath,
	skillRoot,
	repoRoot,
	checkInterrupt,
}) {
	if (existsSync(target) && (await readdir(target)).length > 0)
		throw new ScaffoldError("target_not_empty", target);
	let pack;
	try {
		if (!existsSync(packPath))
			throw new ScaffoldError("pack_missing", packPath);
		pack = normalizeDomainPack(await readDomainPackJson(packPath));
	} catch (error) {
		if (error instanceof ScaffoldError) throw error;
		throw new ScaffoldError(
			error?.code ?? "pack_invalid",
			error instanceof Error ? error.message : String(error),
		);
	}
	await mkdir(dirname(target), { recursive: true });
	const lock = await acquireBootstrapLock(target);
	let operationError;
	try {
		checkInterrupt();
		const skill = await readSkillManifest(skillRoot);
		const source = await resolveTemplateSource(
			lock.path,
			skillRoot,
			repoRoot,
			skill,
			checkInterrupt,
		);
		checkInterrupt();
		const template = await validateTemplateCompatibility(source.root, skill);
		const contentSha256 = await hashTemplateContent(source.root);
		if (
			source.expectedContentHash &&
			source.expectedContentHash !== contentSha256
		)
			throw new ScaffoldError(
				"bundled_content_mismatch",
				`${contentSha256} (expected ${source.expectedContentHash})`,
			);
		await mkdir(lock.work, { recursive: true });
		await copyTemplate(source.root, lock.work, checkInterrupt);
		if (bootstrapFault("scaffold"))
			throw new Error("injected scaffold failure");
		await rewriteProject(lock.work, projectSlug, checkInterrupt);
		const templateSource = { ...source.source, contentSha256 };
		await stampTemplateSource(lock.work, templateSource);
		await publishInitialManagedOutputs(
			lock.work,
			pack,
			{
				projectName,
				projectSlug,
				skillVersion: skill.skillVersion,
				templateVersion: template.templateVersion,
				templateApi: template.templateApi,
				contracts: template.contracts,
				templateSource,
			},
			checkInterrupt,
		);
		if (bootstrapFault("validation"))
			throw new Error("injected validation failure");
		checkInterrupt();
		if (existsSync(target)) {
			if ((await readdir(target)).length > 0)
				throw new ScaffoldError("target_not_empty", target);
			await rmdir(target);
		}
		if (bootstrapFault("publication"))
			throw new Error("injected target publication failure");
		await rename(lock.work, target);
	} catch (error) {
		operationError = error;
	}
	try {
		if (bootstrapFault("cleanup"))
			throw new Error("injected bootstrap cleanup failure");
		await rm(lock.path, { recursive: true, force: true });
	} catch (error) {
		throw new ScaffoldError(
			"bootstrap_recovery_required",
			`${operationError ? `${String(operationError)}; ` : ""}${String(error)}`,
		);
	}
	if (operationError) throw operationError;
	return { pack };
}

async function publishInitialManagedOutputs(
	root,
	pack,
	identity,
	checkInterrupt,
) {
	const paths = [
		MANAGED_DOMAIN_PACK,
		MANAGED_DOMAIN_CONFIG,
		MANAGED_EMAIL_SAMPLE,
	];
	const baseline = Object.fromEntries(
		await Promise.all(
			paths.map(async (path) => [path, await snapshotFile(join(root, path))]),
		),
	);
	const barrier = process.env.JEOMWON_INITIAL_BARRIER;
	if (barrier) {
		console.log("[BARRIER initial_baseline]");
		await readFile(barrier);
	}
	for (const path of paths)
		if (!sameSnapshot(baseline[path], await snapshotFile(join(root, path))))
			throw new ScaffoldError("inject_scaffold_state_mismatch", path);
	checkInterrupt();
	if (bootstrapFault("initial:render"))
		throw new Error("injected initial render failure");
	const renderable = withoutSchemaVersion(pack);
	const outputs = [
		{
			path: MANAGED_DOMAIN_PACK,
			bytes: Buffer.from(`${JSON.stringify(pack, null, 2)}\n`),
			mode: baseline[MANAGED_DOMAIN_PACK]?.mode ?? 0o644,
		},
		{
			path: MANAGED_DOMAIN_CONFIG,
			bytes: Buffer.from(`${renderDomainConfig(renderable).trim()}\n`),
			mode: baseline[MANAGED_DOMAIN_CONFIG]?.mode ?? 0o644,
		},
		...(baseline[MANAGED_EMAIL_SAMPLE]
			? [
					{
						path: MANAGED_EMAIL_SAMPLE,
						bytes: Buffer.from(
							`${renderReservationSample(renderable).trim()}\n`,
						),
						mode: baseline[MANAGED_EMAIL_SAMPLE].mode,
					},
				]
			: []),
	];
	const stage = join(root, ".jeomwon-initial-stage");
	await mkdir(stage, { mode: 0o700 });
	for (const [index, output] of outputs.entries()) {
		const destination = join(stage, output.path);
		await mkdir(dirname(destination), { recursive: true });
		await writeFile(destination, output.bytes, {
			mode: output.mode,
			flag: "wx",
		});
		if (bootstrapFault(`initial:stage:${index + 1}`))
			throw new Error(`injected initial stage failure at ${output.path}`);
	}
	formatGeneratedFiles(
		root,
		outputs
			.filter((output) => output.path.endsWith(".ts"))
			.map((output) => join(stage, output.path)),
	);
	for (const output of outputs)
		output.bytes = await readFile(join(stage, output.path));
	identity.contractFiles = await hashReleaseContracts(root);
	const receipt = createEstablishedReceipt(identity, identity, pack, outputs);
	await writeFile(
		join(stage, "jeomwon-project.json"),
		`${JSON.stringify(receipt, null, 2)}\n`,
		{ mode: 0o644, flag: "wx" },
	);
	for (const [index, output] of [
		...outputs,
		{ path: "jeomwon-project.json", mode: 0o644 },
	].entries()) {
		checkInterrupt();
		const destination = join(root, output.path);
		await rm(destination, { force: true });
		await mkdir(dirname(destination), { recursive: true });
		await rename(join(stage, output.path), destination);
		await chmod(destination, output.mode);
		if (bootstrapFault(`initial:publish:${index + 1}`))
			throw new Error(`injected initial publication failure at ${output.path}`);
	}
	await rm(stage, { recursive: true, force: true });
	await validateEstablishedReceipt(root, receipt);
}
