export class QaRuntimeError extends Error {
	constructor(code, message) {
		super(message);
		this.name = "QaRuntimeError";
		this.code = code;
	}
}

export function parsePort(value, fallback) {
	const candidate = value === undefined ? fallback : Number(value);
	if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65535) {
		throw new QaRuntimeError(
			"qa_origin_invalid",
			`invalid port: ${value ?? ""}`,
		);
	}
	return candidate;
}

export function optionValue(argv, index, name) {
	const value = argv[index + 1];
	if (!value || value.startsWith("--")) {
		throw new QaRuntimeError("qa_origin_invalid", `missing value for ${name}`);
	}
	return value;
}

export function reportQaError(error) {
	const code =
		error instanceof QaRuntimeError ? error.code : "qa_runtime_failed";
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`ERROR [${code}] ${message}\n`);
	return 1;
}
