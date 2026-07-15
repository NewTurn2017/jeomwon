const colorEnabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string, value: string) =>
  colorEnabled ? `\x1b[${code}m${value}\x1b[0m` : value;

export const bold = (value: string) => paint("1", value);
export const gray = (value: string) => paint("90", value);
export const green = (value: string) => paint("32", value);
export const red = (value: string) => paint("31", value);

const totalSteps = 4;

export const step = (index: number, message: string) =>
  console.log(
    `\n${paint("35", "▸")} ${bold(`${index}/${totalSteps}`)}  ${message}`,
  );

export const ok = (message: string) =>
  console.log(`  ${green("✓")} ${message}`);

export function fail(message: string): never {
  console.error(`  ${red("✗")} ${message}`);
  process.exit(1);
}

export function reportCleanupFailures(failures: readonly string[]): void {
  if (failures.length > 0) {
    console.error(`  ${red("✗")} 정리 실패 (${failures.join(", ")})`);
  }
}
