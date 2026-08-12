import { record } from "./release-evidence-files";

export const PLAN_IDS = [
  ...Array.from({ length: 17 }, (_, index) => String(index + 1)),
  "F1",
  "F2",
  "F3",
  "F4",
];

export const CRITERION_IDS = [
  ...Array.from(
    { length: 10 },
    (_, index) => `must-have:${String(index + 1).padStart(2, "0")}`,
  ),
  ...Array.from(
    { length: 8 },
    (_, index) => `must-not:${String(index + 1).padStart(2, "0")}`,
  ),
  ...PLAN_IDS.map((id) => `todo:${id}`),
];

export function jsonPointer(value: unknown, pointer: string) {
  return pointer
    .slice(1)
    .split("/")
    .reduce<unknown>((current, part) => {
      if (!record(current) && !Array.isArray(current)) return undefined;
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      return current[key as keyof typeof current];
    }, value);
}

export function sectionBullets(text: string, start: string, end: string) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  return from < 0 || to < 0
    ? []
    : text
        .slice(from + start.length, to)
        .split("\n")
        .filter((line) => /^- \S/u.test(line));
}

export function idSort(a: string, b: string) {
  return PLAN_IDS.indexOf(a) - PLAN_IDS.indexOf(b);
}
