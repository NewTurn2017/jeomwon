import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import {
  deriveConvexSiteUrl,
  getProject,
  readJsonFile,
  requireStep,
  slugify,
  validateUrl,
} from "./config";
import { readLocalEnv, setLocalEnv } from "./env-files";
import { localized } from "./locales";
import { promptConfirm, stubValue } from "./prompts";
import type { CommandResult, ConvexDeployment, RuntimeContext } from "./types";
import { SetupFailure } from "./types";
import { redact, section, style, tr, ui } from "./ui";

const REQUIRED_CONVEX_AUTH_ENV = [
  "JWT_PRIVATE_KEY",
  "JWKS",
  "CONVEX_SITE_URL",
  "SITE_URL",
] as const;

const activeChildren = new Set<ChildProcess>();
export function cleanupConvexCommands() {
  for (const child of activeChildren) child.kill("SIGTERM");
  activeChildren.clear();
}

export async function assertSetupPrerequisites(ctx: RuntimeContext) {
  section(tr("사전 조건", "Prerequisites"));

  const packageJson = readJsonFile<{
    packageManager?: string;
  }>(path.join(ctx.root, "package.json"));
  const backendPackageJson = readJsonFile<{
    dependencies?: Record<string, string>;
  }>(path.join(ctx.root, "packages/backend/package.json"));
  const expectedBunVersion =
    packageJson.packageManager?.match(/^bun@(.+)$/)?.[1];
  const expectedConvexVersion =
    backendPackageJson.dependencies?.convex ?? "repository dependency";
  const actualBunVersion = process.versions.bun;
  if (!actualBunVersion) {
    throw new SetupFailure(
      "prerequisite_missing",
      localized(
        ctx.locale,
        "bun setup은 Bun 런타임에서 실행해야 합니다.",
        "bun setup must run with the Bun runtime.",
      ),
      [
        localized(
          ctx.locale,
          "https://bun.sh 에서 Bun을 설치하세요.",
          "Install Bun from https://bun.sh.",
        ),
        localized(
          ctx.locale,
          "bun setup을 다시 실행하세요.",
          "Run bun setup again.",
        ),
      ],
    );
  }
  if (expectedBunVersion && actualBunVersion !== expectedBunVersion) {
    throw new SetupFailure(
      "prerequisite_missing",
      localized(
        ctx.locale,
        `Bun ${expectedBunVersion}이 필요하지만 ${actualBunVersion}이 실행 중입니다.`,
        `Bun ${expectedBunVersion} is required, but ${actualBunVersion} is running.`,
      ),
      [
        localized(
          ctx.locale,
          `Bun ${expectedBunVersion}을 설치하거나 활성화하세요.`,
          `Install or activate Bun ${expectedBunVersion}.`,
        ),
        localized(
          ctx.locale,
          "bun install --frozen-lockfile을 실행하세요.",
          "Run bun install --frozen-lockfile.",
        ),
        localized(
          ctx.locale,
          "bun setup을 다시 실행하세요.",
          "Run bun setup again.",
        ),
      ],
    );
  }
  ui.ok(`Bun ${actualBunVersion}`);

  if (ctx.options.dryRun) {
    ui.info(
      tr(
        "DRY RUN: Convex CLI 버전과 로그인 상태를 실제로 변경하지 않습니다.",
        "DRY RUN: Convex CLI version and authentication are not changed.",
      ),
    );
    await ensureConvexAuthenticated(ctx);
    return;
  }

  const result = await runConvexCommand(ctx, ["--version"]);
  if (result.code !== 0) {
    throw classifyConvexCommandFailure(
      ctx.locale,
      localized(ctx.locale, "Convex CLI 확인", "Convex CLI check"),
      result,
    );
  }
  const version = result.stdout.trim().match(/\d+\.\d+\.\d+/)?.[0];
  if (!version) {
    throw new SetupFailure(
      "prerequisite_missing",
      localized(
        ctx.locale,
        "설치된 Convex CLI 버전을 확인할 수 없습니다.",
        "The installed Convex CLI version could not be determined.",
      ),
      [
        localized(
          ctx.locale,
          "bun install --frozen-lockfile을 실행하세요.",
          "Run bun install --frozen-lockfile.",
        ),
        localized(
          ctx.locale,
          "bunx convex --version으로 CLI를 확인하세요.",
          "Check the CLI with bunx convex --version.",
        ),
        localized(
          ctx.locale,
          "bun setup을 다시 실행하세요.",
          "Run bun setup again.",
        ),
      ],
    );
  }
  if (!versionSatisfiesDeclaredRange(version, expectedConvexVersion)) {
    throw new SetupFailure(
      "prerequisite_missing",
      localized(
        ctx.locale,
        `Convex CLI ${expectedConvexVersion}가 필요하지만 ${version}이 실행 중입니다.`,
        `Convex CLI ${expectedConvexVersion} is required, but ${version} is running.`,
      ),
      [
        localized(
          ctx.locale,
          "bun install --frozen-lockfile을 실행하세요.",
          "Run bun install --frozen-lockfile.",
        ),
        localized(
          ctx.locale,
          "bunx convex --version으로 CLI를 다시 확인하세요.",
          "Recheck the CLI with bunx convex --version.",
        ),
        localized(
          ctx.locale,
          "bun setup을 다시 실행하세요.",
          "Run bun setup again.",
        ),
      ],
    );
  }
  ui.ok(`Convex CLI ${version}`);
  await ensureConvexAuthenticated(ctx);
}

