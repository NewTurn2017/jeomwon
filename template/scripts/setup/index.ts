import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

// ── CLI styling (no deps; TTY / NO_COLOR aware) ───────────────────────────
const USE_COLOR =
  Boolean(process.stdout.isTTY) &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb";

function paint(code: string, text: string): string {
  return USE_COLOR ? `[${code}m${text}[0m` : text;
}

const style = {
  bold: (s: string) => paint("1", s),
  dim: (s: string) => paint("2", s),
  red: (s: string) => paint("31", s),
  green: (s: string) => paint("32", s),
  yellow: (s: string) => paint("33", s),
  blue: (s: string) => paint("34", s),
  magenta: (s: string) => paint("35", s),
  cyan: (s: string) => paint("36", s),
  gray: (s: string) => paint("90", s),
};

const glyph = {
  ok: style.green("✓"),
  skip: style.gray("○"),
  warn: style.yellow("▲"),
  info: style.cyan("ℹ"),
  step: style.magenta("▸"),
  arrow: style.gray("→"),
};

const RULE = style.gray("─".repeat(46));
let sectionCount = 0;

const ui = {
  ok: (msg: string) => console.log(`  ${glyph.ok} ${msg}`),
  skip: (msg: string) => console.log(`  ${glyph.skip} ${style.gray(msg)}`),
  warn: (msg: string) => console.log(`  ${glyph.warn} ${msg}`),
  info: (msg: string) => console.log(`  ${glyph.info} ${msg}`),
  hint: (msg: string) => console.log(`    ${style.gray(msg)}`),
  kv: (key: string, value: string) =>
    console.log(`  ${style.gray(key.padEnd(10))} ${style.bold(value)}`),
};

type ProjectType = "convex" | "envFile";

type ProjectConfig = {
  id: string;
  type?: ProjectType;
  workingDirectory?: string;
  envFile?: string;
  exampleFile?: string;
};

type StepVariable = {
  name: string;
  projects: string[];
  details?: string;
  defaultValue?: string;
  template?: string;
  required?: boolean;
  secret?: boolean;
  info?: string[];
};

type StepConfig = {
  id: string;
  kind: string;
  title: string;
  description?: string;
  instructions?: string;
  variables: StepVariable[];
  required?: boolean;
  interactive?: boolean;
  skipMode?: string;
  whenFeature?: string;
  requiredMessage?: string;
  additionalInstructions?: string[];
};

type SetupConfig = {
  introMessage: string;
  projects: ProjectConfig[];
  steps: StepConfig[];
};

type CliOptions = {
  dryRun: boolean;
  freshDryRun: boolean;
  nonInteractive: boolean;
  yes: boolean;
  help: boolean;
  stubFile?: string;
  convexUrl?: string;
  projectName?: string;
};

type SetupStubs = {
  values?: Record<string, string>;
  answers?: Record<string, boolean | string>;
  existingConvexEnv?: Record<string, boolean | string>;
  existingLocalEnv?: Record<string, Record<string, string>>;
  convexAuthenticated?: boolean;
  convexUrl?: string;
  convexSiteUrl?: string;
  domainFeatures?: {
    polar?: boolean;
    customerAccounts?: boolean;
  };
  probes?: {
    openaiModels?: boolean;
    resendEmail?: boolean;
  };
};

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type RuntimeContext = {
  root: string;
  config: SetupConfig;
  options: CliOptions;
  stubs: SetupStubs;
  projects: Map<string, ProjectConfig>;
  localEnvWrites: Map<string, Map<string, string>>;
  convexEnvWrites: Map<string, string>;
  knownSecrets: Set<string>;
  deferredKeys: Set<string>;
};

type ConvexDeployment = {
  convexUrl: string;
  convexSiteUrl: string;
};

const REQUIRED_CONVEX_AUTH_ENV = [
  "JWT_PRIVATE_KEY",
  "JWKS",
  "CONVEX_SITE_URL",
  "SITE_URL",
] as const;

const CORE_STEP_ORDER = [
  "app-url",
  "site-url",
  "convex",
  "convex-auth",
  "google-oauth",
  "admin-emails",
  "anonymous-login",
  "resend",
  "openai",
  "polar",
] as const;

void main();

async function main() {
  const root = process.cwd();
  const options = parseCliOptions(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const config = readJsonFile<SetupConfig>(
    path.join(root, "setup-config.json"),
  );
  const stubs = readStubs(root, options);
  const ctx: RuntimeContext = {
    root,
    config,
    options,
    stubs,
    projects: new Map(config.projects.map((project) => [project.id, project])),
    localEnvWrites: new Map(),
    convexEnvWrites: new Map(),
    knownSecrets: new Set(),
    deferredKeys: new Set(),
  };

  console.log("");
  console.log(
    `  ${style.magenta(style.bold("jeomwon"))} ${style.bold("setup")} ${style.gray("· 대화형 설정 마법사")}`,
  );
  console.log(`  ${RULE}`);
  console.log(
    `  ${style.cyan("필수")}  ${style.bold("Convex")} ${style.gray("무료 계정 — 지금 연결합니다.")}`,
  );
  console.log(
    `  ${style.gray("선택")}  ${style.gray("OpenAI · Resend · Google 로그인")}`,
  );
  console.log(
    `        ${style.gray("지금 건너뛰어도 됩니다 — mock/capture 모드로 끝까지 동작하고,")}`,
  );
  console.log(
    `        ${style.gray("나중에 ")}${style.cyan("bun setup")}${style.gray(" 을 다시 실행해 추가할 수 있습니다.")}`,
  );
  console.log(`  ${RULE}`);
  console.log(
    `  ${glyph.info} ${style.gray("비밀값은 저장·출력되지 않으며, 입력할 때 ")}${style.cyan("•")}${style.gray(" 로만 표시됩니다.")}`,
  );
  if (config.introMessage?.trim()) {
    console.log(`  ${style.gray(config.introMessage.trim())}`);
  }
  if (options.dryRun) {
    console.log(
      `  ${glyph.warn} ${style.yellow("DRY RUN")} ${style.gray("— 외부 명령·파일 쓰기 없이 미리보기만 합니다.")}`,
    );
  }

  try {
    assertEnvLocalIgnored(ctx);
    const domainFeatures = await readDomainFeatures(ctx);
    const siteUrl = await configureSiteUrl(ctx);
    const deployment = await configureConvex(ctx);

    await configureConvexAuth(ctx, deployment, siteUrl);
    await configureGoogleOAuth(ctx, deployment);
    await configureAdminEmails(ctx);
    await configureAnonymousLogin(ctx, domainFeatures.customerAccounts);

    await configureResend(ctx);
    await configureOpenAI(ctx, domainFeatures.customerAccounts);

    if (domainFeatures.polar) {
      await configurePolar(ctx, deployment);
    } else {
      section("Polar");
      console.log("domain.config.features.polar=false, skipping Polar setup.");
    }

    await configureOptionalLocalSteps(ctx);
    await finalizeEnvFiles(ctx);
    printCompletion(ctx, deployment);
  } catch (error) {
    console.error("");
    console.error(
      redact(
        `Setup failed: ${error instanceof Error ? error.message : String(error)}`,
        ctx.knownSecrets,
      ),
    );
    process.exitCode = 1;
  }
}

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    freshDryRun: false,
    nonInteractive: false,
    yes: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--fresh-dry-run") {
      options.freshDryRun = true;
      continue;
    }
    if (arg === "--non-interactive") {
      options.nonInteractive = true;
      continue;
    }
    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--stub-file") {
      options.stubFile = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--stub-file=")) {
      options.stubFile = arg.slice("--stub-file=".length);
      continue;
    }
    if (arg === "--convex-url") {
      options.convexUrl = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--convex-url=")) {
      options.convexUrl = arg.slice("--convex-url=".length);
      continue;
    }
    if (arg === "--project-name") {
      options.projectName = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--project-name=")) {
      options.projectName = arg.slice("--project-name=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.stubFile === undefined && process.env.JEOMWON_SETUP_STUB_FILE) {
    options.stubFile = process.env.JEOMWON_SETUP_STUB_FILE;
  }
  if (options.freshDryRun && !options.dryRun) {
    throw new Error("--fresh-dry-run requires --dry-run.");
  }

  return options;
}

