import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  CliOptions,
  RuntimeContext,
  SetupStubs,
  StepConfig,
} from "./types";

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
  polar: boolean;
};

export async function readDomainFeatures(
  ctx: RuntimeContext,
): Promise<DomainFeatures> {
  if (ctx.stubs.domainFeatures) {
    return {
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
      features?: { polar?: boolean };
    };
  };

  return {
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
