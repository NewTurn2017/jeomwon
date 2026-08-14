import path from "node:path";
import {
  readDomainFeatures,
  readSetupConfig,
  readStubs,
  SetupConfigError,
} from "./config";
import {
  assertSetupPrerequisites,
  cleanupConvexCommands,
  configureConvex,
  configureConvexAuth,
} from "./convex";
import { assertEnvLocalIgnored, cleanupAtomicTemps } from "./env-files";
import { failureLabel, localized, message, resolveLocale } from "./locales";
import { localeOptionFromArgs, parseCliOptions, printHelp } from "./options";
import { finalizeEnvFiles, printCompletion } from "./postflight";
import { installSignalHandlers } from "./prompts";
import {
  configureAdminEmails,
  configureAnonymousLogin,
  configureApplicationOrigins,
  configureFirstSuccessDefaults,
  configureGoogleOAuth,
  configureOpenAI,
  configureOptionalLocalSteps,
  configurePolar,
  configureResend,
  configureSiteUrl,
} from "./providers";
import type { CliOptions, RuntimeContext } from "./types";
import { SetupFailure } from "./types";
import { glyph, initializeUi, RULE, redact, style } from "./ui";

void main();

async function main() {
  const args = process.argv.slice(2);
  const initialLocale = resolveLocale(localeOptionFromArgs(args));
  initializeUi(initialLocale);
  let options: CliOptions;
  try {
    options = parseCliOptions(args);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[locale:${initialLocale}]\n${failureLabel(initialLocale)} [product_failure]: ${detail}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const locale = resolveLocale(options.lang);
  initializeUi(locale);
  if (options.help) {
    printHelp(locale);
    return;
  }

  installSignalHandlers(locale, [cleanupAtomicTemps, cleanupConvexCommands]);
  const root = process.cwd();
  let ctx: RuntimeContext;
  try {
    const configPath = options.configFile
      ? path.resolve(root, options.configFile)
      : path.join(root, "setup-config.json");
    const config = readSetupConfig(configPath);
    const stubs = readStubs(root, options);
    ctx = {
      root,
      config,
      options,
      locale,
      stubs,
      projects: new Map(
        config.projects.map((project) => [project.id, project]),
      ),
      localEnvWrites: new Map(),
      convexEnvWrites: new Map(),
      knownSecrets: new Set(),
      deferredKeys: new Set(),
    };
  } catch (error) {
    const detail =
      error instanceof SetupConfigError ? error.code : "malformed_setup_input";
    process.stderr.write(
      `[locale:${locale}]\n${failureLabel(locale)} [product_failure]: ${detail}\n`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[locale:${locale}]`);
  console.log("");
  console.log(
    `  ${style.magenta(style.bold("jeomwon"))} ${style.bold("setup")} ${style.gray(`- ${message(locale, "wizard")}`)}`,
  );
  console.log(`  ${RULE}`);
  console.log(
    `  ${style.cyan(message(locale, "required"))}  ${style.bold("Convex + Google OAuth")} ${style.gray(message(locale, "firstPath"))}`,
  );
  console.log(`  ${RULE}`);
  if (!options.minimal) {
    console.log(
      `  ${style.cyan(localized(locale, "이어서", "then"))}  ${style.bold(
        "Resend + OpenAI + Polar",
      )} ${style.gray(
        localized(
          locale,
          "- 각 단계에서 거절하면 건너뜁니다",
          "- each step is skipped when you decline",
        ),
      )}`,
    );
    console.log(`  ${RULE}`);
  }
  if (ctx.config.introMessage?.trim()) {
    console.log(`  ${style.gray(ctx.config.introMessage.trim())}`);
  }
  if (options.minimal) {
    console.log(
      `  ${glyph.info} ${style.gray(
        localized(
          locale,
          "--minimal: Convex·Google 첫 성공 경로만 설정합니다.",
          "--minimal: configuring only the Convex and Google first-success path.",
        ),
      )}`,
    );
  }
  if (options.legacyOptionalProviders) {
    console.log(
      `  ${glyph.info} ${style.gray(
        localized(
          locale,
          "--optional-providers는 이제 기본 동작이라 아무것도 바꾸지 않습니다.",
          "--optional-providers is the default now and changes nothing.",
        ),
      )}`,
    );
  }
  if (options.dryRun) {
    console.log(
      `  ${glyph.warn} ${style.yellow("DRY RUN")} ${style.gray(`- ${message(locale, "dryRun")}`)}`,
    );
  }

  try {
    assertEnvLocalIgnored(ctx);
    await assertSetupPrerequisites(ctx);
    const siteUrl = await configureSiteUrl(ctx);
    const deployment = await configureConvex(ctx);
    await configureApplicationOrigins(ctx);
    await configureConvexAuth(ctx, deployment, siteUrl);
    await configureGoogleOAuth(ctx, deployment);
    await configureAdminEmails(ctx);
    await configureAnonymousLogin(ctx, siteUrl);
    const domainFeatures = await readDomainFeatures(ctx);
    if (ctx.options.minimal) {
      await configureFirstSuccessDefaults(ctx, domainFeatures);
    } else {
      await configureResend(ctx, domainFeatures);
      await configureOpenAI(ctx);
      await configurePolar(ctx, deployment, domainFeatures);
      await configureOptionalLocalSteps(ctx);
    }
    await finalizeEnvFiles(ctx);
    printCompletion(ctx, deployment);
  } catch (error) {
    const failure =
      error instanceof SetupFailure
        ? error
        : new SetupFailure(
            "product_failure",
            error instanceof Error ? error.message : String(error),
            [
              localized(
                locale,
                "오류를 수정한 뒤 bun setup을 다시 실행하세요.",
                "Fix the error and run bun setup again.",
              ),
            ],
          );
    const failureOutput = [
      "",
      `${failureLabel(locale)} [${failure.category}]: ${failure.message}`,
      ...failure.nextSteps.map((step, index) => `  ${index + 1}. ${step}`),
    ];
    process.stderr.write(
      redact(`${failureOutput.join("\n")}\n`, ctx.knownSecrets),
    );
    process.exitCode = 1;
  } finally {
    cleanupAtomicTemps();
  }
}