function readOptionValue(args: string[], index: number, option: string) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: bun setup [--dry-run] [--non-interactive] [--yes]

Options:
  --dry-run              Do not run external commands or write .env.local files.
  --fresh-dry-run        With --dry-run, ignore existing .env.local files.
  --non-interactive      Use defaults and stubs; defer missing credentials.
  --yes, -y              Accept default yes/no answers.
  --stub-file <path>     JSON values for rehearsal.
  --convex-url <url>     Reuse an existing Convex deployment URL.
  --project-name <name>  Convex project name for new provisioning.

Stubs can also be supplied with JEOMWON_SETUP_STUBS as JSON.`);
}

function readStubs(root: string, options: CliOptions): SetupStubs {
  const inline = process.env.JEOMWON_SETUP_STUBS;
  const fromEnv = inline ? (JSON.parse(inline) as SetupStubs) : {};
  if (!options.stubFile) {
    return fromEnv;
  }

  const filePath = path.isAbsolute(options.stubFile)
    ? options.stubFile
    : path.join(root, options.stubFile);
  return {
    ...fromEnv,
    ...readJsonFile<SetupStubs>(filePath),
  };
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function section(title: string) {
  sectionCount += 1;
  const label = style.magenta(
    style.bold(String(sectionCount).padStart(2, "0")),
  );
  console.log("");
  console.log(`${glyph.step} ${label}  ${style.bold(title)}`);
  console.log(`  ${RULE}`);
}

type DomainFeatures = {
  polar: boolean;
  customerAccounts: boolean;
};

async function readDomainFeatures(
  ctx: RuntimeContext,
): Promise<DomainFeatures> {
  if (ctx.stubs.domainFeatures) {
    return {
      polar: ctx.stubs.domainFeatures.polar === true,
      customerAccounts: ctx.stubs.domainFeatures.customerAccounts === true,
    };
  }

  const domainConfigPath = path.join(
    ctx.root,
    "packages/backend/domain.config.ts",
  );
  const moduleUrl = pathToFileURL(domainConfigPath).href;
  const imported = (await import(moduleUrl)) as {
    domainConfig?: {
      features?: { polar?: boolean; customerAccounts?: boolean };
    };
  };

  return {
    polar: imported.domainConfig?.features?.polar === true,
    customerAccounts:
      imported.domainConfig?.features?.customerAccounts === true,
  };
}

function assertEnvLocalIgnored(ctx: RuntimeContext) {
  const gitignorePath = path.join(ctx.root, ".gitignore");
  const gitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";
  const lines = gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.includes(".env*.local") && !lines.includes(".env.local")) {
    throw new Error(".env.local is not covered by .gitignore.");
  }
}

async function configureSiteUrl(ctx: RuntimeContext) {
  const appUrlStep = requireStep(ctx, "app-url");
  await configureLocalDefaults(ctx, appUrlStep);

  const siteStep = requireStep(ctx, "site-url");
  section(siteStep.title);
  const variable = requireVariable(siteStep, "SITE_URL");
  const siteUrl = await getValueForVariable(ctx, variable, {
    prompt: "Public site URL",
    defaultValue: variable.defaultValue ?? "http://localhost:3001",
  });

  await setLocalEnv(ctx, "backend", "SITE_URL", siteUrl);
  return siteUrl;
}

async function configureLocalDefaults(ctx: RuntimeContext, step: StepConfig) {
  section(step.title);
  for (const variable of step.variables) {
    const value = await getValueForVariable(ctx, variable, {
      prompt: variable.details ?? variable.name,
      defaultValue: variable.defaultValue ?? "",
    });
    for (const projectId of variable.projects) {
      if (projectId !== "convex") {
        await setLocalEnv(ctx, projectId, variable.name, value);
      }
    }
  }
}

async function configureConvex(ctx: RuntimeContext): Promise<ConvexDeployment> {
  const step = requireStep(ctx, "convex");
  section(step.title);
  if (step.instructions) {
    console.log(step.instructions);
  }

  const explicitUrl =
    ctx.options.convexUrl ??
    ctx.stubs.convexUrl ??
    stubValue(ctx, "NEXT_PUBLIC_CONVEX_URL") ??
    stubValue(ctx, "CONVEX_URL");
  const existingUrl =
    explicitUrl ??
    readLocalEnv(ctx, "backend").get("CONVEX_URL") ??
    readLocalEnv(ctx, "web").get("NEXT_PUBLIC_CONVEX_URL") ??
    readLocalEnv(ctx, "app").get("NEXT_PUBLIC_CONVEX_URL");

  let convexUrl = existingUrl;
  if (convexUrl) {
    console.log("Convex deployment URL is configured.");
  } else {
    await ensureConvexAuthenticated(ctx);
    const projectName = await getProjectName(ctx);
    if (ctx.options.dryRun) {
      convexUrl = `https://${slugify(projectName)}-dry-run.convex.cloud`;
      console.log("DRY RUN: would run Convex dev provisioning.");
    } else {
      await runInteractiveCommand(ctx, "npx", [
        "convex",
        "dev",
        "--once",
        "--configure",
        "new",
        "--project",
        projectName,
        "--dev-deployment",
        "cloud",
      ]);
      convexUrl = readLocalEnv(ctx, "backend").get("CONVEX_URL");
      if (!convexUrl) {
        throw new Error(
          "Convex provisioning finished but packages/backend/.env.local has no CONVEX_URL.",
        );
      }
    }
  }

  const convexSiteUrl =
    ctx.stubs.convexSiteUrl ?? deriveConvexSiteUrl(validateUrl(convexUrl));

  await setLocalEnv(ctx, "backend", "CONVEX_URL", convexUrl);
  await setLocalEnv(ctx, "web", "NEXT_PUBLIC_CONVEX_URL", convexUrl);
  await setLocalEnv(ctx, "app", "NEXT_PUBLIC_CONVEX_URL", convexUrl);
  await ensureConvexEnv(ctx, "CONVEX_SITE_URL", convexSiteUrl, {
    secret: false,
    overwritePromptKey: "overwrite:CONVEX_SITE_URL",
  });

  console.log(`Convex site URL: ${convexSiteUrl}`);
  return { convexUrl, convexSiteUrl };
}