export function versionSatisfiesDeclaredRange(
  actual: string,
  declared: string,
) {
  const actualParts = actual.split(".").map(Number);
  const minimumText = declared.match(/\d+\.\d+\.\d+/)?.[0];
  if (!minimumText) {
    return false;
  }
  const minimumParts = minimumText.split(".").map(Number);
  const [actualMajor, actualMinor, actualPatch] = actualParts;
  const [minimumMajor, minimumMinor, minimumPatch] = minimumParts;
  if (
    actualMajor === undefined ||
    actualMinor === undefined ||
    actualPatch === undefined ||
    minimumMajor === undefined ||
    minimumMinor === undefined ||
    minimumPatch === undefined
  ) {
    return false;
  }
  if (declared.startsWith("^") && actualMajor !== minimumMajor) {
    return false;
  }
  if (
    declared.startsWith("~") &&
    (actualMajor !== minimumMajor || actualMinor !== minimumMinor)
  ) {
    return false;
  }
  if (!declared.startsWith("^") && !declared.startsWith("~")) {
    return actual === minimumText;
  }
  return (
    actualMajor > minimumMajor ||
    (actualMajor === minimumMajor && actualMinor > minimumMinor) ||
    (actualMajor === minimumMajor &&
      actualMinor === minimumMinor &&
      actualPatch >= minimumPatch)
  );
}
export async function configureConvex(
  ctx: RuntimeContext,
): Promise<ConvexDeployment> {
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
    readLocalEnv(ctx, "app").get("NEXT_PUBLIC_CONVEX_URL");

  let convexUrl = existingUrl;
  if (convexUrl) {
    console.log(
      localized(
        ctx.locale,
        "Convex deployment URL이 설정되어 있습니다.",
        "Convex deployment URL is configured.",
      ),
    );
  } else {
    const projectName = await getProjectName(ctx);
    if (ctx.options.dryRun) {
      convexUrl = `https://${slugify(projectName)}-dry-run.convex.cloud`;
      console.log(
        localized(
          ctx.locale,
          "DRY RUN: Convex 개발 배포를 프로비저닝할 예정입니다.",
          "DRY RUN: would run Convex dev provisioning.",
        ),
      );
    } else {
      const result = await runVisibleConvexCommand(ctx, [
        "dev",
        "--once",
        "--configure",
        "new",
        "--project",
        projectName,
        "--dev-deployment",
        "cloud",
      ]);
      if (result.code !== 0) {
        throw classifyConvexCommandFailure(
          ctx.locale,
          localized(
            ctx.locale,
            "Convex deployment 생성",
            "Convex deployment creation",
          ),
          result,
        );
      }
      convexUrl = readLocalEnv(ctx, "backend").get("CONVEX_URL");
      if (!convexUrl) {
        throw new SetupFailure(
          "product_failure",
          localized(
            ctx.locale,
            "Convex deployment 생성 후 packages/backend/.env.local의 CONVEX_URL을 자동 확인하지 못했습니다.",
            "CONVEX_URL could not be read automatically from packages/backend/.env.local after creating the Convex deployment.",
          ),
          [
            localized(
              ctx.locale,
              "수동 환경변수 입력으로 우회하지 마세요.",
              "Do not bypass setup with manual environment input.",
            ),
            localized(
              ctx.locale,
              "생성 로그를 확인한 뒤 bun setup을 다시 실행하세요.",
              "Check the creation log, then run bun setup again.",
            ),
          ],
        );
      }
    }
  }

  const convexSiteUrl =
    ctx.stubs.convexSiteUrl ?? deriveConvexSiteUrl(validateUrl(convexUrl));

  await setLocalEnv(ctx, "backend", "CONVEX_URL", convexUrl);
  await setLocalEnv(ctx, "app", "NEXT_PUBLIC_CONVEX_URL", convexUrl);
  await ensureConvexEnv(ctx, "CONVEX_SITE_URL", convexSiteUrl, {
    secret: false,
    overwritePromptKey: "overwrite:CONVEX_SITE_URL",
  });

  console.log(`Convex site URL: ${convexSiteUrl}`);
  return { convexUrl, convexSiteUrl };
}

