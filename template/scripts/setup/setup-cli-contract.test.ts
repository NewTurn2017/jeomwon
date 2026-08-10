import { afterEach, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readSetupConfig } from "./config";
import { cleanupConvexCommands, runCommand } from "./convex";
import { atomicWriteEnvFile, parseEnv, upsertEnvText } from "./env-files";
import { resolveLocale } from "./locales";
import { parseCliOptions } from "./options";
import type { RuntimeContext, StepVariable } from "./types";
import { contentWidth, displayWidth, stripAnsi } from "./ui";

const templateRoot = existsSync(path.join(process.cwd(), "setup-config.json"))
  ? process.cwd()
  : path.join(process.cwd(), "template");
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function tempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "jeomwon setup contract "));
  tempRoots.push(root);
  return root;
}

function setupFiles(root: string) {
  mkdirSync(path.join(root, "nested"), { recursive: true });
  const target = path.join(root, "nested", ".env.local");
  writeFileSync(target, "OLD=bytes\n", { mode: 0o640 });
  return target;
}

function tempNames(target: string) {
  return readdirSync(path.dirname(target)).filter((name) =>
    name.startsWith(`${path.basename(target)}.tmp-`),
  );
}

function thrownMessage(callback: () => void) {
  try {
    callback();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const setupConfigText = readFileSync(
  path.join(templateRoot, "setup-config.json"),
  "utf8",
);

function writeSetupConfig(contents: string) {
  const configPath = path.join(tempRoot(), "setup-config.json");
  writeFileSync(configPath, contents);
  return configPath;
}

function runWithConfig(contents: string) {
  return spawnSync(
    process.execPath,
    [
      "scripts/setup/index.ts",
      "--config-file",
      writeSetupConfig(contents),
      "--dry-run",
      "--fresh-dry-run",
      "--non-interactive",
      "--lang",
      "en",
    ],
    {
      cwd: templateRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "" },
    },
  );
}

function withGoogleVariables(
  transform: (variables: readonly StepVariable[]) => readonly StepVariable[],
) {
  const config = readSetupConfig(path.join(templateRoot, "setup-config.json"));
  return JSON.stringify({
    ...config,
    steps: config.steps.map((step) =>
      step.id === "google-oauth"
        ? { ...step, variables: transform(step.variables) }
        : step,
    ),
  });
}

const oauthFailureStubs = JSON.stringify({
  values: {
    AUTH_GOOGLE_ID: "client-id",
    AUTH_GOOGLE_SECRET: "color-matrix-secret-sentinel",
    JEOMWON_ADMIN_EMAILS: "owner@example.invalid",
  },
  answers: { "google-oauth:redirect-registered": false },
  convexAuthenticated: true,
  existingConvexEnv: {},
  existingLocalEnv: { app: { AUTH_ANONYMOUS_LOGIN: "0" } },
});

function oauthFailureArgs() {
  return [
    "scripts/setup/index.ts",
    "--dry-run",
    "--fresh-dry-run",
    "--non-interactive",
    "--lang",
    "en",
  ];
}

function runOAuthFailurePty(noColor: string | undefined) {
  const envArgs = ["-u", "NO_COLOR", "TERM=xterm-256color"];
  if (noColor !== undefined) envArgs.push(`NO_COLOR=${noColor}`);
  return spawnSync(
    "script",
    [
      "-q",
      "/dev/null",
      "env",
      ...envArgs,
      process.execPath,
      ...oauthFailureArgs(),
    ],
    {
      cwd: templateRoot,
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        JEOMWON_SETUP_STUBS: oauthFailureStubs,
      },
    },
  );
}

