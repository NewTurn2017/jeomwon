import { readFile, stat } from "node:fs/promises";
import { InjectError } from "./inject-errors.mjs";

const MAX_PACK_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_VALUES = 100_000;

function fail(message) {
	throw new InjectError("pack_invalid", message);
}

export async function readDomainPackJson(path) {
	try {
		const metadata = await stat(path);
		if (!metadata.isFile()) {
			fail("domain pack must be a regular file");
		}
		if (metadata.size > MAX_PACK_BYTES) {
			fail(`domain pack exceeds ${MAX_PACK_BYTES} bytes`);
		}
		const bytes = await readFile(path);
		if (bytes.byteLength > MAX_PACK_BYTES) {
			fail(`domain pack exceeds ${MAX_PACK_BYTES} bytes`);
		}
		const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		validateJsonStructure(source);
		return JSON.parse(source);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		fail(`invalid JSON in ${path}: ${detail}`);
	}
}

function validateJsonStructure(source) {
	new JsonStructureValidator(source).validate();
}

class JsonStructureValidator {
	constructor(source) {
		this.source = source;
		this.index = 0;
		this.values = 0;
	}

	validate() {
		this.skipWhitespace();
		this.parseValue(0);
		this.skipWhitespace();
		if (this.index !== this.source.length) {
			this.invalid("unexpected trailing content");
		}
	}

	parseValue(depth) {
		if (depth > MAX_JSON_DEPTH) {
			this.invalid(`JSON nesting exceeds ${MAX_JSON_DEPTH}`);
		}
		this.values++;
		if (this.values > MAX_JSON_VALUES) {
			this.invalid(`JSON value count exceeds ${MAX_JSON_VALUES}`);
		}
		this.skipWhitespace();
		const token = this.source[this.index];
		if (token === "{") {
			this.parseObject(depth + 1);
			return;
		}
		if (token === "[") {
			this.parseArray(depth + 1);
			return;
		}
		if (token === '"') {
			this.parseString();
			return;
		}
		if (token === "-" || (token >= "0" && token <= "9")) {
			this.parseNumber();
			return;
		}
		for (const literal of ["true", "false", "null"]) {
			if (this.source.startsWith(literal, this.index)) {
				this.index += literal.length;
				return;
			}
		}
		this.invalid("expected a JSON value");
	}

	parseObject(depth) {
		this.index++;
		this.skipWhitespace();
		if (this.consume("}")) return;
		const keys = new Set();
		while (true) {
			if (this.source[this.index] !== '"') {
				this.invalid("expected an object key");
			}
			const key = this.parseString();
			if (keys.has(key)) {
				this.invalid(`duplicate key ${JSON.stringify(key)}`);
			}
			keys.add(key);
			this.skipWhitespace();
			this.expect(":");
			this.parseValue(depth);
			this.skipWhitespace();
			if (this.consume("}")) return;
			this.expect(",");
			this.skipWhitespace();
		}
	}

	parseArray(depth) {
		this.index++;
		this.skipWhitespace();
		if (this.consume("]")) return;
		while (true) {
			this.parseValue(depth);
			this.skipWhitespace();
			if (this.consume("]")) return;
			this.expect(",");
			this.skipWhitespace();
		}
	}

	parseString() {
		const start = this.index;
		this.index++;
		let escaped = false;
		while (this.index < this.source.length) {
			const character = this.source[this.index++];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (character === "\\") {
				escaped = true;
				continue;
			}
			if (character === '"') {
				return JSON.parse(this.source.slice(start, this.index));
			}
			if (character.charCodeAt(0) < 0x20) {
				this.invalid("unescaped control character in string");
			}
		}
		this.invalid("unterminated string");
	}

	parseNumber() {
		const match = this.source
			.slice(this.index)
			.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
		if (!match) this.invalid("invalid number");
		this.index += match[0].length;
	}

	skipWhitespace() {
		while (/\s/.test(this.source[this.index] ?? "")) this.index++;
	}

	consume(character) {
		if (this.source[this.index] !== character) return false;
		this.index++;
		return true;
	}

	expect(character) {
		if (!this.consume(character)) {
			this.invalid(`expected ${JSON.stringify(character)}`);
		}
	}

	invalid(message) {
		throw new SyntaxError(`${message} (offset ${this.index})`);
	}
}