export async function ensureConvexAuthenticated(ctx: RuntimeContext) {
  if (ctx.options.dryRun) {
    if (ctx.stubs.convexAuthenticated === false) {
      throw new SetupFailure(
        "prerequisite_unauthenticated",
        localized(
          ctx.locale,
          "Convex CLI 로그인이 필요합니다.",
          "Convex CLI authentication is required.",
        ),
        [
          localized(
            ctx.locale,
            "bunx convex login을 실행하세요.",
            "Run bunx convex login.",
          ),
          localized(
            ctx.locale,
            "로그인 완료 후 bun setup을 다시 실행하세요.",
            "Run bun setup again after login completes.",
          ),
        ],
      );
    } else {
      console.log(
        localized(
          ctx.locale,
          "DRY RUN: Convex CLI가 인증되었다고 가정합니다.",
          "DRY RUN: assuming Convex CLI is authenticated.",
        ),
      );
    }
    return;
  }

  const configPath = path.join(os.homedir(), ".convex/config.json");
  if (fs.existsSync(configPath)) {
    ui.ok(
      style.gray(
        localized(
          ctx.locale,
          "Convex CLI 로그인 확인됨",
          "Convex CLI authentication confirmed",
        ),
      ),
    );
    return;
  }

  throw new SetupFailure(
    "prerequisite_unauthenticated",
    localized(
      ctx.locale,
      "Convex CLI 로그인 정보를 찾지 못했습니다.",
      "Convex CLI authentication information was not found.",
    ),
    [
      localized(
        ctx.locale,
        "bunx convex login을 실행하세요.",
        "Run bunx convex login.",
      ),
      localized(
        ctx.locale,
        "로그인 완료 후 bun setup을 다시 실행하세요.",
        "Run bun setup again after login completes.",
      ),
    ],
  );
}

export async function getProjectName(ctx: RuntimeContext) {
  if (ctx.options.projectName) {
    return ctx.options.projectName;
  }

  const projectName = slugify(path.basename(ctx.root));
  ui.ok(
    tr(
      `Convex project name 자동 결정: ${projectName}`,
      `Convex project name selected automatically: ${projectName}`,
    ),
  );
  return projectName;
}

