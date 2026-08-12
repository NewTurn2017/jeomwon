import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export class WorkshopChecksumError extends Error {
	constructor(code, detail) {
		super(`${code}: ${detail}`);
		this.code = code;
	}
}

export function validateWorkshopChecksumVariants(variantRoots, expectedNames) {
	if (new Set(expectedNames).size !== expectedNames.length)
		throw new WorkshopChecksumError(
			"checksum_expected_duplicate",
			"expectedNames",
		);
	const manifests = variantRoots.map((root) =>
		validateWorkshopChecksumManifest(root, expectedNames),
	);
	for (const manifest of manifests.slice(1)) {
		if (!manifest.equals(manifests[0]))
			throw new WorkshopChecksumError(
				"checksum_manifest_divergence",
				"SHA256SUMS",
			);
	}
}

export function validateWorkshopChecksumManifest(variantRoot, expectedNames) {
	const manifestPath = resolveVariantFile(variantRoot, [
		"assets",
		"student",
		"SHA256SUMS",
	]);
	const manifest = readFileSync(manifestPath);
	const text = manifest.toString("utf8");
	if (!text.endsWith("\n") || text.includes("\r") || text.includes("\0"))
		throw new WorkshopChecksumError(
			"checksum_manifest_malformed",
			"SHA256SUMS",
		);
	const entries = parseManifest(text);
	const expected = new Set(expectedNames);
	for (const name of expected) {
		if (!entries.has(name))
			throw new WorkshopChecksumError("checksum_entry_missing", name);
	}
	for (const name of entries.keys()) {
		if (!expected.has(name))
			throw new WorkshopChecksumError("checksum_entry_extra", name);
	}
	for (const [name, digest] of entries) {
		const artifact = resolveVariantFile(variantRoot, [
			"assets",
			"student",
			name,
		]);
		const actual = createHash("sha256")
			.update(readFileSync(artifact))
			.digest("hex");
		if (actual !== digest)
			throw new WorkshopChecksumError("checksum_digest_mismatch", name);
	}
	return manifest;
}

function parseManifest(text) {
	const entries = new Map();
	for (const line of text.slice(0, -1).split("\n")) {
		const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
		if (!match)
			throw new WorkshopChecksumError("checksum_manifest_malformed", line);
		const [, digest, name] = match;
		if (
			isAbsolute(name) ||
			name.includes("/") ||
			name.includes("\\") ||
			name === "." ||
			name === ".."
		)
			throw new WorkshopChecksumError("checksum_path_unsafe", name);
		if (entries.has(name))
			throw new WorkshopChecksumError("checksum_entry_duplicate", name);
		entries.set(name, digest);
	}
	return entries;
}

function resolveVariantFile(requestedRoot, segments) {
	const lexicalRoot = resolve(requestedRoot);
	let canonicalParent;
	try {
		canonicalParent = realpathSync(dirname(lexicalRoot));
	} catch {
		return fail("checksum_containment_invalid", requestedRoot);
	}
	const canonicalLexicalRoot = join(
		canonicalParent,
		lexicalRoot.split(sep).at(-1),
	);
	let component = canonicalLexicalRoot;
	for (const [index, segment] of ["", ...segments].entries()) {
		if (segment) component = join(component, segment);
		let metadata;
		try {
			metadata = lstatSync(component);
		} catch {
			return fail("checksum_component_missing", component);
		}
		if (metadata.isSymbolicLink())
			return fail("checksum_component_symlink", component);
		if (index === segments.length) {
			if (!metadata.isFile())
				return fail("checksum_artifact_unsafe", component);
		} else if (!metadata.isDirectory()) {
			return fail("checksum_component_invalid", component);
		}
	}
	let canonicalRoot;
	let canonicalTarget;
	try {
		canonicalRoot = realpathSync(canonicalLexicalRoot);
		canonicalTarget = realpathSync(component);
	} catch {
		return fail("checksum_containment_invalid", component);
	}
	if (!contained(relative(canonicalRoot, canonicalTarget)))
		return fail("checksum_containment_invalid", component);
	return canonicalTarget;
}

function contained(relativePath) {
	return relativePath !== ".." && !relativePath.startsWith(`..${sep}`);
}

function fail(code, detail) {
	throw new WorkshopChecksumError(code, detail);
}
