import type { CliOptions, Locale, LocaleOption } from "./types";

const languages = new Set<LocaleOption>(["ko", "en", "auto"]);

function optionValue(args: string[], index: number, option: string) {
  const value = args[index + 1];
  if (!value) throw new Error(`setup_option_value_required:${option}`);
  return value;
}

function language(value: string): LocaleOption {
  if (!languages.has(value as LocaleOption)) {
    throw new Error("setup_lang_invalid");
  }
  return value as LocaleOption;
}

export function localeOptionFromArgs(args: string[]): LocaleOption | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--lang") {
      const value = args[index + 1];
      return value && languages.has(value as LocaleOption)
        ? (value as LocaleOption)
        : undefined;
    }
    if (argument?.startsWith("--lang=")) {
      const value = argument.slice("--lang=".length);
      return languages.has(value as LocaleOption)
        ? (value as LocaleOption)
        : undefined;
    }
  }
  return undefined;
}

export function parseCliOptions(
  args: string[],
  env: Record<string, string | undefined> = process.env,
): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    freshDryRun: false,
    nonInteractive: false,
    yes: false,
    help: false,
    minimal: false,
    legacyOptionalProviders: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--fresh-dry-run") options.freshDryRun = true;
    else if (arg === "--non-interactive") options.nonInteractive = true;
    else if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--minimal") options.minimal = true;
    // Every provider is offered by default now, so the old opt-in flag stays
    // accepted and only reports itself as redundant.
    else if (arg === "--optional-providers")
      options.legacyOptionalProviders = true;
    else if (arg === "--lang") {
      options.lang = language(optionValue(args, index, arg));
      index += 1;
    } else if (arg.startsWith("--lang=")) {
      options.lang = language(arg.slice("--lang=".length));
    } else if (arg === "--stub-file") {
      options.stubFile = optionValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--stub-file=")) {
      options.stubFile = arg.slice("--stub-file=".length);
    } else if (arg === "--config-file") {
      options.configFile = optionValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--config-file=")) {
      options.configFile = arg.slice("--config-file=".length);
    } else if (arg === "--convex-url") {
      options.convexUrl = optionValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--convex-url=")) {
      options.convexUrl = arg.slice("--convex-url=".length);
    } else if (arg === "--project-name") {
      options.projectName = optionValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--project-name=")) {
      options.projectName = arg.slice("--project-name=".length);
    } else {
      throw new Error(`setup_option_unknown:${arg}`);
    }
  }

  if (options.stubFile === undefined && env.JEOMWON_SETUP_STUB_FILE) {
    options.stubFile = env.JEOMWON_SETUP_STUB_FILE;
  }
  if (options.freshDryRun && !options.dryRun) {
    throw new Error("fresh_dry_run_requires_dry_run");
  }
  return options;
}

const help = {
  ko: `사용법: bun setup [옵션]\n\n[info] 기본 동작: Convex·Google 다음에 Resend, OpenAI, Polar까지 순서대로 안내합니다.\n\n[info] 옵션:\n  --lang ko|en|auto     출력 언어 (기본 ko, auto는 환경 감지 후 영어)\n  --dry-run             외부 명령과 .env.local 쓰기 없이 미리보기\n  --fresh-dry-run       기존 .env.local을 무시하는 dry-run\n  --non-interactive     기본값과 제공값 사용\n  --yes, -y             기본 응답 수락\n  --minimal             Convex·Google 첫 성공 경로만 설정\n  --optional-providers  (기본값이 되어 더 이상 필요 없음)\n  --stub-file <path>    리허설 JSON 값\n  --config-file <path>  검증할 setup config JSON 경로\n  --convex-url <url>    기존 Convex 배포 재사용\n  --project-name <name> 새 Convex 프로젝트 이름\n  --help, -h            도움말\n`,
  en: `Usage: bun setup [options]\n\n[info] Default: Convex and Google first, then Resend, OpenAI, and Polar in order.\n\n[info] Options:\n  --lang ko|en|auto     Output language (default ko; auto reads the environment)\n  --dry-run             Preview without commands or .env.local writes\n  --fresh-dry-run       Ignore existing .env.local files during dry-run\n  --non-interactive     Use defaults and supplied values\n  --yes, -y             Accept default answers\n  --minimal             Configure only the Convex and Google first-success path\n  --optional-providers  (now the default; no longer needed)\n  --stub-file <path>    Rehearsal JSON values\n  --config-file <path>  Setup config JSON path to validate\n  --convex-url <url>    Reuse a Convex deployment\n  --project-name <name> New Convex project name\n  --help, -h            Show help\n`,
} satisfies Record<Locale, string>;

export function printHelp(locale: Locale) {
  console.log(`[locale:${locale}]`);
  console.log(help[locale]);
}