export async function configureConvexAuth(
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

  const jwtConfigured = statuses.get("JWT_PRIVATE_KEY") === true;
  const jwksConfigured = statuses.get("JWKS") === true;
  if (jwtConfigured !== jwksConfigured) {
    throw new SetupFailure(
      "product_failure",
      "convex_auth_key_pair_incomplete",
      [
        localized(
          ctx.locale,
          "Convex Auth 키 값을 모두 복원한 뒤 bun setup을 다시 실행하세요.",
          "Restore both Convex Auth key values, then run bun setup again.",
        ),
      ],
    );
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

  if (jwtConfigured && jwksConfigured) {
    console.log(
      localized(
        ctx.locale,
        "JWT_PRIVATE_KEY와 JWKS가 설정되어 있습니다 (값 숨김).",
        "JWT_PRIVATE_KEY and JWKS are configured (values hidden).",
      ),
    );
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:convex-auth-keys",
      message: localized(
        ctx.locale,
        "Convex Auth 키를 다시 생성하고 덮어쓸까요?",
        "Regenerate and overwrite Convex Auth keys?",
      ),
      defaultValue: false,
    });
    if (!overwrite) {
      return;
    }
  }

  if (ctx.options.dryRun && !stubValue(ctx, "JWT_PRIVATE_KEY")) {
    console.log(
      localized(
        ctx.locale,
        "DRY RUN: jose로 RS256 키 쌍을 생성할 예정입니다.",
        "DRY RUN: would generate RS256 keypair with jose.",
      ),
    );
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

export async function generateConvexAuthKeys(ctx: RuntimeContext) {
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
const CONVEX_BUILT_IN_ENV = new Set(["CONVEX_SITE_URL", "CONVEX_CLOUD_URL"]);

export async function ensureConvexEnv(
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
    ui.skip(
      tr(
        `${name} — Convex 빌트인(자동 제공), 건너뜀`,
        `${name} - provided by Convex; skipped`,
      ),
    );
    return;
  }
  if (options.secret) {
    ctx.knownSecrets.add(value);
  }

  const configured =
    options.alreadyConfigured ?? (await isConvexEnvConfigured(ctx, name));
  if (configured && !options.force) {
    console.log(
      localized(
        ctx.locale,
        `${name}이 설정되어 있습니다 (값 숨김).`,
        `${name} is configured (value hidden).`,
      ),
    );
    const overwrite = await promptConfirm(ctx, {
      key: options.overwritePromptKey ?? `overwrite:${name}`,
      message: localized(
        ctx.locale,
        `${name}을 덮어쓸까요?`,
        `Overwrite ${name}?`,
      ),
      defaultValue: false,
    });
    if (!overwrite) {
      return;
    }
  }

  if (ctx.options.dryRun) {
    ctx.convexEnvWrites.set(name, value);
    console.log(
      `[convex_env_set:${name}] ${localized(
        ctx.locale,
        `DRY RUN: Convex env ${name}을 설정할 예정입니다 (값 숨김).`,
        `DRY RUN: would set Convex env ${name} (value hidden).`,
      )}`,
    );
    return;
  }

  const result = await runConvexCommand(ctx, ["env", "set", "--", name, value]);

  if (result.code !== 0) {
    throw classifyConvexCommandFailure(
      ctx.locale,
      localized(
        ctx.locale,
        `Convex env ${name} 설정`,
        `Convex env ${name} configuration`,
      ),
      result,
    );
  }

  const verified = await isConvexEnvConfigured(ctx, name);
  if (!verified) {
    throw new Error(
      localized(
        ctx.locale,
        `Convex env ${name}을 설정한 후 읽을 수 없습니다.`,
        `Convex env ${name} was not readable after set.`,
      ),
    );
  }

  ctx.convexEnvWrites.set(name, value);

  ui.ok(
    `[convex_env_set:${name}] ${name} ${style.gray(
      localized(
        ctx.locale,
        "설정 및 검증됨 (값 숨김)",
        "configured and verified (value hidden)",
      ),
    )}`,
  );
}

export async function isConvexEnvConfigured(ctx: RuntimeContext, name: string) {
  if (ctx.convexEnvWrites.has(name)) {
    return true;
  }
  if (ctx.options.dryRun) {
    const value = ctx.stubs.existingConvexEnv?.[name];
    return value === true || (typeof value === "string" && value.length > 0);
  }

  const result = await runConvexCommand(ctx, ["env", "get", name]);
  return result.code === 0;
}

export async function readConvexEnvValue(ctx: RuntimeContext, name: string) {
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

  const result = await runConvexCommand(ctx, ["env", "get", name]);
  return result.code === 0 ? result.stdout.trim() : undefined;
}
export async function runVisibleConvexCommand(
  ctx: RuntimeContext,
  args: string[],
): Promise<CommandResult> {
  if (ctx.options.dryRun) {
    console.log(`DRY RUN: would run bunx convex ${args.join(" ")}.`);
    return { code: 0, stdout: "", stderr: "" };
  }

  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(process.execPath, ["x", "convex", ...args], {
      cwd: getConvexWorkingDirectory(ctx),
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
    });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const value = chunk.toString("utf8");
      stdout += value;
      process.stdout.write(redact(value, ctx.knownSecrets));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const value = chunk.toString("utf8");
      stderr += value;
      process.stderr.write(redact(value, ctx.knownSecrets));
    });
    child.on("error", (error) => {
      activeChildren.delete(child);
      reject(error);
    });
    child.on("close", (code) => {
      activeChildren.delete(child);
      resolve({
        code: code ?? 1,
        stdout: redact(stdout, ctx.knownSecrets),
        stderr: redact(stderr, ctx.knownSecrets),
      });
    });
  });
}