async function ensureConvexAuthenticated(ctx: RuntimeContext) {
  if (ctx.options.dryRun) {
    if (ctx.stubs.convexAuthenticated === false) {
      console.log("DRY RUN: Convex auth missing; would run npx convex login.");
    } else {
      console.log("DRY RUN: assuming Convex CLI is authenticated.");
    }
    return;
  }

  const configPath = path.join(os.homedir(), ".convex/config.json");
  if (fs.existsSync(configPath)) {
    ui.ok(style.gray("Convex CLI 로그인 확인됨"));
    return;
  }

  const shouldLogin = await promptConfirm(ctx, {
    key: "convex:login",
    message: "Convex CLI is not authenticated. Run npx convex login now?",
    defaultValue: true,
  });

  if (!shouldLogin) {
    throw new Error("Run npx convex login, then rerun bun setup.");
  }

  await runInteractiveCommand(ctx, "npx", ["convex", "login"], ctx.root);

  if (!fs.existsSync(configPath)) {
    throw new Error("Convex login did not create ~/.convex/config.json.");
  }
}

async function getProjectName(ctx: RuntimeContext) {
  if (ctx.options.projectName) {
    return ctx.options.projectName;
  }

  const defaultName = slugify(path.basename(ctx.root));
  return await promptText(ctx, {
    key: "convex:projectName",
    message: "Convex project name",
    defaultValue: defaultName,
    secret: false,
    required: true,
  });
}

async function configureConvexAuth(
  ctx: RuntimeContext,
  deployment: ConvexDeployment,
  siteUrl: string,
) {
  const step = requireStep(ctx, "convex-auth");
  section(step.title);

  const statuses = new Map<string, boolean>();
  for (const name of REQUIRED_CONVEX_AUTH_ENV) {
    statuses.set(name, await isConvexEnvConfigured(ctx, name));
  }

  await ensureConvexEnv(ctx, "CONVEX_SITE_URL", deployment.convexSiteUrl, {
    secret: false,
    overwritePromptKey: "overwrite:CONVEX_SITE_URL",
    alreadyConfigured: statuses.get("CONVEX_SITE_URL"),
  });
  await ensureConvexEnv(ctx, "SITE_URL", siteUrl, {
    secret: false,
    overwritePromptKey: "overwrite:SITE_URL",
    alreadyConfigured: statuses.get("SITE_URL"),
  });

  const jwtConfigured = statuses.get("JWT_PRIVATE_KEY") === true;
  const jwksConfigured = statuses.get("JWKS") === true;
  if (jwtConfigured && jwksConfigured) {
    console.log("JWT_PRIVATE_KEY and JWKS are configured (values hidden).");
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:convex-auth-keys",
      message: "Regenerate and overwrite Convex Auth keys?",
      defaultValue: false,
    });
    if (!overwrite) {
      return;
    }
  }

  if (ctx.options.dryRun && !stubValue(ctx, "JWT_PRIVATE_KEY")) {
    console.log("DRY RUN: would generate RS256 keypair with jose.");
    await ensureConvexEnv(ctx, "JWT_PRIVATE_KEY", "dry-run-private-key", {
      secret: true,
      force: true,
    });
    await ensureConvexEnv(ctx, "JWKS", '{"keys":[{"kty":"RSA"}]}', {
      secret: false,
      force: true,
    });
    return;
  }

  const keys = await generateConvexAuthKeys(ctx);
  await ensureConvexEnv(ctx, "JWT_PRIVATE_KEY", keys.privateKey, {
    secret: true,
    force: true,
  });
  await ensureConvexEnv(ctx, "JWKS", keys.jwks, {
    secret: false,
    force: true,
  });
}

async function generateConvexAuthKeys(ctx: RuntimeContext) {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const privatePem = await exportPKCS8(privateKey);
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  publicJwk.kid = crypto.randomUUID();

  ctx.knownSecrets.add(privatePem);
  return {
    privateKey: privatePem,
    jwks: JSON.stringify({ keys: [publicJwk] }),
  };
}

