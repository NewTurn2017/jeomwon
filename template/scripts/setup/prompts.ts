import readline from "node:readline/promises";
import { failureLabel, localized, message } from "./locales";
import type { Locale, RuntimeContext } from "./types";
import { glyph, style, ui } from "./ui";

let rawModeActive = false;
let signalHandlersInstalled = false;

export function restoreRawMode() {
  if (rawModeActive && process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(false);
  }
  rawModeActive = false;
}

export function installSignalHandlers(
  locale: Locale,
  cleanups: readonly (() => void)[] = [],
) {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;
  process.once("SIGINT", () => {
    restoreRawMode();
    for (const cleanup of cleanups) cleanup();
    process.stderr.write(
      `\n[locale:${locale}]\n[terminal_raw:false]\n${failureLabel(locale)} [product_failure]: ${message(locale, "interrupted")}\n`,
    );
    process.exit(130);
  });
}

export function recordDeferredKey(ctx: RuntimeContext, name: string) {
  ctx.deferredKeys.add(name);
}

export function logDeferredKey(
  ctx: RuntimeContext,
  name: string,
  reason: string,
) {
  if (!ctx.deferredKeys.has(name)) {
    console.log(
      localized(
        ctx.locale,
        `${name} 유예됨 (${reason}; 값 숨김).`,
        `${name} deferred (${reason}; value hidden).`,
      ),
    );
  }
  recordDeferredKey(ctx, name);
}

export async function promptConfirm(
  ctx: RuntimeContext,
  input: {
    key: string;
    message: string;
    defaultValue: boolean;
  },
) {
  const stub = ctx.stubs.answers?.[input.key];
  if (typeof stub === "boolean") {
    console.log(`${input.message} ${stub ? "yes" : "no"} (stub)`);
    return stub;
  }
  if (typeof stub === "string") {
    const normalized = stub.trim().toLowerCase();
    const value = ["y", "yes", "true", "1"].includes(normalized);
    console.log(`${input.message} ${value ? "yes" : "no"} (stub)`);
    return value;
  }
  if (ctx.options.yes) {
    return input.defaultValue;
  }
  if (ctx.options.nonInteractive) {
    return input.defaultValue;
  }

  const suffix = input.defaultValue ? "Y/n" : "y/N";
  const answer = await promptLine(
    `  ${glyph.step} ${input.message} ${style.gray(`(${suffix})`)} `,
  );
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return input.defaultValue;
  }
  return ["y", "yes"].includes(normalized);
}

export async function promptText(
  ctx: RuntimeContext,
  input: {
    key: string;
    message: string;
    defaultValue: string;
    secret: boolean;
    required: boolean;
  },
) {
  const stub = stubValue(ctx, input.key);
  if (stub !== undefined) {
    if (input.secret) {
      ctx.knownSecrets.add(stub);
      console.log(`${input.key}: using stub value (hidden).`);
    } else {
      console.log(`${input.key}: using stub value ${stub}.`);
    }
    return stub;
  }

  if (ctx.options.nonInteractive) {
    if (input.defaultValue || !input.required) {
      return input.defaultValue;
    }
    throw new Error(
      localized(
        ctx.locale,
        `필수 비대화형 값이 없습니다: ${input.key}`,
        `Missing required non-interactive value: ${input.key}`,
      ),
    );
  }

  const suffix = input.defaultValue
    ? style.gray(` [${input.defaultValue}]`)
    : "";
  const label = `  ${glyph.step} ${input.message}${suffix}${style.gray(": ")}`;
  const value = input.secret
    ? await promptSecret(label)
    : await promptLine(label);
  const finalValue = value.trim() || input.defaultValue;

  if (input.required && !finalValue) {
    throw new Error(
      localized(
        ctx.locale,
        `${input.key} 값이 필요합니다.`,
        `${input.key} is required.`,
      ),
    );
  }
  if (input.secret && finalValue) {
    ctx.knownSecrets.add(finalValue);
    ui.ok(
      localized(
        ctx.locale,
        `${style.gray(input.key)} 입력됨 ${style.gray(`(${finalValue.length}자; 값 숨김)`)}`,
        `${style.gray(input.key)} entered ${style.gray(`(${finalValue.length} characters; value hidden)`)}`,
      ),
    );
  }
  return finalValue;
}

export function stubValue(ctx: RuntimeContext, key: string) {
  return ctx.stubs.values?.[key] ?? process.env[`JEOMWON_SETUP_${key}`];
}

export async function promptLine(message: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

export async function promptSecret(message: string) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    return await promptLine(message);
  }

  process.stdout.write(message);
  process.stdin.setRawMode(true);
  rawModeActive = true;
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return await new Promise<string>((resolve) => {
    let value = "";

    const cleanup = () => {
      restoreRawMode();
      process.stdin.pause();
      process.stdin.off("data", onData);
    };

    const onData = (chunk: string) => {
      if (chunk === "\u0003") {
        cleanup();
        process.stdout.write("\n");
        process.kill(process.pid, "SIGINT");
        return;
      }
      if (chunk === "\r" || chunk === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (chunk === "\u007f") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      // Ignore stray control / escape sequences (arrow keys, etc.).
      if (chunk.charCodeAt(0) < 0x20) {
        return;
      }
      value += chunk;
      const dots = "•".repeat(chunk.length);
      process.stdout.write(
        !("NO_COLOR" in process.env)
          ? style.cyan(dots)
          : "*".repeat(chunk.length),
      );
    };

    process.stdin.on("data", onData);
  });
}
