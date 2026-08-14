import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const contracts = {
	domainPackWriter: 0,
	capabilitySchema: 1,
	setupSchema: 2,
	qaContract: 2,
};
const contractPaths = {
	capabilityManifestSha256: "jeomwon-capabilities.json",
	setupConfigSha256: "setup-config.json",
	qaContractSha256: "scripts/qa-contract.ts",
	ciWorkflowSha256: ".github/workflows/check.yml",
	packageManifestSha256: "package.json",
};

function sha(bytes: Buffer | string) {
	return createHash("sha256").update(bytes).digest("hex");
}

export function establishFixture(target: string, managedPaths: string[]) {
	const projectName = "Contract Fixture";
	const projectSlug = "contract-fixture";
	const templateSource = {
		kind: "bundled-archive",
		archiveSha256: "0".repeat(64),
		contentSha256: "1".repeat(64),
	};
	write(
		target,
		"jeomwon-template.json",
		`${JSON.stringify({
			schemaVersion: 1,
			templateVersion: "0.1.3",
			templateApi: 1,
			contracts,
			templateSource,
		})}\n`,
	);
	write(
		target,
		"jeomwon-capabilities.json",
		'{"schemaVersion":1,"kind":"fixture"}\n',
	);
	write(target, "setup-config.json", '{"schemaVersion":2}\n');
	write(
		target,
		"scripts/qa-contract.ts",
		"export const QA_CONTRACT_VERSION = 2 as const;\n",
	);
	write(target, ".github/workflows/check.yml", "name: fixture\n");
	write(
		target,
		"package.json",
		`${JSON.stringify({ name: projectSlug, packageManager: "bun@1.3.14" })}\n`,
	);
	if (!managedPaths.includes("domain-pack.json"))
		managedPaths.unshift("domain-pack.json");
	if (!managedPaths.includes("packages/backend/domain.config.ts"))
		managedPaths.push("packages/backend/domain.config.ts");
	const domainPackPath = join(target, "domain-pack.json");
	try {
		readFileSync(domainPackPath);
	} catch {
		write(
			target,
			"domain-pack.json",
			`${JSON.stringify(examplePack(), null, 2)}\n`,
		);
	}
	const managedOutputs = Object.fromEntries(
		managedPaths.map((path) => {
			const fullPath = join(target, path);
			return [
				path,
				{
					sha256: sha(readFileSync(fullPath)),
					mode: statSync(fullPath).mode & 0o777,
					type: "file",
				},
			];
		}),
	);
	const contractFiles = Object.fromEntries(
		Object.entries(contractPaths).map(([key, path]) => [
			key,
			sha(readFileSync(join(target, path))),
		]),
	);
	const domainManaged = managedOutputs["domain-pack.json"];
	if (!domainManaged) throw new Error("domain pack must be managed");
	const canonical = JSON.parse(readFileSync(domainPackPath, "utf8"));
	const receipt = {
		schemaVersion: 3,
		lifecycle: "established",
		projectName,
		projectSlug,
		projectIdentity: sha(`${projectName}\0${projectSlug}`),
		skillVersion: "0.1.3",
		templateVersion: "0.1.3",
		templateApi: 1,
		contracts,
		templateSource,
		contractFiles,
		domainPack: {
			schemaVersion: 1,
			writerVersion: 0,
			canonical,
			sha256: sha(JSON.stringify(canonical)),
		},
		managedOutputs,
	};
	write(
		target,
		"jeomwon-project.json",
		`${JSON.stringify(receipt, null, 2)}\n`,
	);
	chmodSync(join(target, "jeomwon-project.json"), 0o644);
}

function examplePack() {
	const source = readFileSync(join(repo, "skill/EXAMPLES.md"), "utf8").match(
		/```json\n([\s\S]*?)\n```/,
	)?.[1];
	if (!source) throw new Error("missing example pack");
	const legacy = JSON.parse(source);
	return {
		schemaVersion: 1,
		...legacy,
		features: {
			...legacy.features,
			waitlist: false,
			operatorCalendarCrud: false,
			noShow: false,
		},
		copy: { ...legacy.copy, noShow: null },
	};
}

function write(root: string, path: string, content: string) {
	const fullPath = join(root, path);
	mkdirSync(dirname(fullPath), { recursive: true });
	writeFileSync(fullPath, content, { mode: 0o644 });
}