async function configureGoogleOAuth(
  ctx: RuntimeContext,
  deployment: ConvexDeployment,
) {
  const step = requireStep(ctx, "google-oauth");
  section(step.title);
  if (step.instructions) {
    console.log(step.instructions);
  }
  console.log("1. Google Cloud Console에서 프로젝트를 선택하거나 생성하세요.");
  console.log("2. OAuth 동의 화면을 구성하세요.");
  console.log("3. OAuth client ID를 Web application으로 생성하세요.");
  console.log(
    `Redirect URI: ${deployment.convexSiteUrl}/api/auth/callback/google`,
  );
  console.log(
    "JavaScript origins: http://localhost:3000, http://localhost:3001",
  );

  const variables = [
    requireVariable(step, "AUTH_GOOGLE_ID"),
    requireVariable(step, "AUTH_GOOGLE_SECRET"),
  ];
  const deferredVariables = await getDeferredGoogleOAuthVariables(
    ctx,
    variables,
  );
  if (deferredVariables.length > 0) {
    for (const variable of deferredVariables) {
      logDeferredKey(ctx, variable.name, "Google OAuth console setup needed");
    }
    console.log(
      "Google OAuth deferred (유예됨; console setup required). Keep this redirect URI for later:",
    );
    console.log(`${deployment.convexSiteUrl}/api/auth/callback/google`);
    return;
  }

  await configureConvexSecretVariable(ctx, step, "AUTH_GOOGLE_ID");
  await configureConvexSecretVariable(ctx, step, "AUTH_GOOGLE_SECRET");
}

async function getDeferredGoogleOAuthVariables(
  ctx: RuntimeContext,
  variables: StepVariable[],
) {
  if (ctx.options.dryRun || ctx.options.nonInteractive) {
    return [];
  }

  const missingVariables: StepVariable[] = [];
  for (const variable of variables) {
    if (stubValue(ctx, variable.name) !== undefined) {
      continue;
    }
    if (await isConvexEnvConfigured(ctx, variable.name)) {
      continue;
    }
    missingVariables.push(variable);
  }

  if (missingVariables.length === 0) {
    return [];
  }

  const configure = await promptConfirm(ctx, {
    key: "google-oauth:configure",
    message:
      "Configure Google OAuth now? Choose no to set it up later after Google Console work.",
    defaultValue: false,
  });
  return configure ? [] : missingVariables;
}

async function configureAnonymousLogin(
  ctx: RuntimeContext,
  customerAccounts: boolean,
) {
  const step = requireStep(ctx, "anonymous-login");
  section(step.title);
  const providerBefore = await readConvexEnvValue(ctx, "AUTH_ANONYMOUS_LOGIN");
  const appBefore = readLocalEnv(ctx, "app").get("AUTH_ANONYMOUS_LOGIN");
  assertAnonymousLoginSynchronized(providerBefore, appBefore);

  if (!customerAccounts) {
    console.log(
      "domain.config.features.customerAccounts=false, keeping product anonymous login off.",
    );
    if (isAnonymousLoginOn(providerBefore) || isAnonymousLoginOn(appBefore)) {
      throw new Error("anonymous_login_requires_customer_accounts");
    }
    return;
  }

  const enable = await promptConfirm(ctx, {
    key: "anonymous-login:enable",
    message: "Enable product anonymous login for this deployment?",
    defaultValue: false,
  });

  if (enable) {
    const production = await promptConfirm(ctx, {
      key: "anonymous-login:production-deployment",
      message: "Is this a production deployment?",
      defaultValue: false,
    });
    if (production) {
      await requireProductionAnonymousOptIn(ctx);
    }
  }

  const nextValue = enable ? "1" : "0";
  await ensureConvexEnv(ctx, "AUTH_ANONYMOUS_LOGIN", nextValue, {
    secret: false,
    overwritePromptKey: "overwrite:AUTH_ANONYMOUS_LOGIN",
    force: true,
  });
  await setLocalEnv(ctx, "app", "AUTH_ANONYMOUS_LOGIN", nextValue);
  await verifyAnonymousLoginPostflight(ctx, customerAccounts);
}

async function requireProductionAnonymousOptIn(ctx: RuntimeContext) {
  const key = "anonymous-login:production-opt-in";
  const expected = "ENABLE_PRODUCTION_ANONYMOUS_LOGIN";
  const stub = ctx.stubs.answers?.[key];
  let response = "";

  if (typeof stub === "string") {
    response = stub;
    console.log("Production anonymous login opt-in response received (stub).");
  } else if (!ctx.options.nonInteractive) {
    response = await promptLine(
      `Type ${expected} to enable product anonymous login in production: `,
    );
  }

  if (response !== expected) {
    throw new Error(
      "explicit production opt-in is required for anonymous login",
    );
  }
}

function isAnonymousLoginOn(value: string | undefined) {
  return value === "1";
}

function assertAnonymousLoginSynchronized(
  providerValue: string | undefined,
  appValue: string | undefined,
) {
  if (isAnonymousLoginOn(providerValue) !== isAnonymousLoginOn(appValue)) {
    throw new Error("anonymous_login_config_mismatch");
  }
}

async function verifyAnonymousLoginPostflight(
  ctx: RuntimeContext,
  customerAccounts: boolean,
) {
  const providerValue = await readConvexEnvValue(ctx, "AUTH_ANONYMOUS_LOGIN");
  const appValue = readLocalEnv(ctx, "app").get("AUTH_ANONYMOUS_LOGIN");
  assertAnonymousLoginSynchronized(providerValue, appValue);

  if (isAnonymousLoginOn(providerValue)) {
    if (!customerAccounts) {
      throw new Error("anonymous_login_requires_customer_accounts");
    }
    const allowlist = await readConvexEnvValue(ctx, "JEOMWON_ADMIN_EMAILS");
    requireValidAdminEmails(allowlist);
  }

  console.log(
    "Anonymous login postflight passed (Convex/app synchronized; values hidden).",
  );
}

// JEOMWON_ADMIN_EMAILS is a Convex deployment env var only — it is never written
// to any .env.local and never prefixed NEXT_PUBLIC_, so it cannot reach the
// browser. The backend guard (packages/backend/convex/admin.ts) reads it per call.
// The backend always refuses to infer operator status from sign-in alone. The
// wizard therefore requires the allowlist for every feature configuration.
async function configureAdminEmails(ctx: RuntimeContext) {
  const step = requireStep(ctx, "admin-emails");
  section(step.title);

  const variable = requireVariable(step, "JEOMWON_ADMIN_EMAILS");
  console.log(
    "Only allowlisted, non-anonymous accounts can access operator functions. Values remain hidden.",
  );

  const configured = await isConvexEnvConfigured(ctx, "JEOMWON_ADMIN_EMAILS");
  if (configured) {
    console.log("JEOMWON_ADMIN_EMAILS is configured (value hidden).");
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:JEOMWON_ADMIN_EMAILS",
      message: "Overwrite JEOMWON_ADMIN_EMAILS?",
      defaultValue: false,
    });
    if (!overwrite) {
      const existingValue = await readConvexEnvValue(
        ctx,
        "JEOMWON_ADMIN_EMAILS",
      );
      requireValidAdminEmails(existingValue);
      return;
    }
  }

  const value = await promptText(ctx, {
    key: "JEOMWON_ADMIN_EMAILS",
    message: "Operator emails (comma-separated)",
    defaultValue: variable.defaultValue ?? "",
    secret: true,
    required: true,
  });
  const emails = requireValidAdminEmails(value);

  await ensureConvexEnv(ctx, "JEOMWON_ADMIN_EMAILS", emails, {
    secret: true,
    force: true,
  });
}

