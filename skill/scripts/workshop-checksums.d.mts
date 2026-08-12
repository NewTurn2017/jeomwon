export type WorkshopChecksumErrorCode =
	| "checksum_artifact_unsafe"
	| "checksum_component_invalid"
	| "checksum_component_missing"
	| "checksum_component_symlink"
	| "checksum_containment_invalid"
	| "checksum_digest_mismatch"
	| "checksum_entry_duplicate"
	| "checksum_entry_extra"
	| "checksum_entry_missing"
	| "checksum_expected_duplicate"
	| "checksum_manifest_divergence"
	| "checksum_manifest_malformed"
	| "checksum_path_unsafe";

export class WorkshopChecksumError extends Error {
	readonly code: WorkshopChecksumErrorCode;
	constructor(code: WorkshopChecksumErrorCode, detail: string);
}

export function validateWorkshopChecksumVariants(
	variantRoots: readonly string[],
	expectedNames: readonly string[],
): void;

export function validateWorkshopChecksumManifest(
	variantRoot: string,
	expectedNames: readonly string[],
): Buffer;
