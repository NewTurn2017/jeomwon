export class InjectError extends Error {
	constructor(code, message, exitCode = 1) {
		super(message);
		this.code = code;
		this.exitCode = exitCode;
	}
}

export function errorDetail(error) {
	return error instanceof Error ? error.message : String(error);
}

export function signalExitCodeFor(error) {
	return error instanceof InjectError ? error.exitCode : 1;
}

export function faultEnabled(name) {
	return (process.env.JEOMWON_INJECT_FAULT ?? "")
		.split(",")
		.map((value) => value.trim())
		.includes(name);
}