// Stored normalized (trimmed, lowercased, de-duplicated). The backend lowercases
// both sides anyway, so this is for legibility in `convex env get`, not matching.
function normalizeAdminEmails(value: string) {
  const emails = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  const invalid = emails.filter((email) => !email.includes("@"));
  if (invalid.length > 0) {
    throw new Error("JEOMWON_ADMIN_EMAILS expects email addresses.");
  }

  return [...new Set(emails)].join(",");
}

function requireValidAdminEmails(value: string | undefined) {
  const emails = normalizeAdminEmails(value ?? "");
  if (!emails) {
    throw new Error("JEOMWON_ADMIN_EMAILS is required.");
  }
  return emails;
}

async function configureResend(ctx: RuntimeContext) {
  const step = requireStep(ctx, "resend");
  section(step.title);
  console.log(step.requiredMessage ?? "Resend can be skipped.");

  const apiKeyConfigured = await isConvexEnvConfigured(ctx, "RESEND_API_KEY");
  if (apiKeyConfigured) {
    console.log("RESEND_API_KEY is configured (value hidden).");
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:RESEND_API_KEY",
      message: "Overwrite RESEND_API_KEY?",
      defaultValue: false,
    });
    if (!overwrite) {
      await maybeConfigureResendSender(ctx, step);
      return;
    }
  } else {
    const configure = await promptConfirm(ctx, {
      key: "resend:configure",
      message: "Configure Resend now?",
      defaultValue: false,
    });
    if (!configure) {
      ui.skip(
        "Resend 건너뜀 — 이메일은 capture 모드로 동작 (나중에 추가 가능)",
      );
      return;
    }
  }

  const apiKey = await promptCredentialVariable(
    ctx,
    requireVariable(step, "RESEND_API_KEY"),
  );
  if (!apiKey) {
    console.log(
      "Resend deferred (유예됨). Email lifecycle remains in capture mode.",
    );
    return;
  }
  await ensureConvexEnv(ctx, "RESEND_API_KEY", apiKey, {
    secret: true,
    force: true,
  });

  const sender = await maybeConfigureResendSender(ctx, step);

  const runProbe = await promptConfirm(ctx, {
    key: "resend:test",
    message: "Send a Resend test email probe?",
    defaultValue: false,
  });
  if (runProbe) {
    const to = await promptText(ctx, {
      key: "resend:testRecipient",
      message: "Test recipient email",
      defaultValue: "",
      secret: false,
      required: true,
    });
    const from =
      sender ??
      stubValue(ctx, "RESEND_SENDER_EMAIL_AUTH") ??
      readLocalEnv(ctx, "backend").get("RESEND_SENDER_EMAIL_AUTH") ??
      "onboarding@resend.dev";
    await probeResend(ctx, apiKey, from, to);
  }
}

async function maybeConfigureResendSender(
  ctx: RuntimeContext,
  step: StepConfig,
) {
  const senderConfigured = await isConvexEnvConfigured(
    ctx,
    "RESEND_SENDER_EMAIL_AUTH",
  );
  if (senderConfigured) {
    console.log("RESEND_SENDER_EMAIL_AUTH is configured.");
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:RESEND_SENDER_EMAIL_AUTH",
      message: "Overwrite RESEND_SENDER_EMAIL_AUTH?",
      defaultValue: false,
    });
    if (!overwrite) {
      return undefined;
    }
  }

  const sender = await promptText(ctx, {
    key: "RESEND_SENDER_EMAIL_AUTH",
    message:
      requireVariable(step, "RESEND_SENDER_EMAIL_AUTH").details ??
      "Resend sender email",
    defaultValue: "",
    secret: false,
    required: false,
  });
  if (!sender) {
    return undefined;
  }

  await ensureConvexEnv(ctx, "RESEND_SENDER_EMAIL_AUTH", sender, {
    secret: false,
    force: true,
  });
  return sender;
}

async function probeResend(
  ctx: RuntimeContext,
  apiKey: string,
  from: string,
  to: string,
) {
  if (ctx.options.dryRun) {
    console.log("DRY RUN: would call Resend email probe.");
    return;
  }

  ctx.knownSecrets.add(apiKey);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Jeomwon setup probe",
      html: "<p>Jeomwon setup probe succeeded.</p>",
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend probe failed with HTTP ${response.status}.`);
  }

  console.log("Resend probe succeeded.");
}

async function configureOpenAI(ctx: RuntimeContext, customerAccounts: boolean) {
  const step = requireStep(ctx, "openai");
  section(step.title);
  console.log(step.requiredMessage ?? "OpenAI can be skipped.");

  // apps/web always hosts the anonymous /api/chat route, so the agent runtime env
  // always lands there. apps/app hosts an authenticated /api/chat route only when
  // features.customerAccounts is on (its route 404s otherwise), so its env is
  // written only then — a flags-off pack's apps/app/.env.local is unchanged.
  const setAgentEnv = async (name: string, value: string) => {
    await setLocalEnv(ctx, "web", name, value);
    if (customerAccounts) {
      await setLocalEnv(ctx, "app", name, value);
    }
  };

  const existing = readLocalEnv(ctx, "web").get("OPENAI_API_KEY");
  if (existing) {
    console.log("OPENAI_API_KEY is configured in apps/web/.env.local.");
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:OPENAI_API_KEY",
      message: "Overwrite OPENAI_API_KEY?",
      defaultValue: false,
    });
    if (!overwrite) {
      await setAgentEnv("AGENT_RUNTIME", "openai");
      return;
    }
  } else {
    const configure = await promptConfirm(ctx, {
      key: "openai:configure",
      message: "Configure OpenAI now?",
      defaultValue: false,
    });
    if (!configure) {
      await setAgentEnv("AGENT_RUNTIME", "mock");
      ui.skip("OpenAI 건너뜀 — AGENT_RUNTIME=mock 사용 (나중에 추가 가능)");
      return;
    }
  }

  const apiKey = await promptCredentialVariable(
    ctx,
    requireVariable(step, "OPENAI_API_KEY"),
  );
  if (!apiKey) {
    await setAgentEnv("AGENT_RUNTIME", "mock");
    console.log("OpenAI deferred (유예됨). AGENT_RUNTIME=mock will be used.");
    return;
  }
  await probeOpenAI(ctx, apiKey);
  await setAgentEnv("OPENAI_API_KEY", apiKey);
  await setAgentEnv("AGENT_RUNTIME", "openai");
}

async function probeOpenAI(ctx: RuntimeContext, apiKey: string) {
  if (ctx.options.dryRun) {
    console.log("DRY RUN: would call OpenAI models probe.");
    return;
  }

  ctx.knownSecrets.add(apiKey);
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI models probe failed with HTTP ${response.status}.`);
  }

  console.log("OpenAI models probe succeeded.");
}