describe("setup options and locale contract", () => {
  test("parses language before orchestration and rejects invalid values", () => {
    expect(parseCliOptions(["--lang", "ko"]).lang).toBe("ko");
    expect(parseCliOptions(["--lang=en"]).lang).toBe("en");
    expect(
      thrownMessage(() => parseCliOptions(["--lang", "fr"])).length > 0,
    ).toBe(true);
    expect(thrownMessage(() => parseCliOptions(["--unknown"])).length > 0).toBe(
      true,
    );
  });

  test("resolves explicit, setup env, POSIX locale env, then English", () => {
    const base = { LC_ALL: undefined, LC_MESSAGES: undefined, LANG: undefined };
    expect(resolveLocale("ko", { ...base, JEOMWON_CLI_LANG: "en" })).toBe("ko");
    expect(resolveLocale("auto", { ...base, JEOMWON_CLI_LANG: "ko" })).toBe(
      "ko",
    );
    expect(
      resolveLocale(undefined, { ...base, LC_MESSAGES: "ko_KR.UTF-8" }),
    ).toBe("ko");
    expect(resolveLocale(undefined, { ...base, LANG: "C" })).toBe("en");
  });
});

describe("setup config v2 boundary", () => {
  test("accepts the committed schema and rejects strict structural violations", () => {
    expect(
      readSetupConfig(path.join(templateRoot, "setup-config.json"))
        .schemaVersion,
    ).toBe(2);

    const malformedConfigs = [
      setupConfigText.replace(
        '"schemaVersion": 2,',
        '"schemaVersion": 2,\n  "unexpected": true,',
      ),
      setupConfigText.replace('"type": "envFile"', '"type": "unknown"'),
      setupConfigText.replace('"kind": "local-env"', '"kind": "unknown"'),
      setupConfigText.replace('"projects": ["web"]', '"projects": ["missing"]'),
      setupConfigText.replace('"id": "backend"', '"id": "convex"'),
      setupConfigText.replace('"id": "app-url"', '"id": "renamed-app-url"'),
      setupConfigText.replace(
        '"name": "NEXT_PUBLIC_CONVEX_URL"',
        '"name": "CONVEX_URL"',
      ),
      "{",
    ];

    for (const contents of malformedConfigs) {
      expect(
        thrownMessage(() => readSetupConfig(writeSetupConfig(contents))),
      ).toBe("setup_config_invalid");
    }
  });

  test("rejects renamed, missing, extra, reordered, or rebound required variables before orchestration", () => {
    const renamed = withGoogleVariables((variables) =>
      variables.map((variable, index) =>
        index === 0
          ? { ...variable, name: "AUTH_GOOGLE_ID_RENAMED" }
          : variable,
      ),
    );
    const missing = withGoogleVariables((variables) => variables.slice(1));
    const extra = withGoogleVariables((variables) => {
      const first = variables[0];
      if (!first) throw new Error("google_oauth_fixture_variable_missing");
      return [...variables, { ...first, name: "AUTH_GOOGLE_EXTRA" }];
    });
    const reordered = withGoogleVariables((variables) => {
      const first = variables[0];
      const second = variables[1];
      if (!first || !second) {
        throw new Error("google_oauth_fixture_variable_missing");
      }
      return [second, first];
    });
    const rebound = withGoogleVariables((variables) =>
      variables.map((variable, index) =>
        index === 0 ? { ...variable, projects: ["app"] } : variable,
      ),
    );

    for (const contents of [renamed, missing, extra, reordered, rebound]) {
      const result = runWithConfig(contents);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(output.includes("setup_config_invalid")).toBe(true);
      expect(output.includes("[RUN]")).toBe(false);
      expect(output.includes("[local_env_write:")).toBe(false);
      expect(output.includes("[convex_env_set:")).toBe(false);
    }
  });

  test("future and malformed configs fail before orchestration or env changes", () => {
    const envPaths = [
      "packages/backend/.env.local",
      "apps/web/.env.local",
      "apps/app/.env.local",
    ].map((relativePath) => path.join(templateRoot, relativePath));
    const before = envPaths.map((envPath) =>
      existsSync(envPath) ? readFileSync(envPath, "utf8") : undefined,
    );
    const cases = [
      {
        contents: setupConfigText.replace(
          '"schemaVersion": 2',
          '"schemaVersion": 999',
        ),
        code: "setup_config_schema_unsupported",
      },
      {
        contents: setupConfigText.replace(
          '"projects": ["web"]',
          '"projects": ["missing"]',
        ),
        code: "setup_config_invalid",
      },
    ];

    for (const scenario of cases) {
      const result = runWithConfig(scenario.contents);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(output.includes(scenario.code)).toBe(true);
      expect(output.includes("[RUN]")).toBe(false);
      expect(output.includes("[local_env_write:")).toBe(false);
      expect(output.includes("[convex_env_set:")).toBe(false);
    }
    expect(
      JSON.stringify(
        envPaths.map((envPath) =>
          existsSync(envPath) ? readFileSync(envPath, "utf8") : undefined,
        ),
      ),
    ).toBe(JSON.stringify(before));
  });

  test("committed complete fixture finishes a fresh non-interactive dry run", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/setup/index.ts",
        "--dry-run",
        "--fresh-dry-run",
        "--non-interactive",
        "--stub-file",
        "scripts/setup/fixtures/complete.json",
        "--lang",
        "ko",
      ],
      {
        cwd: templateRoot,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "" },
      },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(result.status).toBe(0);
    expect(output.includes("[preview_complete]")).toBe(true);
    expect(output.includes("dry-run-google-client-secret")).toBe(false);
    expect(output.includes("operator@example.invalid")).toBe(false);
  });
});

