export class DocContractError extends Error {}

export type CapabilityManifest = {
	capabilities: Array<{
		id: string;
		ownership: string;
		enablement: { mode: string; default: boolean };
		maturity: string;
		evidence: { level: string; qaGate: number | null };
	}>;
};

export type QaGate = {
	id: number;
	name: string;
	artifact: string;
	skipContract: string;
};

export function table(
	markdown: string,
	id: string,
): Array<Record<string, string>>;
export function validateCapabilitiesTable(
	markdown: string,
	manifest: CapabilityManifest,
): void;
export function validateQaMarkers(
	documents: Record<string, string>,
	version: number,
	gateCount: number,
): number;
export function validateQaTable(
	markdown: string,
	gates: readonly QaGate[],
): void;
export function validateIdentities(
	markdown: string,
	expected: Record<string, string>,
): void;
export function validateSetupTable(
	markdown: string,
	setup: {
		steps: Array<{
			id: string;
			kind: string;
			required?: boolean;
			whenFeature?: string;
		}>;
	},
): void;
export function validateExamples(markdown: string): {
	examples: number;
	coverage: number;
	total: number;
};