async function configurePolar(
  ctx: RuntimeContext,
  deployment: ConvexDeployment,
) {
  const step = requireStep(ctx, "polar");
  section(step.title);
  if (step.instructions) {
    console.log(step.instructions);
  }
  console.log(`Webhook URL: ${deployment.convexSiteUrl}/polar/events`);
  for (const instruction of step.additionalInstructions ?? []) {
    console.log(instruction);
  }

  await configureConvexSecretVariable(ctx, step, "POLAR_WEBHOOK_SECRET");
  await configureConvexSecretVariable(ctx, step, "POLAR_ORGANIZATION_TOKEN");
}

async function configureOptionalLocalSteps(ctx: RuntimeContext) {
  const handled = new Set<string>(CORE_STEP_ORDER);
  for (const step of ctx.config.steps) {
    if (handled.has(step.id as (typeof CORE_STEP_ORDER)[number])) {
      continue;
    }
    if (step.kind !== "local-env") {
      continue;
    }

    section(step.title);
    const configure = await promptConfirm(ctx, {
      key: `${step.id}:configure`,
      message: `${step.title} 설정을 진행할까요?`,
      defaultValue: false,
    });
    if (!configure) {
      console.log(`${step.title} skipped.`);
      continue;
    }
    await configureLocalDefaults(ctx, step);
  }
}

async function configureConvexSecretVariable(
  ctx: RuntimeContext,
  step: StepConfig,
  name: string,
) {
  const variable = requireVariable(step, name);
  const configured = await isConvexEnvConfigured(ctx, name);
  if (configured) {
    console.log(`${name} is configured (value hidden).`);
    const overwrite = await promptConfirm(ctx, {
      key: `overwrite:${name}`,
      message: `Overwrite ${name}?`,
      defaultValue: false,
    });
    if (!overwrite) {
      return;
    }
  }

  const value = await promptCredentialVariable(ctx, variable);
  if (!value) {
    return;
  }
  await ensureConvexEnv(ctx, name, value, {
    secret: variable.secret === true,
    force: true,
  });
}

async function promptCredentialVariable(
  ctx: RuntimeContext,
  variable: StepVariable,
) {
  const stub = stubValue(ctx, variable.name);
  if (stub !== undefined) {
    ctx.knownSecrets.add(stub);
    console.log(`${variable.name}: using stub value (hidden).`);
    return stub;
  }

  const defaultValue = variable.defaultValue ?? "";
  if (ctx.options.dryRun) {
    console.log(`DRY RUN: would prompt for ${variable.name} (value hidden).`);
    recordDeferredKey(ctx, variable.name);
    return undefined;
  }

  if (ctx.options.nonInteractive) {
    if (defaultValue) {
      ctx.knownSecrets.add(defaultValue);
      return defaultValue;
    }
    logDeferredKey(ctx, variable.name, "missing non-interactive value");
    return undefined;
  }

  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const value = await promptSecret(
    `${variable.details ?? variable.name}${suffix}: `,
  );
  const finalValue = value.trim() || defaultValue;
  if (!finalValue) {
    logDeferredKey(ctx, variable.name, "no value provided");
    return undefined;
  }

  ctx.knownSecrets.add(finalValue);
  return finalValue;
}

async function getValueForVariable(
  ctx: RuntimeContext,
  variable: StepVariable,
  input: {
    prompt: string;
    defaultValue: string;
  },
) {
  return await promptText(ctx, {
    key: variable.name,
    message: input.prompt,
    defaultValue: input.defaultValue,
    secret: variable.secret === true,
    required: variable.required !== false,
  });
}

// CONVEX_SITE_URL and CONVEX_CLOUD_URL are Convex built-in env vars: every
// deployment auto-provides them and `convex env set` rejects them with
// EnvVarNameForbidden (400). Never try to set them.
const CONVEX_BUILT_IN_ENV = new Set(["CONVEX_SITE_URL", "CONVEX_CLOUD_URL"]);

async function ensureConvexEnv(
  ctx: RuntimeContext,
  name: string,
  value: string,
  options: {
    secret: boolean;
    overwritePromptKey?: string;
    alreadyConfigured?: boolean;
    force?: boolean;
  },
) {
  if (CONVEX_BUILT_IN_ENV.has(name)) {
    ui.skip(`${name} — Convex 빌트인(자동 제공), 건너뜀`);
    return;
  }
  if (options.secret) {
    ctx.knownSecrets.add(value);
  }

  const configured =
    options.alreadyConfigured ?? (await isConvexEnvConfigured(ctx, name));
  if (configured && !options.force) {
    console.log(`${name} is configured (value hidden).`);
    const overwrite = await promptConfirm(ctx, {
      key: options.overwritePromptKey ?? `overwrite:${name}`,
      message: `Overwrite ${name}?`,
      defaultValue: false,
    });
    if (!overwrite) {
      return;
    }
  }

  if (ctx.options.dryRun) {
    ctx.convexEnvWrites.set(name, value);
    console.log(`DRY RUN: would set Convex env ${name} (value hidden).`);
    return;
  }

  const result = await runCommand(ctx, "npx", [
    "convex",
    "env",
    "set",
    "--",
    name,
    value,
  ]);

  if (result.code !== 0) {
    throw new Error(`Failed to set Convex env ${name}.`);
  }

  const verified = await isConvexEnvConfigured(ctx, name);
  if (!verified) {
    throw new Error(`Convex env ${name} was not readable after set.`);
  }

  ctx.convexEnvWrites.set(name, value);

  ui.ok(`${name} ${style.gray("설정·검증됨 (값 숨김)")}`);
}

