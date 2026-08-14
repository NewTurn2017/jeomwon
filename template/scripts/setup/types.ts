export type ProjectType = "convex" | "envFile";

export type ProjectConfig = {
  readonly id: string;
  readonly type: ProjectType;
  readonly workingDirectory?: string;
  readonly envFile?: string;
  readonly exampleFile?: string;
  readonly exportCommand?: string;
  readonly importCommand?: string;
  readonly suppressCommandOutput?: boolean;
  readonly ignoreLogs?: readonly string[];
};

export type StepVariable = {
  readonly name: string;
  readonly projects: readonly string[];
  readonly details?: string;
  readonly defaultValue?: string;
  readonly template?: string;
  readonly required?: boolean;
  readonly secret?: boolean;
  readonly info?: readonly string[];
};

export type StepKind =
  | "local-env"
  | "convex-env-with-local-default"
  | "convex-provision"
  | "convex-auth-keys"
  | "google-oauth"
  | "admin-emails"
  | "anonymous-login"
  | "resend"
  | "openai"
  | "polar";

export type StepConfig = {
  readonly id: string;
  readonly kind: StepKind;
  readonly title: string;
  readonly description?: string;
  readonly instructions?: string;
  readonly variables: readonly StepVariable[];
  readonly required?: boolean;
  readonly interactive?: boolean;
  readonly skipMode?: string;
  readonly whenFeature?: string;
  readonly requiredMessage?: string;
  readonly additionalInstructions?: readonly string[];
};

export type SetupConfig = {
  readonly schemaVersion: 2;
  readonly introMessage: string;
  readonly projects: readonly ProjectConfig[];
  readonly steps: readonly StepConfig[];
};

export type Locale = "ko" | "en";
export type LocaleOption = Locale | "auto";

export type CliOptions = {
  dryRun: boolean;
  freshDryRun: boolean;
  nonInteractive: boolean;
  yes: boolean;
  help: boolean;
  // Setup walks every provider by default. `--minimal` keeps the older
  // Convex + Google only path for people who explicitly want it.
  minimal: boolean;
  legacyOptionalProviders: boolean;
  lang?: LocaleOption;
  stubFile?: string;
  configFile?: string;
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
  domainFeatures?: { email?: boolean; polar?: boolean };
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