describe("setup terminal layout contract", () => {
  test("measures ANSI-free CJK width and clamps content widths", () => {
    expect(stripAnsi("\u001b[31m오류\u001b[0m")).toBe("오류");
    expect(displayWidth("A한B")).toBe(4);
    expect(contentWidth(32)).toBe(32);
    expect(contentWidth(76)).toBe(72);
    expect(contentWidth(120)).toBe(72);
    expect(contentWidth(undefined)).toBe(72);
  });
});

describe("atomic setup env writes", () => {
  test("replaces in the same directory while preserving existing mode", () => {
    const target = setupFiles(tempRoot());
    atomicWriteEnvFile(target, "NEW=bytes\n");

    expect(readFileSync(target, "utf8")).toBe("NEW=bytes\n");
    expect(statSync(target).mode & 0o777).toBe(0o640);
    expect(tempNames(target).length).toBe(0);
  });

  test("creates new env files mode 0600", () => {
    const target = path.join(tempRoot(), ".env.local");
    atomicWriteEnvFile(target, "NEW=bytes\n");
    expect(statSync(target).mode & 0o777).toBe(0o600);
    expect(tempNames(target).length).toBe(0);
  });

  test("rename failure retains old bytes and removes mode-0600 temporary files", () => {
    const target = setupFiles(tempRoot());
    const error = thrownMessage(() =>
      atomicWriteEnvFile(target, "NEW=bytes\n", {
        rename: (temporaryPath) => {
          expect(path.dirname(temporaryPath)).toBe(path.dirname(target));
          expect(statSync(temporaryPath).mode & 0o777).toBe(0o600);
          throw new Error("rename-failure-sentinel");
        },
      }),
    );
    expect(error).toBe("rename-failure-sentinel");

    expect(readFileSync(target, "utf8")).toBe("OLD=bytes\n");
    expect(tempNames(target).length).toBe(0);
  });

  test("stale temp files are not consumed or mistaken for env state", () => {
    const target = setupFiles(tempRoot());
    const stale = `${target}.tmp-stale`;
    writeFileSync(stale, "SECRET=stale\n", { mode: 0o600 });
    chmodSync(stale, 0o600);

    atomicWriteEnvFile(target, "NEW=fresh\n");
    expect(readFileSync(target, "utf8")).toBe("NEW=fresh\n");
    expect(existsSync(stale)).toBe(true);
  });

  test("a cancelled staged setup resumes without discarding completed keys", () => {
    const target = setupFiles(tempRoot());
    const first = upsertEnvText(
      readFileSync(target, "utf8"),
      new Map([["FIRST", "done"]]),
    );
    atomicWriteEnvFile(target, first);

    const resumed = upsertEnvText(
      readFileSync(target, "utf8"),
      new Map([["SECOND", "done"]]),
    );
    atomicWriteEnvFile(target, resumed);

    expect(JSON.stringify([...parseEnv(readFileSync(target, "utf8"))])).toBe(
      JSON.stringify([
        ["OLD", "bytes"],
        ["FIRST", "done"],
        ["SECOND", "done"],
      ]),
    );
    expect(tempNames(target).length).toBe(0);
  });
});

