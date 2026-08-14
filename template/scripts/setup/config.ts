import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  CliOptions,
  ProjectConfig,
  RuntimeContext,
  SetupConfig,
  SetupStubs,
  StepConfig,
  StepKind,
  StepVariable,
} from "./types";

const CORE_STEP_IDS = [
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

const CORE_STEP_KINDS = [
  "local-env",
  "convex-env-with-local-default",
  "convex-provision",
  "convex-auth-keys",
  "google-oauth",
  "admin-emails",
  "anonymous-login",
  "resend",
  "openai",
  "polar",
] as const satisfies readonly StepKind[];

const CORE_STEP_VARIABLES = [
  [
    { name: "NEXT_PUBLIC_APP_URL", projects: ["web"] },
    { name: "JEOMWON_APP_ORIGINS", projects: ["convex"] },
  ],
  [{ name: "SITE_URL", projects: ["backend", "convex"] }],
  [
    { name: "CONVEX_URL", projects: ["backend"] },
    { name: "NEXT_PUBLIC_CONVEX_URL", projects: ["app"] },
    { name: "CONVEX_SITE_URL", projects: ["convex"] },
  ],
  [
    { name: "JWT_PRIVATE_KEY", projects: ["convex"] },
    { name: "JWKS", projects: ["convex"] },
  ],
  [
    { name: "AUTH_GOOGLE_ID", projects: ["convex"] },
    { name: "AUTH_GOOGLE_SECRET", projects: ["convex"] },
  ],
  [{ name: "JEOMWON_ADMIN_EMAILS", projects: ["convex"] }],
  [{ name: "AUTH_ANONYMOUS_LOGIN", projects: ["convex", "app"] }],
  [
    { name: "RESEND_API_KEY", projects: ["convex"] },
    { name: "RESEND_SENDER_EMAIL_AUTH", projects: ["convex"] },
    { name: "RESERVATION_EMAIL_MODE", projects: ["convex"] },
  ],
  [
    { name: "OPENAI_API_KEY", projects: ["app"] },
    { name: "AGENT_RUNTIME", projects: ["app"] },
  ],
  [
    { name: "POLAR_WEBHOOK_SECRET", projects: ["convex"] },
    { name: "POLAR_ORGANIZATION_TOKEN", projects: ["convex"] },
    { name: "POLAR_PRODUCT_IDS", projects: ["convex"] },
    { name: "POLAR_DEPOSIT_PRODUCT_ID", projects: ["convex"] },
  ],
] as const;

export class SetupConfigError extends Error {
  constructor(
    readonly code: "setup_config_schema_unsupported" | "setup_config_invalid",
  ) {
    super(code);
    this.name = "SetupConfigError";
  }
}

function invalidSetupConfig(): never {
  throw new SetupConfigError("setup_config_invalid");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!isObject(value)) invalidSetupConfig();
  return value;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    invalidSetupConfig();
  }
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) invalidSetupConfig();
  return value;
}

function optionalString(value: unknown) {
  if (value === undefined) return undefined;
  return requiredString(value);
}

function optionalBoolean(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") invalidSetupConfig();
  return value;
}

function stringArray(value: unknown, allowEmpty = true) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    invalidSetupConfig();
  }
  return value.map(requiredString);
}

function optionalStringArray(value: unknown) {
  return value === undefined ? undefined : stringArray(value);
}

function parseProject(value: unknown): ProjectConfig {
  const project = objectValue(value);
  const id = requiredString(project.id);
  const type = requiredString(project.type);
  if (type === "convex") {
    exactKeys(project, [
      "id",
      "type",
      "workingDirectory",
      "exportCommand",
      "importCommand",
      "suppressCommandOutput",
      "ignoreLogs",
    ]);
    return {
      id,
      type,
      workingDirectory: requiredString(project.workingDirectory),
      exportCommand: requiredString(project.exportCommand),
      importCommand: requiredString(project.importCommand),
      suppressCommandOutput: optionalBoolean(project.suppressCommandOutput),
      ignoreLogs: optionalStringArray(project.ignoreLogs),
    };
  }
  if (type === "envFile") {
    exactKeys(project, ["id", "type", "envFile", "exampleFile"]);
    return {
      id,
      type,
      envFile: requiredString(project.envFile),
      exampleFile: requiredString(project.exampleFile),
    };
  }
  return invalidSetupConfig();
}

function parseStepKind(value: unknown): StepKind {
  switch (value) {
    case "local-env":
    case "convex-env-with-local-default":
    case "convex-provision":
    case "convex-auth-keys":
    case "google-oauth":
    case "admin-emails":
    case "anonymous-login":
    case "resend":
    case "openai":
    case "polar":
      return value;
    default:
      return invalidSetupConfig();
  }
}

function parseVariable(
  value: unknown,
  projectIds: ReadonlySet<string>,
): StepVariable {
  const variable = objectValue(value);
  exactKeys(variable, [
    "name",
    "projects",
    "details",
    "defaultValue",
    "template",
    "required",
    "secret",
    "info",
  ]);
  const projects = stringArray(variable.projects, false);
  if (
    new Set(projects).size !== projects.length ||
    projects.some((projectId) => !projectIds.has(projectId))
  ) {
    invalidSetupConfig();
  }
  return {
    name: requiredString(variable.name),
    projects,
    details: optionalString(variable.details),
    defaultValue: optionalString(variable.defaultValue),
    template: optionalString(variable.template),
    required: optionalBoolean(variable.required),
    secret: optionalBoolean(variable.secret),
    info: optionalStringArray(variable.info),
  };
}

