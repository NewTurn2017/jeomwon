export class CapabilityValidationError extends Error {
	readonly code: string;
	readonly detail: string;
}

export function validateCapabilities(
	manifestPath: string,
	repositoryRoot?: string,
): { schemaVersion: 1; capabilities: number };
