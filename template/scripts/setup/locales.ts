import type { Locale, LocaleOption } from "./types";

type Environment = Record<string, string | undefined>;

const localePattern = /^(ko)(?:[_-]|\.|$)/i;

function localeFromValue(value: string | undefined): Locale | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (/^en(?:[_-]|\.|$)/i.test(normalized)) return "en";
  if (localePattern.test(normalized)) return "ko";
  return undefined;
}

export function resolveLocale(
  option: LocaleOption | undefined,
  env: Environment = process.env,
): Locale {
  if (option === "ko" || option === "en") return option;
  for (const value of [
    env.JEOMWON_CLI_LANG,
    env.LC_ALL,
    env.LC_MESSAGES,
    env.LANG,
  ]) {
    const locale = localeFromValue(value);
    if (locale) return locale;
  }
  return "en";
}

const messages = {
  ko: {
    wizard: "대화형 설정 마법사",
    required: "필수",
    firstPath: "첫 성공 경로",
    dryRun: "외부 명령·파일 쓰기 없이 미리보기만 합니다.",
    previewComplete: "설정 미리보기 완료",
    complete: "설정 완료",
    interrupted: "설정이 중단되었습니다.",
  },
  en: {
    wizard: "interactive setup wizard",
    required: "required",
    firstPath: "first-success path",
    dryRun: "Preview only: no external commands or file writes.",
    previewComplete: "Setup preview complete",
    complete: "Setup complete",
    interrupted: "Setup interrupted.",
  },
} as const;

export type MessageKey = keyof (typeof messages)["en"];

export function message(locale: Locale, key: MessageKey): string {
  return messages[locale][key];
}

export function localized(
  locale: Locale,
  korean: string,
  english: string,
): string {
  return locale === "ko" ? korean : english;
}

export function failureLabel(locale: Locale): string {
  return localized(locale, "설정 중단", "Setup stopped");
}