async function isConvexEnvConfigured(ctx: RuntimeContext, name: string) {
  if (ctx.convexEnvWrites.has(name)) {
    return true;
  }
  if (ctx.options.dryRun) {
    const value = ctx.stubs.existingConvexEnv?.[name];
    return value === true || (typeof value === "string" && value.length > 0);
  }

  const result = await runCommand(ctx, "npx", ["convex", "env", "get", name]);
  return result.code === 0;
}

async function readConvexEnvValue(ctx: RuntimeContext, name: string) {
  const pending = ctx.convexEnvWrites.get(name);
  if (pending !== undefined) {
    return pending;
  }

  if (ctx.options.dryRun) {
    const stub = ctx.stubs.existingConvexEnv?.[name];
    if (typeof stub === "string") {
      return stub.trim();
    }
    return stub === true ? "<configured>" : undefined;
  }

  const result = await runCommand(ctx, "npx", ["convex", "env", "get", name]);
  return result.code === 0 ? result.stdout.trim() : undefined;
}

async function setLocalEnv(
  ctx: RuntimeContext,
  projectId: string,
  name: string,
  value: string,
) {
  const project = getProject(ctx, projectId);
  if (!project.envFile) {
    throw new Error(`Project ${projectId} has no envFile.`);
  }

  if (isLikelySecretName(name)) {
    ctx.knownSecrets.add(value);
  }

  let pending = ctx.localEnvWrites.get(projectId);
  if (!pending) {
    pending = new Map();
    ctx.localEnvWrites.set(projectId, pending);
  }
  pending.set(name, value);

  if (ctx.options.dryRun) {
    console.log(`DRY RUN: would write ${name} to ${project.envFile}.`);
    return;
  }

  const envPath = path.join(ctx.root, project.envFile);
  const current = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8")
    : "";
  const next = upsertEnvText(current, new Map([[name, value]]));
  fs.writeFileSync(envPath, next);
  console.log(`${project.envFile}: ${name} configured.`);
}

async function finalizeEnvFiles(ctx: RuntimeContext) {
  section("Finish");
  const missingByFile = new Map<string, string[]>();

  for (const project of ctx.config.projects) {
    if (
      project.type !== "envFile" ||
      !project.envFile ||
      !project.exampleFile
    ) {
      continue;
    }

    const envPath = path.join(ctx.root, project.envFile);
    const examplePath = path.join(ctx.root, project.exampleFile);
    const example = fs.existsSync(examplePath)
      ? fs.readFileSync(examplePath, "utf8")
      : "";
    const exampleKeys = parseEnvKeys(example);
    const existingText = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, "utf8")
      : example;

    const updates = new Map<string, string>();
    for (const key of exampleKeys) {
      if (!parseEnv(existingText).has(key)) {
        updates.set(key, "");
      }
    }

    const pending = ctx.localEnvWrites.get(project.id);
    if (pending) {
      for (const [key, value] of pending) {
        updates.set(key, value);
      }
    }

    if (ctx.options.dryRun) {
      console.log(`DRY RUN: would ensure ${project.envFile}.`);
    } else if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, upsertEnvText(example, updates));
      console.log(`${project.envFile} created from ${project.exampleFile}.`);
    } else if (updates.size > 0) {
      fs.writeFileSync(envPath, upsertEnvText(existingText, updates));
      console.log(`${project.envFile} updated with missing keys.`);
    } else {
      console.log(`${project.envFile} already has example keys.`);
    }

    const finalValues = new Map([...parseEnv(existingText), ...updates]);
    for (const [key, value] of readLocalEnv(ctx, project.id)) {
      finalValues.set(key, value);
    }
    const missing = exampleKeys.filter((key) => !finalValues.has(key));
    if (missing.length > 0) {
      missingByFile.set(project.envFile, missing);
    }
  }

  if (missingByFile.size > 0) {
    console.log("Missing local env keys:");
    for (const [file, keys] of missingByFile) {
      console.log(`- ${file}: ${keys.join(", ")}`);
    }
  } else {
    console.log("No missing local env keys from .env.example files.");
  }
}

function printCompletion(ctx: RuntimeContext, deployment: ConvexDeployment) {
  console.log("");
  console.log(`  ${glyph.ok} ${style.green(style.bold("설정 완료"))}`);
  console.log(`  ${RULE}`);
  ui.kv("Convex", deployment.convexUrl);
  printDeferredSummary(ctx);
  console.log(`  ${RULE}`);
  console.log(`  ${style.bold("다음 단계")} ${style.gray("— 바로 써보기")}`);
  console.log(
    `  ${glyph.arrow} ${style.cyan("bun dev")}       ${style.gray("앱 실행 — 관리자 :3000 · 예약 챗 :3001")}`,
  );
  console.log(
    `                ${style.gray("localhost 로 접속해 예약 챗을 바로 써보세요.")}`,
  );
  console.log("");
  console.log(`  ${style.bold("검증")} ${style.gray("— 원할 때")}`);
  console.log(
    `  ${glyph.arrow} ${style.cyan("bun run qa")}    ${style.gray("스모크 QA — dev 배포 자동 준비 후 한 번에 실행")}`,
  );
  console.log(
    `                ${style.gray("mock+capture 로 격리 실행하고, 끝나면 원래대로 되돌립니다.")}`,
  );
  console.log(`  ${RULE}`);
  console.log(
    `  ${style.gray("접속은 반드시 ")}${style.bold("localhost")}${style.gray(" — 127.0.0.1은 Next 16 dev에서 쓰지 마세요.")}`,
  );
}

