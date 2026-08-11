export class ScaffoldError extends Error {
	constructor(code, message, exitCode = 1) {
		super(message);
		this.code = code;
		this.exitCode = exitCode;
	}
}

export function bootstrapFault(name) {
	return (process.env.JEOMWON_BOOTSTRAP_FAULT ?? "")
		.split(",")
		.map((value) => value.trim())
		.includes(name);
}
