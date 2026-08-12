#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	collectDocuments,
	executeVerifyCommands,
	parseVerifyFences,
	validateDocumentLinks,
} from "./doc-contract-markdown.mjs";
import {
	DocContractError,
	table,
	validateCapabilitiesTable,
	validateExamples,
	validateIdentities,
	validateQaMarkers,
	validateQaTable,
	validateSetupTable,
} from "./doc-contract-structured.mjs";
import { DOMAIN_PACK_SCHEMA_VERSION } from "./domain-pack-constants.mjs";
import { RECEIPT_SCHEMA_VERSION } from "./inject-receipt-schema.mjs";
import { CONTRACT_PATHS } from "./release-contract.mjs";
import { validateCapabilities } from "./validate-capabilities.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export async function validateDocContracts(options) {
	const capabilitiesPath = resolve(options.capabilities);
	const projectPath = resolve(options.project);
	const qaPath = resolve(options.qa);
	validateCapabilities(capabilitiesPath, repoRoot);
	const capabilities = json(capabilitiesPath);
	const project = json(projectPath);
	const setup = json(resolve(dirname(projectPath), "setup-config.json"));
	const qaModule = await import(
		`${pathToFileURL(qaPath).href}?doc-contract=${Date.now()}`
	);
	const documentPaths = collectDocuments(repoRoot);
	const docs = Object.fromEntries(
		documentPaths.map((path) => [
			path,
			readFileSync(resolve(repoRoot, path), "utf8"),
		]),
	);
	validateCapabilitiesTable(docs["FEATURES.md"], capabilities);
	validateQaTable(docs["FEATURES.md"], qaModule.QA_GATE_CONTRACT);
	validateQaMarkers(
		docs,
		qaModule.QA_CONTRACT_VERSION,
		qaModule.QA_GATE_CONTRACT.length,
	);
	validateIdentities(
		docs["FEATURES.md"],
		identities(project, setup, qaModule, capabilities),
	);
	validateSetupTable(docs["template/README.md"], setup);
	validateExamples(docs["skill/EXAMPLES.md"]);
	validateStatuses();
	validateRelease(project, setup, qaModule, capabilities);
	validateCommands(docs["skill/REFERENCE.md"]);
	const links = validateDocumentLinks(docs, repoRoot);
	const marked = documentPaths.flatMap((path) =>
		path.endsWith(".md") ? parseVerifyFences(docs[path], path) : [],
	);
	const verifyResults = executeVerifyCommands(marked, repoRoot);
	return { documents: documentPaths.length, links, verifyResults };
}

function identities(project, setup, qa, capabilities) {
	return {
		"template.schema": String(project.schemaVersion),
		"template.api": String(project.templateApi),
		"domain-pack.writer": String(project.contracts.domainPackWriter),
		"domain-pack.schema": String(DOMAIN_PACK_SCHEMA_VERSION),
		"capability.schema": String(capabilities.schemaVersion),
		"setup.schema": String(setup.schemaVersion),
		"qa.contract": String(qa.QA_CONTRACT_VERSION),
		"qa.gates": String(qa.QA_GATE_CONTRACT.length),
		"receipt.schema": String(RECEIPT_SCHEMA_VERSION),
		"bun.version": packageManagerVersion(),
	};
}
function validateRelease(project, setup, qa, capabilities) {
	assert(
		project.contracts.capabilitySchema === capabilities.schemaVersion,
		"capability_schema_mismatch",
	);
	assert(
		project.contracts.setupSchema === setup.schemaVersion,
		"setup_schema_mismatch",
	);
	assert(
		project.contracts.qaContract === qa.QA_CONTRACT_VERSION,
		"qa_version_mismatch",
	);
	assert(
		JSON.stringify(qa.QA_GATE_CONTRACT.map((gate) => gate.id)) ===
			JSON.stringify(
				Array.from(
					{ length: qa.QA_GATE_CONTRACT.length },
					(_, index) => index + 1,
				),
			),
		"qa_gate_order_mismatch",
	);
	const skill = json(resolve(repoRoot, "skill/jeomwon-skill.json"));
	assert(
		JSON.stringify(skill.compatibility) ===
			JSON.stringify({
				templateVersion: project.templateVersion,
				templateApi: project.templateApi,
				...project.contracts,
			}),
		"skill_project_identity_mismatch",
	);
	for (const relativePath of Object.values(CONTRACT_PATHS))
		assert(
			existsSync(
				resolve(
					dirname(resolve(repoRoot, "template/jeomwon-template.json")),
					relativePath,
				),
			),
			`release_contract_path_missing:${relativePath}`,
		);
}

