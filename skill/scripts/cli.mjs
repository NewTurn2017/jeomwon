const TEXT = {
	en: {
		help: "Usage",
		run: "Running",
		pass: "Completed",
		next: "Next steps (run these yourself; bootstrap does not run them)",
		recovery: "Recovery command",
	},
	ko: {
		help: "사용법",
		run: "실행",
		pass: "완료",
		next: "다음 단계 (bootstrap은 아래 명령을 실행하지 않습니다)",
		recovery: "복구 명령",
	},
};

export function resolveLanguage(explicit, env = process.env) {
	if (explicit && explicit !== "auto") return explicit;
	const candidates = [
		env.JEOMWON_CLI_LANG,
		env.LC_ALL,
		env.LC_MESSAGES,
		env.LANG,
	];
	for (const candidate of candidates) {
		if (!candidate || candidate === "auto") continue;
		return /^ko(?:[_-]|$)/i.test(candidate) ? "ko" : "en";
	}
	return "en";
}

export function colorEnabled(
	env = process.env,
	isTTY = Boolean(process.stdout.isTTY),
) {
	return isTTY && !("NO_COLOR" in env) && env.TERM !== "dumb";
}

export function stripAnsi(value) {
	const input = String(value);
	let output = "";
	for (let index = 0; index < input.length; index++) {
		if (input.charCodeAt(index) !== 27 || input[index + 1] !== "[") {
			output += input[index];
			continue;
		}
		index += 2;
		while (index < input.length) {
			const code = input.charCodeAt(index);
			if (code >= 0x40 && code <= 0x7e) break;
			index++;
		}
	}
	return output;
}

export function displayWidth(value) {
	let width = 0;
	for (const character of stripAnsi(value)) {
		const code = character.codePointAt(0) ?? 0;
		if (
			code === 0 ||
			(code < 32 && code !== 9) ||
			(code >= 0x7f && code < 0xa0)
		)
			continue;
		width += isWide(code) ? 2 : 1;
	}
	return width;
}

function isWide(code) {
	return (
		code >= 0x1100 &&
		(code <= 0x115f ||
			code === 0x2329 ||
			code === 0x232a ||
			(code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe10 && code <= 0xfe19) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6) ||
			(code >= 0x1f300 && code <= 0x1faff) ||
			(code >= 0x20000 && code <= 0x3fffd))
	);
}

export function contentWidth(columns = process.stdout.columns ?? 76) {
	return Math.max(32, Math.min(72, columns - 4));
}

export function parseCommonArgs(argv, { allowQa = false } = {}) {
	const positional = [];
	let language;
	let help = false;
	let qa = false;
	for (let index = 0; index < argv.length; index++) {
		const value = argv[index];
		if (value === "--help" || value === "-h") {
			help = true;
			continue;
		}
		if (value === "--lang") {
			const next = argv[++index];
			if (!next || !["ko", "en", "auto"].includes(next))
				return { error: "language_invalid", detail: next ?? "" };
			language = next;
			continue;
		}
		if (value.startsWith("--lang=")) {
			const next = value.slice(7);
			if (!["ko", "en", "auto"].includes(next))
				return { error: "language_invalid", detail: next };
			language = next;
			continue;
		}
		if (allowQa && value === "--qa") {
			qa = true;
			continue;
		}
		if (value.startsWith("-"))
			return { error: "unknown_argument", detail: value };
		positional.push(value);
	}
	return { positional, language: resolveLanguage(language), help, qa };
}

export function createCli(script, language = resolveLanguage()) {
	const text = TEXT[language];
	const useColor = colorEnabled();
	const width = contentWidth();
	const paint = (code, value) =>
		useColor ? `\u001b[${code}m${value}\u001b[0m` : value;
	const stdout = (prefix, value = "", continuation = "") => {
		for (const line of wrapLine(prefix, value, width, continuation)) {
			console.log(line);
		}
	};
	const stderr = (prefix, value = "", continuation = "") => {
		for (const line of wrapLine(prefix, value, width, continuation)) {
			console.error(line);
		}
	};
	return {
		language,
		help(usage) {
			stdout(`[HELP ${script}] ${text.help}:`, usage, "  ");
		},
		stage(state, code, detail = "") {
			const label = state === "RUN" ? text.run : text.pass;
			stdout(
				paint(state === "RUN" ? "36" : "32", `[${state} ${code}]`),
				`${label}${detail ? `: ${detail}` : ""}`,
				"  ",
			);
		},
		next(lines) {
			console.log("");
			stdout(paint("1", "[NEXT next_steps]"), text.next, "  ");
			for (const line of lines) stdout("  ", line, "  ");
		},
		recovery(argv) {
			stderr("[RECOVERY recovery]", text.recovery, "  ");
			const compact = JSON.stringify(argv);
			if (displayWidth(compact) <= width) {
				console.error(compact);
				return;
			}
			console.error("[");
			for (const [index, value] of argv.entries()) {
				console.error(
					`  ${JSON.stringify(value)}${index + 1 < argv.length ? "," : ""}`,
				);
			}
			console.error("]");
		},
		error(code, message = "") {
			stderr(`ERROR [${code}]`, message, "  ");
		},
	};
}

function wrapLine(prefix, value, width, continuation) {
	const prefixText = String(prefix);
	const tokens = tokenize(String(value));
	const lines = [];
	let line = prefixText;
	for (const token of tokens) {
		const separator = line && !line.endsWith(" ") ? " " : "";
		if (line && displayWidth(`${line}${separator}${token}`) > width) {
			lines.push(line.trimEnd());
			line = `${continuation}${token}`;
			continue;
		}
		line += `${separator}${token}`;
	}
	if (line || lines.length === 0) lines.push(line.trimEnd());
	return lines;
}

function tokenize(value) {
	const tokens = [];
	let token = "";
	let quote = "";
	let escaped = false;
	for (const character of value.trim()) {
		if (escaped) {
			token += character;
			escaped = false;
			continue;
		}
		if (character === "\\" && quote) {
			token += character;
			escaped = true;
			continue;
		}
		if (
			(character === '"' || character === "'") &&
			(!quote || quote === character)
		) {
			quote = quote ? "" : character;
			token += character;
			continue;
		}
		if (/\s/.test(character) && !quote) {
			if (token) tokens.push(token);
			token = "";
			continue;
		}
		token += character;
	}
	if (token) tokens.push(token);
	return tokens;
}

export function fail(code, message, exitCode = 1) {
	createCli("cli").error(code, message);
	process.exit(exitCode);
}

export function shellCommand(argv) {
	return argv
		.map((value) => {
			if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
			return JSON.stringify(value);
		})
		.join(" ");
}

export function signalExitCode(signal) {
	return signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1;
}
