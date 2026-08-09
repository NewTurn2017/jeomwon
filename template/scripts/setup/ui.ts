import type { Locale } from "./types";

const ansiPattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "g",
);
let locale: Locale = "en";
let sectionCount = 0;

function useColor() {
  return (
    Boolean(process.stdout.isTTY) &&
    !("NO_COLOR" in process.env) &&
    process.env.TERM !== "dumb"
  );
}

function paint(code: string, text: string): string {
  return useColor() ? `\u001b[${code}m${text}\u001b[0m` : text;
}

export const style = {
  bold: (value: string) => paint("1", value),
  dim: (value: string) => paint("2", value),
  red: (value: string) => paint("31", value),
  green: (value: string) => paint("32", value),
  yellow: (value: string) => paint("33", value),
  blue: (value: string) => paint("34", value),
  magenta: (value: string) => paint("35", value),
  cyan: (value: string) => paint("36", value),
  gray: (value: string) => paint("90", value),
};

export const glyph = {
  ok: style.green("[ok]"),
  skip: style.gray("[skip]"),
  warn: style.yellow("[warn]"),
  info: style.cyan("[info]"),
  step: style.magenta(">"),
  arrow: style.gray("->"),
};

export let RULE = "-".repeat(46);

export function initializeUi(nextLocale: Locale) {
  locale = nextLocale;
  sectionCount = 0;
  RULE = style.gray("-".repeat(contentWidth(process.stdout.columns)));
}

export function currentLocale() {
  return locale;
}

export function tr(korean: string, english: string) {
  return locale === "ko" ? korean : english;
}

export const ui = {
  ok: (text: string) => console.log(`  ${glyph.ok} ${text}`),
  skip: (text: string) => console.log(`  ${glyph.skip} ${style.gray(text)}`),
  warn: (text: string) => console.log(`  ${glyph.warn} ${text}`),
  info: (text: string) => console.log(`  ${glyph.info} ${text}`),
  hint: (text: string) => console.log(`    ${style.gray(text)}`),
  kv: (key: string, value: string) =>
    console.log(`  ${style.gray(key.padEnd(10))} ${style.bold(value)}`),
};

export function section(title: string) {
  sectionCount += 1;
  const label = style.magenta(
    style.bold(String(sectionCount).padStart(2, "0")),
  );
  console.log("");
  console.log(`${glyph.step} ${label}  ${style.bold(title)}`);
  console.log(`  ${RULE}`);
}

export function stripAnsi(value: string): string {
  return value.replace(ansiPattern, "");
}

function isWide(codePoint: number) {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

export function displayWidth(value: string): number {
  let width = 0;
  for (const character of stripAnsi(value)) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 0 ||
      codePoint < 0x20 ||
      (codePoint >= 0x7f && codePoint < 0xa0)
    ) {
      continue;
    }
    width += isWide(codePoint) ? 2 : 1;
  }
  return width;
}

export function contentWidth(columns: number | undefined): number {
  return Math.min(72, Math.max(32, (columns ?? 76) - 4));
}

export function redact(value: string, secrets: Set<string>) {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join("[hidden]");
  }
  return redacted;
}
