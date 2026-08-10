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
  if (ctx.config.introMessage?.trim()) {
    console.log(`  ${style.gray(ctx.config.introMessage.trim())}`);
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
    await configureConvexAuth(ctx, deployment, siteUrl);
    await configureGoogleOAuth(ctx, deployment);
    await configureAdminEmails(ctx);
    await configureAnonymousLogin(ctx, siteUrl);
    if (ctx.options.optionalProviders) {
      const domainFeatures = await readDomainFeatures(ctx);
      await configureResend(ctx);
      await configureOpenAI(ctx);
      if (domainFeatures.polar) await configurePolar(ctx, deployment);
      await configureOptionalLocalSteps(ctx);
    } else {
      await configureFirstSuccessDefaults(ctx);
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
