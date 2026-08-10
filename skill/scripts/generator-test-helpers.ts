import { spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export const repoRoot = dirname(
	dirname(dirname(fileURLToPath(import.meta.url))),
);
export const injectPath = join(repoRoot, "skill/scripts/inject.mjs");
export const scaffoldPath = join(repoRoot, "skill/scripts/scaffold.mjs");
export const bootstrapPath = join(repoRoot, "skill/scripts/bootstrap.mjs");
export const templateSeedPath = join(
	repoRoot,
	"template/packages/backend/convex/jeomwonSeed.ts",
);
export const temporaryRoots: string[] = [];

export function localTemplateEnvironment(
	overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
	const environment = { ...process.env };
	delete environment.JEOMWON_TEMPLATE_ARCHIVE;
	delete environment.JEOMWON_TEMPLATE_ARCHIVE_SHA256;
	delete environment.JEOMWON_TEMPLATE_REF;
	delete environment.JEOMWON_TEMPLATE_GIT_REPOSITORY;
	delete environment.JEOMWON_TEMPLATE_SOURCE_COMMIT;
	return { ...environment, ...overrides };
}

export function cleanupFixtures() {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
}

export function assertRecord(
	value: unknown,
	label: string,
): asserts value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object`);
	}
}

export function readExamplePack(): Record<string, unknown> {
	const examples = readFileSync(join(repoRoot, "skill/EXAMPLES.md"), "utf8");
	const jsonBlock = examples.match(/```json\n([\s\S]*?)\n```/);
	if (!jsonBlock?.[1]) {
		throw new Error("EXAMPLES.md must contain a JSON domain pack");
	}
	const pack: unknown = JSON.parse(jsonBlock[1]);
	assertRecord(pack, "example pack");
	return structuredClone(pack);
}

export function featureRecord(
	pack: Record<string, unknown>,
): Record<string, unknown> {
	const features = pack.features;
	assertRecord(features, "features");
	return features;
}

export function copyRecord(
	pack: Record<string, unknown>,
): Record<string, unknown> {
	const copy = pack.copy;
	assertRecord(copy, "copy");
	return copy;
}

export function createInjectFixture(pack = readExamplePack()): {
	readonly root: string;
	readonly packPath: string;
	readonly seedPath: string;
	readonly configPath: string;
} {
	const root = mkdtempSync("/tmp/jeomwon-generator-contract-");
	temporaryRoots.push(root);
	const seedPath = join(root, "packages/backend/convex/jeomwonSeed.ts");
	mkdirSync(dirname(seedPath), { recursive: true });
	cpSync(templateSeedPath, seedPath);
	const biomePath = join(root, "node_modules/.bin/biome");
	mkdirSync(dirname(biomePath), { recursive: true });
	writeFileSync(biomePath, "#!/bin/sh\nexit 0\n");
	chmodSync(biomePath, 0o755);
	writeFileSync(
		join(root, "jeomwon-template.json"),
		JSON.stringify({
			templateApi: 1,
			contracts: {
				domainPackWriter: 0,
				capabilitySchema: 1,
				setupSchema: 2,
				qaContract: 1,
			},
		}),
	);
	writeFileSync(
		join(root, "jeomwon-capabilities.json"),
		JSON.stringify({ schemaVersion: 1 }),
	);
	writeFileSync(
		join(root, "setup-config.json"),
		JSON.stringify({ schemaVersion: 2 }),
	);
	const packPath = join(root, "domain-pack.json");
	writeFileSync(packPath, JSON.stringify(pack));
	return {
		root,
		packPath,
		seedPath,
		configPath: join(root, "packages/backend/domain.config.ts"),
	};
}

export function inject(pack = readExamplePack()) {
	const fixture = createInjectFixture(pack);
	const result = spawnSync(
		"bun",
		[injectPath, fixture.root, fixture.packPath],
		{
			cwd: repoRoot,
			encoding: "utf8",
			timeout: 15_000,
		},
	);
	return { fixture, result, output: `${result.stdout}${result.stderr}` };
}
