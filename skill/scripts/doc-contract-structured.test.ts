import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	QA_CONTRACT_VERSION,
	QA_GATE_CONTRACT,
} from "../../template/scripts/qa-contract";
import {
	DocContractError,
	validateCapabilitiesTable,
	validateExamples,
	validateIdentities,
	validateQaMarkers,
	validateQaTable,
	validateSetupTable,
} from "./doc-contract-structured.mjs";
import {
	ADMIN_WIDGETS,
	DOMAIN_PACK_SCHEMA_VERSION,
	RESOURCE_KINDS,
	SLOT_UNITS,
} from "./domain-pack-constants.mjs";

const root = resolve(import.meta.dir, "../..");
const features = readFileSync(join(root, "FEATURES.md"), "utf8");
const examples = readFileSync(join(root, "skill/EXAMPLES.md"), "utf8");
const templateReadme = readFileSync(join(root, "template/README.md"), "utf8");
const setup = JSON.parse(
	readFileSync(join(root, "template/setup-config.json"), "utf8"),
);
const manifest = JSON.parse(
	readFileSync(join(root, "template/jeomwon-capabilities.json"), "utf8"),
);
const project = JSON.parse(
	readFileSync(join(root, "template/jeomwon-template.json"), "utf8"),
);
const packageManifest = JSON.parse(
	readFileSync(join(root, "template/package.json"), "utf8"),
);
const receiptSource = readFileSync(
	join(root, "skill/scripts/inject-receipt-schema.mjs"),
	"utf8",
);
const receiptVersion = receiptSource.match(
	/RECEIPT_SCHEMA_VERSION = (\d+)/,
)?.[1];
if (receiptVersion === undefined)
	throw new Error("receipt schema source missing");
const identities = {
	"template.schema": String(project.schemaVersion),
	"template.api": String(project.templateApi),
	"domain-pack.writer": String(project.contracts.domainPackWriter),
	"domain-pack.schema": String(DOMAIN_PACK_SCHEMA_VERSION),
	"capability.schema": String(manifest.schemaVersion),
	"setup.schema": String(setup.schemaVersion),
	"qa.contract": String(QA_CONTRACT_VERSION),
	"qa.gates": String(QA_GATE_CONTRACT.length),
	"receipt.schema": receiptVersion,
	"bun.version": packageManifest.packageManager.split("@")[1],
};

function rejects(run: () => unknown, code: string) {
	expect(run).toThrow(DocContractError);
	expect(run).toThrow(code);
}

describe("structured documentation contracts", () => {
	test("accepts current machine-derived structures", () => {
		expect(() => validateCapabilitiesTable(features, manifest)).not.toThrow();
		expect(() => validateQaTable(features, QA_GATE_CONTRACT)).not.toThrow();
		expect(
			validateQaMarkers(
				{ "claim.md": "<!-- doc-qa contract=2 gates=12 -->" },
				QA_CONTRACT_VERSION,
				QA_GATE_CONTRACT.length,
			),
		).toBe(1);
		expect(() => validateIdentities(features, identities)).not.toThrow();
		expect(() => validateSetupTable(templateReadme, setup)).not.toThrow();
		const coverage = validateExamples(examples);
		expect(coverage.examples).toBe(
			[...examples.matchAll(/```json\s*\n/g)].length,
		);
		expect(coverage.total).toBe(
			RESOURCE_KINDS.size * SLOT_UNITS.size * ADMIN_WIDGETS.size,
		);
		expect(coverage.coverage).toBeGreaterThan(0);
	});

	test("fails closed when capability maturity is mutated", () => {
		rejects(
			() =>
				validateCapabilitiesTable(
					features.replace(
						"| operator.calendarCrud | kit-core | feature | false | implemented |",
						"| operator.calendarCrud | kit-core | feature | false | qa-proven |",
					),
					manifest,
				),
			"capability_table_mismatch",
		);
	});

	test("fails closed when QA order or identity is mutated", () => {
		rejects(
			() =>
				validateQaTable(
					features.replace("| 12 | 노쇼", "| 13 | 노쇼"),
					QA_GATE_CONTRACT,
				),
			"qa_table_mismatch",
		);
		rejects(
			() =>
				validateIdentities(
					features.replace("| receipt.schema | 3 |", "| receipt.schema | 2 |"),
					identities,
				),
			"identity_table_mismatch",
		);
	});

	test("fails closed when a structured QA claim drifts", () => {
		rejects(
			() =>
				validateQaMarkers(
					{ "claim.md": "<!-- doc-qa contract=2 gates=11 -->" },
					QA_CONTRACT_VERSION,
					QA_GATE_CONTRACT.length,
				),
			"qa_marker_mismatch",
		);
	});

	test("fails closed when setup ownership is mutated", () => {
		rejects(
			() =>
				validateSetupTable(
					templateReadme.replace(
						"| google-oauth | google-oauth | false |",
						"| google-oauth | resend | false |",
					),
					setup,
				),
			"setup_table_mismatch",
		);
	});

	test("fails closed when an example or coverage cell is mutated", () => {
		rejects(
			() =>
				validateExamples(
					examples.replace(
						'"storeTimezone": "Asia/Seoul"',
						'"storeTimezone": ""',
					),
				),
			"domain_example_invalid",
		);
		rejects(
			() =>
				validateExamples(
					examples.replace(
						"| person | day | gap | gap |",
						"| person | day | `salon-appointment` | gap |",
					),
				),
			"coverage_matrix_mismatch",
		);
		rejects(
			() =>
				validateExamples(
					examples.replace("doc-coverage covered=9", "doc-coverage covered=8"),
				),
			"coverage_identity_mismatch",
		);
	});
});