describe("setup command interruption", () => {
  test("cleanup terminates a hung child without polling or a fixed wait", async () => {
    const root = tempRoot();
    const ctx = {
      root,
      options: { dryRun: false },
      projects: new Map([["convex", { id: "convex", workingDirectory: "." }]]),
      knownSecrets: new Set<string>(),
    } as RuntimeContext;

    const command = runCommand(ctx, process.execPath, [
      "-e",
      "setInterval(() => {}, 60_000)",
    ]);
    cleanupConvexCommands();
    const result = await command;
    expect(result.code).toBe(1);
  });
});

describe("setup CLI machine contract", () => {
  test("PTY failure color obeys presence-based NO_COLOR and keeps stderr routing", () => {
    if (process.platform !== "win32") {
      const empty = runOAuthFailurePty("");
      const nonempty = runOAuthFailurePty("1");
      const absent = runOAuthFailurePty(undefined);
      for (const result of [empty, nonempty, absent]) {
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        expect(result.status).toBe(1);
        expect(output.includes("[locale:en]")).toBe(true);
        expect(output.includes("[oauth_configuration]")).toBe(true);
        expect(output.includes("bun setup")).toBe(true);
        expect(output.includes("color-matrix-secret-sentinel")).toBe(false);
      }
      expect(`${empty.stdout}${empty.stderr}`.includes("\u001b[")).toBe(false);
      expect(`${nonempty.stdout}${nonempty.stderr}`.includes("\u001b[")).toBe(
        false,
      );
      expect(`${absent.stdout}${absent.stderr}`.includes("\u001b[")).toBe(true);
    }

    const routed = spawnSync(process.execPath, oauthFailureArgs(), {
      cwd: templateRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NO_COLOR: "",
        JEOMWON_SETUP_STUBS: oauthFailureStubs,
      },
    });
    expect(routed.status).toBe(1);
    expect(routed.stderr.includes("[oauth_configuration]")).toBe(true);
    expect(routed.stdout.includes("[oauth_configuration]")).toBe(false);
    expect(routed.stderr.endsWith("\n")).toBe(true);
    expect(routed.stderr.includes("\u001b[")).toBe(false);
  });

  test("English OAuth failure and recovery stay in the selected locale", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/setup/index.ts",
        "--dry-run",
        "--fresh-dry-run",
        "--non-interactive",
        "--lang",
        "en",
      ],
      {
        cwd: templateRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "",
          JEOMWON_SETUP_STUBS: JSON.stringify({
            values: {
              AUTH_GOOGLE_ID: "client-id",
              AUTH_GOOGLE_SECRET: "oauth-locale-secret-sentinel",
              JEOMWON_ADMIN_EMAILS: "owner@example.invalid",
            },
            answers: { "google-oauth:redirect-registered": false },
            convexAuthenticated: true,
            existingConvexEnv: {},
            existingLocalEnv: { app: { AUTH_ANONYMOUS_LOGIN: "0" } },
          }),
        },
      },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output.includes("[locale:en]")).toBe(true);
    expect(output.includes("[oauth_configuration]")).toBe(true);
    expect(output.includes("/api/auth/callback/google")).toBe(true);
    expect(output.includes("bun setup")).toBe(true);
    expect(/[가-힣]/.test(output)).toBe(false);
    expect(output.includes("oauth-locale-secret-sentinel")).toBe(false);
  });

  test("English Convex prerequisite failure and recovery contain no Hangul", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/setup/index.ts",
        "--dry-run",
        "--fresh-dry-run",
        "--non-interactive",
        "--lang",
        "en",
      ],
      {
        cwd: templateRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "",
          JEOMWON_SETUP_STUBS: JSON.stringify({
            convexAuthenticated: false,
            existingConvexEnv: {},
            existingLocalEnv: { app: { AUTH_ANONYMOUS_LOGIN: "0" } },
          }),
        },
      },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output.includes("[locale:en]")).toBe(true);
    expect(output.includes("[prerequisite_unauthenticated]")).toBe(true);
    expect(output.includes("bun x convex login")).toBe(true);
    expect(/[가-힣]/.test(output)).toBe(false);
  });

  test("malformed stubs fail before the banner without leaking input", () => {
    const sentinel = "malformed-secret-sentinel";
    const result = spawnSync(
      process.execPath,
      ["scripts/setup/index.ts", "--dry-run", "--non-interactive"],
      {
        cwd: templateRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "",
          JEOMWON_SETUP_STUBS: `{${sentinel}`,
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.includes("[product_failure]")).toBe(true);
    expect(result.stderr.includes(sentinel)).toBe(false);
  });

  test("a half-configured Convex auth key pair fails before env writes", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/setup/index.ts",
        "--dry-run",
        "--fresh-dry-run",
        "--non-interactive",
        "--lang",
        "en",
      ],
      {
        cwd: templateRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "",
          JEOMWON_SETUP_STUBS: JSON.stringify({
            values: {
              AUTH_GOOGLE_ID: "client-id",
              AUTH_GOOGLE_SECRET: "auth-pair-secret-sentinel",
              JEOMWON_ADMIN_EMAILS: "owner@example.invalid",
            },
            answers: { "google-oauth:redirect-registered": true },
            convexAuthenticated: true,
            existingConvexEnv: { JWT_PRIVATE_KEY: true, JWKS: false },
            existingLocalEnv: { app: { AUTH_ANONYMOUS_LOGIN: "0" } },
          }),
        },
      },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output.includes("convex_auth_key_pair_incomplete")).toBe(true);
    expect(output.includes("auth-pair-secret-sentinel")).toBe(false);
    expect(output.includes("[convex_env_set:JWT_PRIVATE_KEY]")).toBe(false);
  });

  test("Korean SIGINT restores terminal state with locale/category markers", async () => {
    const fixture = [
      'import { installSignalHandlers, promptSecret } from "./scripts/setup/prompts.ts";',
      'installSignalHandlers("ko");',
      'await promptSecret("secret-ready>");',
    ].join(" ");
    const child = spawn(process.execPath, ["-e", fixture], {
      cwd: templateRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "" },
    });
    let output = "";
    const exit = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("signal fixture timeout"));
      }, 5_000);
      child.on("close", (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal });
      });
      child.on("error", reject);
    });
    const ready = new Promise<void>((resolve) => {
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (output.includes("secret-ready>")) resolve();
      });
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });

    await ready;
    child.kill("SIGINT");
    const result = await exit;
    expect(result.code).toBe(130);
    expect(result.signal).toBe(null);
    expect(output.includes("[terminal_raw:false]")).toBe(true);
    expect(output.includes("[locale:ko]")).toBe(true);
    expect(output.includes("[product_failure]")).toBe(true);
    expect(/[가-힣]/.test(output)).toBe(true);
    expect(output.includes("\u001b[")).toBe(false);
  });

  test("unknown option is categorized before banner/orchestration", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/setup/index.ts", "--unknown"],
      {
        cwd: templateRoot,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "" },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.includes("[product_failure]")).toBe(true);
    expect(result.stderr.includes("\u001b[")).toBe(false);
  });

  test("help reports stable locale and ASCII status tokens without ANSI", () => {
    for (const lang of ["ko", "en"] as const) {
      const result = spawnSync(
        process.execPath,
        ["scripts/setup/index.ts", "--help", "--lang", lang],
        {
          cwd: templateRoot,
          encoding: "utf8",
          env: { ...process.env, NO_COLOR: "" },
        },
      );
      expect(result.status).toBe(0);
      expect(result.stdout.includes(`[locale:${lang}]`)).toBe(true);
      expect(result.stdout.includes("[info]")).toBe(true);
      expect(result.stdout.includes("\u001b[")).toBe(false);
    }
  });
});
