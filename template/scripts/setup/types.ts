export type ProjectType = "convex" | "envFile";

export type ProjectConfig = {
  id: string;
  type?: ProjectType;
  workingDirectory?: string;
  envFile?: string;
  exampleFile?: string;
};

export type StepVariable = {
  name: string;
  projects: string[];
  details?: string;
  defaultValue?: string;
  template?: string;
  required?: boolean;
  secret?: boolean;
  info?: string[];
};

export type StepConfig = {
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

export type SetupConfig = {
  introMessage: string;
  projects: ProjectConfig[];
  steps: StepConfig[];
};

export type Locale = "ko" | "en";
export type LocaleOption = Locale | "auto";

export type CliOptions = {
  dryRun: boolean;
  freshDryRun: boolean;
  nonInteractive: boolean;
  yes: boolean;
  help: boolean;
  optionalProviders: boolean;
  lang?: LocaleOption;
  stubFile?: string;
  convexUrl?: string;
  projectName?: string;
};

export type SetupStubs = {
  values?: Record<string, string>;
  answers?: Record<string, boolean | string>;
  existingConvexEnv?: Record<string, boolean | string>;
  existingLocalEnv?: Record<string, Record<string, string>>;
  convexAuthenticated?: boolean;
  convexUrl?: string;
  convexSiteUrl?: string;
  domainFeatures?: { polar?: boolean };
  probes?: { openaiModels?: boolean; resendEmail?: boolean };
};

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type SetupFailureCategory =
  | "prerequisite_missing"
  | "prerequisite_unauthenticated"
  | "external_environment"
  | "oauth_configuration"
  | "product_failure";

export class SetupFailure extends Error {
  constructor(
    readonly category: SetupFailureCategory,
    message: string,
    readonly nextSteps: readonly string[],
  ) {
    super(message);
    this.name = "SetupFailure";
  }
}

export type RuntimeContext = {
  root: string;
  config: SetupConfig;
  options: CliOptions;
  locale: Locale;
  stubs: SetupStubs;
  projects: Map<string, ProjectConfig>;
  localEnvWrites: Map<string, Map<string, string>>;
  convexEnvWrites: Map<string, string>;
  knownSecrets: Set<string>;
  deferredKeys: Set<string>;
};

export type ConvexDeployment = {
  convexUrl: string;
  convexSiteUrl: string;
};
