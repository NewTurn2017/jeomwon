import {
	ADMIN_WIDGETS,
	RESOURCE_KINDS,
	SLOT_UNITS,
} from "./domain-pack-constants.mjs";
import { normalizeDomainPack } from "./domain-pack-schema.mjs";

export class DocContractError extends Error {}

function fail(code, detail) {
	throw new DocContractError(`${code}: ${detail}`);
}

export function table(markdown, id) {
	const match = markdown.match(
		new RegExp(
			`<!-- doc-contract:${id}:start -->([\\s\\S]*?)<!-- doc-contract:${id}:end -->`,
		),
	);
	if (!match) fail("structured_block_missing", id);
	const lines = match[1]
		.trim()
		.split("\n")
		.filter((line) => line.trim().startsWith("|"));
	if (lines.length < 3) fail("structured_table_invalid", id);
	const split = (line) =>
		line
			.trim()
			.slice(1, -1)
			.replaceAll("\\|", "\u0000")
			.split("|")
			.map((cell) =>
				cell.trim().replaceAll("\u0000", "|").replace(/^`|`$/g, ""),
			);
	const headers = split(lines[0]);
	return lines
		.slice(2)
		.map((line) =>
			Object.fromEntries(
				headers.map((header, index) => [header, split(line)[index]]),
			),
		);
}

export function validateCapabilitiesTable(markdown, manifest) {
	const rows = table(markdown, "capabilities");
	const expected = manifest.capabilities.map((item) => ({
		"Capability ID": item.id,
		Ownership: item.ownership,
		Enablement: item.enablement.mode,
		Default: String(item.enablement.default),
		Maturity: item.maturity,
		Evidence: item.evidence.level,
		"QA gate":
			item.evidence.qaGate === null ? "-" : String(item.evidence.qaGate),
	}));
	if (JSON.stringify(rows) !== JSON.stringify(expected))
		fail("capability_table_mismatch", "rows differ from capability manifest");
}

export function validateQaMarkers(documents, version, gateCount) {
	let found = 0;
	for (const [path, source] of Object.entries(documents)) {
		for (const match of source.matchAll(/<!--\s*doc-qa\b([\s\S]*?)-->/g)) {
			found += 1;
			const marker = match[1].trim().match(/^contract=(\d+) gates=(\d+)$/);
			if (
				!marker ||
				Number(marker[1]) !== version ||
				Number(marker[2]) !== gateCount
			)
				fail("qa_marker_mismatch", path);
		}
	}
	if (found === 0) fail("qa_markers_missing", "no structured QA claims");
	return found;
}

export function validateQaTable(markdown, gates) {
	const rows = table(markdown, "qa");
	const expected = gates.map((gate) => ({
		ID: String(gate.id),
		"Gate name": gate.name,
		Artifact: gate.artifact,
		"SKIP contract": gate.skipContract,
	}));
	if (expected.some((row) => typeof row["SKIP contract"] !== "string"))
		fail("qa_skip_contract_missing", "source gate lacks a SKIP contract");
	if (JSON.stringify(rows) !== JSON.stringify(expected))
		fail("qa_table_mismatch", "gate order, artifact, or SKIP contract differs");
}

export function validateIdentities(markdown, expected) {
	const actual = Object.fromEntries(
		table(markdown, "identities").map((row) => [row["Contract ID"], row.Value]),
	);
	if (JSON.stringify(actual) !== JSON.stringify(expected))
		fail("identity_table_mismatch", "release identities differ");
}

export function validateSetupTable(markdown, setup) {
	const expected = setup.steps.map((step) => ({
		"Step ID": step.id,
		Kind: step.kind,
		Required: String(step.required === true),
		Feature: step.whenFeature ?? "-",
	}));
	if (JSON.stringify(table(markdown, "setup")) !== JSON.stringify(expected))
		fail("setup_table_mismatch", "step order or machine fields differ");
}

export function validateExamples(markdown) {
	const blocks = [...markdown.matchAll(/```json\s*\n([\s\S]*?)```/g)];
	if (blocks.length === 0) fail("domain_examples_missing", "no JSON fences");
	const packs = blocks.map((match, index) => {
		try {
			return normalizeDomainPack(JSON.parse(match[1]));
		} catch (error) {
			return fail("domain_example_invalid", `${index + 1}: ${error}`);
		}
	});
	const cells = new Map();
	for (const pack of packs) {
		for (const service of pack.services) {
			const key = `${service.resourceKind}|${service.slotUnit ?? "minutes:30"}|${pack.adminWidget}`;
			const domains = cells.get(key) ?? new Set();
			domains.add(pack.domainKey);
			cells.set(key, domains);
		}
	}
	const total = RESOURCE_KINDS.size * SLOT_UNITS.size * ADMIN_WIDGETS.size;
	const marker = markdown.match(
		/<!--\s*doc-coverage covered=(\d+) total=(\d+)\s*-->/,
	);
	if (
		!marker ||
		Number(marker[1]) !== cells.size ||
		Number(marker[2]) !== total
	)
		fail("coverage_identity_mismatch", `${cells.size}/${total}`);
	validateMatrix(markdown, cells);
	return { examples: packs.length, coverage: cells.size, total };
}

function validateMatrix(markdown, cells) {
	const match = markdown.match(
		/<!-- matrix:start -->([\s\S]*?)<!-- matrix:end -->/,
	);
	if (!match) fail("coverage_matrix_missing", "matrix markers absent");
	const lines = match[1]
		.trim()
		.split("\n")
		.filter((line) => line.startsWith("|"))
		.slice(2);
	if (lines.length !== 12) fail("coverage_matrix_rows", String(lines.length));
	for (const line of lines) {
		const [kind, unit, calendar, seatGrid] = line
			.slice(1, -1)
			.split("|")
			.map((value) => value.trim().replaceAll("`", ""));
		for (const [widget, documented] of [
			["calendar", calendar],
			["seatGrid", seatGrid],
		]) {
			const actual =
				[...(cells.get(`${kind}|${unit}|${widget}`) ?? [])].sort().join(", ") ||
				"gap";
			if (documented !== actual)
				fail("coverage_matrix_mismatch", `${kind}/${unit}/${widget}`);
		}
	}
}