function printDeferredSummary(ctx: RuntimeContext) {
  if (ctx.deferredKeys.size === 0) {
    ui.kv("Keys", style.green("모두 설정됨"));
    return;
  }

  ui.kv(
    "Later",
    `${ctx.deferredKeys.size}개 키 미설정 ${style.gray("(값 숨김)")}`,
  );
  for (const key of [...ctx.deferredKeys].sort()) {
    console.log(`    ${glyph.skip} ${style.gray(key)}`);
  }
  console.log(
    `    ${style.gray("나중에 ")}${style.cyan("bun setup")}${style.gray(" 을 다시 실행하면 됩니다 — 이미 끝난 단계는 건너뜁니다.")}`,
  );
}

function recordDeferredKey(ctx: RuntimeContext, name: string) {
  ctx.deferredKeys.add(name);
}

function logDeferredKey(ctx: RuntimeContext, name: string, reason: string) {
  if (!ctx.deferredKeys.has(name)) {
    console.log(`${name} deferred (유예됨; ${reason}; value hidden).`);
  }
  recordDeferredKey(ctx, name);
}

async function promptConfirm(
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

async function promptText(
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
    throw new Error(`Missing required non-interactive value: ${input.key}`);
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
    throw new Error(`${input.key} is required.`);
  }
  if (input.secret && finalValue) {
    ctx.knownSecrets.add(finalValue);
    ui.ok(
      `${style.gray(input.key)} 입력됨 ${style.gray(`(${finalValue.length}자 · 값 숨김)`)}`,
    );
  }
  return finalValue;
}

function stubValue(ctx: RuntimeContext, key: string) {
  return ctx.stubs.values?.[key] ?? process.env[`JEOMWON_SETUP_${key}`];
}

async function promptLine(message: string) {
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

async function promptSecret(message: string) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    return await promptLine(message);
  }

  process.stdout.write(message);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return await new Promise<string>((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
    };

    const onData = (chunk: string) => {
      if (chunk === "\u0003") {
        cleanup();
        process.stdout.write("\n");
        reject(new Error("Interrupted."));
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
        USE_COLOR ? paint("36", dots) : "*".repeat(chunk.length),
      );
    };

    process.stdin.on("data", onData);
  });
}

async function runInteractiveCommand(
  ctx: RuntimeContext,
  command: string,
  args: string[],
  cwd = getConvexWorkingDirectory(ctx),
) {
  if (ctx.options.dryRun) {
    console.log(`DRY RUN: would run ${command} ${args.join(" ")}.`);
    return;
  }

  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
  });

  if (code !== 0) {
    throw new Error(`${command} exited with code ${code}.`);
  }
}

async function runCommand(
  ctx: RuntimeContext,
  command: string,
  args: string[],
) {
  if (ctx.options.dryRun) {
    return { code: 0, stdout: "", stderr: "" };
  }

  const cwd = getConvexWorkingDirectory(ctx);
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: redact(stdout, ctx.knownSecrets),
        stderr: redact(stderr, ctx.knownSecrets),
      });
    });
  });
}

function getConvexWorkingDirectory(ctx: RuntimeContext) {
  const project = getProject(ctx, "convex");
  return path.join(ctx.root, project.workingDirectory ?? "packages/backend");
}

function getProject(ctx: RuntimeContext, id: string) {
  const project = ctx.projects.get(id);
  if (!project) {
    throw new Error(`Unknown setup project: ${id}`);
  }
  return project;
}

function requireStep(ctx: RuntimeContext, id: string) {
  const step = ctx.config.steps.find((candidate) => candidate.id === id);
  if (!step) {
    throw new Error(`Missing setup step: ${id}`);
  }
  return step;
}

function requireVariable(step: StepConfig, name: string) {
  const variable = step.variables.find((candidate) => candidate.name === name);
  if (!variable) {
    throw new Error(`Missing setup variable ${name} in ${step.id}.`);
  }
  return variable;
}

function readLocalEnv(ctx: RuntimeContext, projectId: string) {
  const project = getProject(ctx, projectId);
  const fromStub = ctx.stubs.existingLocalEnv?.[projectId];
  const values = new Map<string, string>();
  if (fromStub) {
    for (const [key, value] of Object.entries(fromStub)) {
      values.set(key, value);
    }
  }

  if (project.envFile && !ctx.options.freshDryRun) {
    const envPath = path.join(ctx.root, project.envFile);
    if (fs.existsSync(envPath)) {
      for (const [key, value] of parseEnv(fs.readFileSync(envPath, "utf8"))) {
        values.set(key, value);
      }
    }
  }

  const pending = ctx.localEnvWrites.get(projectId);
  if (pending) {
    for (const [key, value] of pending) {
      values.set(key, value);
    }
  }
  return values;
}

function parseEnv(text: string) {
  const values = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equals = line.indexOf("=");
    if (equals === -1) {
      continue;
    }
    const key = line.slice(0, equals).trim();
    const value = line.slice(equals + 1).trim();
    values.set(key, unquoteEnvValue(value));
  }
  return values;
}

function parseEnvKeys(text: string) {
  return [...parseEnv(text).keys()];
}

function upsertEnvText(text: string, updates: Map<string, string>) {
  const lines = text ? text.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const trimmed = line.trim();
    const equals = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || equals === -1) {
      return line;
    }
    const key = trimmed.slice(0, equals).trim();
    if (!updates.has(key)) {
      return line;
    }
    seen.add(key);
    return `${key}=${quoteEnvValue(updates.get(key) ?? "")}`;
  });

  for (const [key, value] of updates) {
    if (!seen.has(key)) {
      if (next.length > 0 && next[next.length - 1] !== "") {
        next.push("");
      }
      next.push(`${key}=${quoteEnvValue(value)}`);
    }
  }

  return `${next.join("\n").replace(/\n+$/, "")}\n`;
}

function quoteEnvValue(value: string) {
  if (!value) {
    return "";
  }
  if (/[\s"'#]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function validateUrl(value: string) {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
}

function deriveConvexSiteUrl(convexUrl: string) {
  const url = new URL(convexUrl);
  if (!url.hostname.endsWith(".convex.cloud")) {
    throw new Error(
      `Cannot derive Convex site URL from ${convexUrl}. Expected *.convex.cloud.`,
    );
  }
  url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "jeomwon";
}

function isLikelySecretName(name: string) {
  return /SECRET|TOKEN|PRIVATE|API_KEY|OPENAI_API_KEY/i.test(name);
}

function redact(value: string, secrets: Set<string>) {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.split(secret).join("[hidden]");
    }
  }
  return redacted;
}