export async function runConvexCommand(ctx: RuntimeContext, args: string[]) {
  return await runCommand(ctx, process.execPath, ["x", "convex", ...args]);
}

export function classifyConvexCommandFailure(
  locale: RuntimeContext["locale"],
  phase: string,
  result: CommandResult,
): SetupFailure {
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (
    output.includes("not logged in") ||
    output.includes("convex login") ||
    output.includes("authentication")
  ) {
    return new SetupFailure(
      "prerequisite_unauthenticated",
      localized(
        locale,
        `${phase} 중 Convex 인증이 거부되었습니다.`,
        `Convex authentication was rejected during ${phase}.`,
      ),
      [
        localized(
          locale,
          "bunx convex login을 실행하세요.",
          "Run bunx convex login.",
        ),
        localized(
          locale,
          "로그인 완료 후 bun setup을 다시 실행하세요.",
          "Run bun setup again after login completes.",
        ),
      ],
    );
  }
  if (
    /(network|fetch failed|econn|enotfound|etimedout|socket|permission|forbidden|quota|rate limit)/i.test(
      output,
    )
  ) {
    return new SetupFailure(
      "external_environment",
      localized(
        locale,
        `${phase} 중 네트워크, 권한 또는 deployment quota 오류가 발생했습니다.`,
        `A network, permission, or deployment quota error occurred during ${phase}.`,
      ),
      [
        localized(
          locale,
          "네트워크 연결, Convex 팀 권한 및 deployment quota를 확인하세요.",
          "Check the network connection, Convex team permissions, and deployment quota.",
        ),
        localized(
          locale,
          "외부 환경이 복구된 뒤 bun setup을 다시 실행하세요.",
          "Run bun setup again after the external environment recovers.",
        ),
      ],
    );
  }
  return new SetupFailure(
    "product_failure",
    localized(
      locale,
      `${phase} 자동화가 실패했습니다 (exit ${result.code}).`,
      `${phase} automation failed (exit ${result.code}).`,
    ),
    [
      localized(
        locale,
        "수동 명령이나 환경변수 편집으로 우회하지 마세요.",
        "Do not bypass setup with manual commands or environment edits.",
      ),
      localized(
        locale,
        "출력된 Convex 오류를 확인한 뒤 bun setup을 다시 실행하세요.",
        "Check the reported Convex error, then run bun setup again.",
      ),
    ],
  );
}

export async function runCommand(
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
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      activeChildren.delete(child);
      reject(error);
    });
    child.on("close", (code) => {
      activeChildren.delete(child);
      resolve({
        code: code ?? 1,
        stdout: redact(stdout, ctx.knownSecrets),
        stderr: redact(stderr, ctx.knownSecrets),
      });
    });
  });
}

export function getConvexWorkingDirectory(ctx: RuntimeContext) {
  const project = getProject(ctx, "convex");
  return path.join(ctx.root, project.workingDirectory ?? "packages/backend");
}