function validateStatuses() {
	const contract = readFileSync(
		resolve(repoRoot, "template/packages/backend/src/agent-contract.ts"),
		"utf8",
	);
	const schema = readFileSync(
		resolve(repoRoot, "template/packages/backend/convex/schema.ts"),
		"utf8",
	);
	const contractMatch = contract.match(
		/reservationStatuses = \[([\s\S]*?)\] as const/,
	);
	const schemaMatch = schema.match(
		/const reservationStatus = v\.union\(([\s\S]*?)\);/,
	);
	assert(contractMatch && schemaMatch, "reservation_statuses_missing");
	const literals = (source) =>
		[...source.matchAll(/(?:"|')([a-z_]+)(?:"|')/g)].map((item) => item[1]);
	assert(
		JSON.stringify(literals(contractMatch[1])) ===
			JSON.stringify(literals(schemaMatch[1])),
		"reservation_status_mismatch",
	);
}

function validateCommands(markdown) {
	const rows = table(markdown, "commands");
	for (const row of rows) {
		const id = row["Script ID"];
		const script = resolve(repoRoot, `skill/scripts/${id}.mjs`);
		assert(existsSync(script), `help_script_missing:${id}`);
		const result = spawnSync("bun", [script, "--help"], { encoding: "utf8" });
		assert(result.status === 0, `help_command_failed:${id}`);
		const actual = result.stdout.match(/Usage:\s*([\s\S]*?)\n?$/)?.[1];
		assert(
			normalize(actual) === normalize(row["Help usage"]),
			`help_usage_mismatch:${id}`,
		);
	}
	const workflow = Bun.YAML.parse(
		readFileSync(
			resolve(repoRoot, "template/.github/workflows/check.yml"),
			"utf8",
		),
	);
	const steps = workflow?.jobs?.check?.steps;
	assert(Array.isArray(steps), "ci_steps_missing");
	const bunStep = steps.find((step) => step.uses === "oven-sh/setup-bun@v2");
	assert(
		String(bunStep?.with?.["bun-version"]) === packageManagerVersion(),
		"ci_bun_mismatch",
	);
	const verify = readFileSync(
		resolve(repoRoot, "skill/scripts/verify.mjs"),
		"utf8",
	);
	const offline = verify.match(
		/name:\s*["']install["'][\s\S]*?command:\s*["']([^"']+)["'][\s\S]*?args:\s*(\[[^\]]+\])/,
	);
	assert(offline, "verify_install_missing");
	let offlineCommand;
	try {
		offlineCommand = [offline[1], ...JSON.parse(offline[2])].join(" ");
	} catch {
		throw new DocContractError("verify_install_invalid");
	}
	const expectedExecution = [
		...steps
			.filter(
				(step) => typeof step.name === "string" && typeof step.run === "string",
			)
			.map((step) => ({ Context: `CI / ${step.name}`, Command: step.run })),
		{ Context: "offline verify / install", Command: offlineCommand },
	];
	assert(
		JSON.stringify(table(markdown, "execution")) ===
			JSON.stringify(expectedExecution),
		"execution_table_mismatch",
	);
}

function packageManagerVersion() {
	return json(resolve(repoRoot, "template/package.json")).packageManager.split(
		"@",
	)[1];
}
function json(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}
function normalize(value) {
	return String(value).replace(/\s+/g, " ").trim();
}
function assert(condition, code) {
	if (!condition) throw new DocContractError(code);
}

if (import.meta.main) {
	try {
		const args = process.argv.slice(2);
		const value = (name) => args[args.indexOf(name) + 1];
		if (
			args.length !== 6 ||
			!["--capabilities", "--project", "--qa"].every((key) =>
				args.includes(key),
			)
		)
			throw new DocContractError(
				"usage: --capabilities <json> --project <json> --qa <ts>",
			);
		await validateDocContracts({
			capabilities: value("--capabilities"),
			project: value("--project"),
			qa: value("--qa"),
		});
		console.log("DOC CONTRACT PASS");
	} catch (error) {
		console.error(
			`DOC CONTRACT FAIL ${error instanceof Error ? error.message : error}`,
		);
		process.exit(1);
	}
}
