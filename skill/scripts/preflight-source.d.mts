export class PreflightError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}

export function checkBunVersion(required: string): Promise<void>;