function parseStep(
  value: unknown,
  projectIds: ReadonlySet<string>,
): StepConfig {
  const step = objectValue(value);
  exactKeys(step, [
    "id",
    "kind",
    "title",
    "description",
    "instructions",
    "variables",
    "required",
    "interactive",
    "skipMode",
    "whenFeature",
    "requiredMessage",
    "additionalInstructions",
  ]);
  if (!Array.isArray(step.variables)) invalidSetupConfig();
  const variables = step.variables.map((variable) =>
    parseVariable(variable, projectIds),
  );
  const variableNames = variables.map((variable) => variable.name);
  if (new Set(variableNames).size !== variableNames.length) {
    invalidSetupConfig();
  }
  return {
    id: requiredString(step.id),
    kind: parseStepKind(step.kind),
    title: requiredString(step.title),
    description: optionalString(step.description),
    instructions: optionalString(step.instructions),
    variables,
    required: optionalBoolean(step.required),
    interactive: optionalBoolean(step.interactive),
    skipMode: optionalString(step.skipMode),
    whenFeature: optionalString(step.whenFeature),
    requiredMessage: optionalString(step.requiredMessage),
    additionalInstructions: optionalStringArray(step.additionalInstructions),
  };
}

export function parseSetupConfig(value: unknown): SetupConfig {
  const config = objectValue(value);
  if (typeof config.schemaVersion === "number" && config.schemaVersion !== 2) {
    throw new SetupConfigError("setup_config_schema_unsupported");
  }
  exactKeys(config, ["schemaVersion", "introMessage", "projects", "steps"]);
  if (config.schemaVersion !== 2 || !Array.isArray(config.projects)) {
    return invalidSetupConfig();
  }
  const projects = config.projects.map(parseProject);
  const projectIds = projects.map((project) => project.id);
  if (new Set(projectIds).size !== projectIds.length) invalidSetupConfig();
  if (!Array.isArray(config.steps)) invalidSetupConfig();
  const steps = config.steps.map((step) =>
    parseStep(step, new Set(projectIds)),
  );
  const stepIds = steps.map((step) => step.id);
  if (new Set(stepIds).size !== stepIds.length) invalidSetupConfig();
  for (let index = 0; index < CORE_STEP_IDS.length; index += 1) {
    const expectedVariables = CORE_STEP_VARIABLES[index];
    const actualStep = steps[index];
    if (!expectedVariables || !actualStep) invalidSetupConfig();
    const actualVariables = actualStep.variables;
    if (
      actualStep.id !== CORE_STEP_IDS[index] ||
      actualStep.kind !== CORE_STEP_KINDS[index] ||
      actualVariables.length !== expectedVariables.length
    ) {
      invalidSetupConfig();
    }
    for (
      let variableIndex = 0;
      variableIndex < expectedVariables.length;
      variableIndex += 1
    ) {
      const expected = expectedVariables[variableIndex];
      const actual = actualVariables[variableIndex];
      if (!expected || !actual) invalidSetupConfig();
      if (
        actual.name !== expected.name ||
        actual.projects.length !== expected.projects.length ||
        actual.projects.some(
          (projectId, projectIndex) =>
            projectId !== expected.projects[projectIndex],
        )
      ) {
        invalidSetupConfig();
      }
    }
  }
  return {
    schemaVersion: 2,
    introMessage: requiredString(config.introMessage),
    projects,
    steps,
  };
}

export function readSetupConfig(filePath: string) {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SetupConfigError) throw error;
    throw new SetupConfigError("setup_config_invalid");
  }
  return parseSetupConfig(value);
}

export function readStubs(root: string, options: CliOptions): SetupStubs {
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

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export type DomainFeatures = {
  email: boolean;
  polar: boolean;
};

export async function readDomainFeatures(
  ctx: RuntimeContext,
): Promise<DomainFeatures> {
  if (ctx.stubs.domainFeatures) {
    return {
      email: ctx.stubs.domainFeatures.email === true,
      polar: ctx.stubs.domainFeatures.polar === true,
    };
  }

  const domainConfigPath = path.join(
    ctx.root,
    "packages/backend/domain.config.ts",
  );
  const moduleUrl = pathToFileURL(domainConfigPath).href;
  const imported = (await import(moduleUrl)) as {
    domainConfig?: {
      features?: { email?: boolean; polar?: boolean };
    };
  };

  return {
    email: imported.domainConfig?.features?.email === true,
    polar: imported.domainConfig?.features?.polar === true,
  };
}
export function getProject(ctx: RuntimeContext, id: string) {
  const project = ctx.projects.get(id);
  if (!project) {
    throw new Error(`setup_project_unknown:${id}`);
  }
  return project;
}

export function requireStep(ctx: RuntimeContext, id: string) {
  const step = ctx.config.steps.find((candidate) => candidate.id === id);
  if (!step) {
    throw new Error(`setup_step_missing:${id}`);
  }
  return step;
}

export function requireVariable(step: StepConfig, name: string) {
  const variable = step.variables.find((candidate) => candidate.name === name);
  if (!variable) {
    throw new Error(`setup_variable_missing:${step.id}:${name}`);
  }
  return variable;
}
export function validateUrl(value: string) {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`setup_url_invalid:${value}`);
  }
}

export function deriveConvexSiteUrl(convexUrl: string) {
  const url = new URL(convexUrl);
  if (!url.hostname.endsWith(".convex.cloud")) {
    throw new Error(`convex_site_url_host_invalid:${url.hostname}`);
  }
  url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "jeomwon";
}
