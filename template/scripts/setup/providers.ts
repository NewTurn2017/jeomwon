import {
  type DomainFeatures,
  requireStep,
  requireVariable,
  validateUrl,
} from "./config";
import {
  ensureConvexEnv,
  isConvexEnvConfigured,
  readConvexEnvValue,
} from "./convex";
import { readLocalEnv, setLocalEnv } from "./env-files";
import { localized } from "./locales";
import {
  logDeferredKey,
  promptConfirm,
  promptLine,
  promptSecret,
  promptText,
  recordDeferredKey,
  stubValue,
} from "./prompts";
import type {
  ConvexDeployment,
  RuntimeContext,
  StepConfig,
  StepVariable,
} from "./types";
import { SetupFailure } from "./types";
import { glyph, section, tr, ui } from "./ui";

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

export async function configureSiteUrl(ctx: RuntimeContext) {
  const appUrlStep = requireStep(ctx, "app-url");
  await configureLocalDefaults(ctx, appUrlStep);

  const siteStep = requireStep(ctx, "site-url");
  section(siteStep.title);
  const variable = requireVariable(siteStep, "SITE_URL");
  const siteUrl = localDefaultValue(
    ctx,
    variable,
    "backend",
    variable.defaultValue ?? "http://localhost:3001",
  );

  await setLocalEnv(ctx, "backend", "SITE_URL", siteUrl);
  return siteUrl;
}

export async function configureApplicationOrigins(ctx: RuntimeContext) {
  const appOrigin = new URL(
    validateUrl(readLocalEnv(ctx, "web").get("NEXT_PUBLIC_APP_URL") ?? ""),
  ).origin;
  await ensureConvexEnv(ctx, "JEOMWON_APP_ORIGINS", appOrigin, {
    secret: false,
    force: true,
  });
}

export async function configureLocalDefaults(
  ctx: RuntimeContext,
  step: StepConfig,
) {
  section(step.title);
  for (const variable of step.variables) {
    const firstLocalProject = variable.projects.find(
      (projectId) => projectId !== "convex",
    );
    const value =
      step.interactive === true
        ? await getValueForVariable(ctx, variable, {
            prompt: variable.details ?? variable.name,
            defaultValue: variable.defaultValue ?? "",
          })
        : localDefaultValue(
            ctx,
            variable,
            firstLocalProject,
            variable.defaultValue ?? "",
          );
    for (const projectId of variable.projects) {
      if (projectId !== "convex") {
        await setLocalEnv(ctx, projectId, variable.name, value);
      }
    }
  }
}

export function localDefaultValue(
  ctx: RuntimeContext,
  variable: StepVariable,
  projectId: string | undefined,
  fallback: string,
) {
  const value =
    stubValue(ctx, variable.name) ??
    (projectId ? readLocalEnv(ctx, projectId).get(variable.name) : undefined) ??
    fallback;
  if (!value && variable.required !== false) {
    throw new SetupFailure(
      "product_failure",
      localized(
        ctx.locale,
        `${variable.name} 기본값을 결정할 수 없습니다.`,
        `Could not determine a default for ${variable.name}.`,
      ),
      [
        localized(
          ctx.locale,
          "setup-config.json의 기본값을 확인한 뒤 bun setup을 다시 실행하세요.",
          "Check the default in setup-config.json, then run bun setup again.",
        ),
      ],
    );
  }
  ui.ok(
    tr(
      `${variable.name} 자동 설정`,
      `${variable.name} configured automatically`,
    ),
  );
  return value;
}
export async function configureGoogleOAuth(
  ctx: RuntimeContext,
  deployment: ConvexDeployment,
) {
  const step = requireStep(ctx, "google-oauth");
  section(step.title);
  if (step.instructions) {
    console.log(step.instructions);
  }
  const variables = [
    requireVariable(step, "AUTH_GOOGLE_ID"),
    requireVariable(step, "AUTH_GOOGLE_SECRET"),
  ];
  const redirectUri = `${deployment.convexSiteUrl}/api/auth/callback/google`;
  console.log(
    tr(
      "1. Google Cloud Console을 열고 프로젝트를 새로 만들거나 선택하세요.",
      "1. Open Google Cloud Console and create or select a project.",
    ),
  );
  console.log("   https://console.cloud.google.com/auth/overview");
  console.log(
    tr(
      "2. Get started를 눌러 앱 이름·지원 이메일을 입력하고 Audience를 External로 설정하세요.",
      "2. Click Get started, enter the app name and support email, and set Audience to External.",
    ),
  );
  console.log(
    tr(
      "3. Audience > Test users에 실제 로그인할 Google 계정을 추가하세요.",
      "3. In Audience > Test users, add the Google account that will actually sign in.",
    ),
  );
  console.log(
    tr(
      "4. Clients > Create client > Web application을 선택하세요.",
      "4. Choose Clients > Create client > Web application.",
    ),
  );
  console.log(
    tr(
      "5. 아래 두 주소를 정확히 등록하세요.",
      "5. Register both addresses below exactly.",
    ),
  );
  console.log("JavaScript origin: http://localhost:3000");
  console.log(`Redirect URI: ${redirectUri}`);
  console.log(
    tr(
      "6. Create를 누른 뒤 표시되는 Client ID와 Client secret을 복사하세요.",
      "6. Click Create, then copy the displayed Client ID and Client secret.",
    ),
  );
  console.log(
    tr(
      "7. 저장을 마치면 Enter를 누르고 두 값을 차례로 입력하세요. 기존 값도 덮어씁니다.",
      "7. After saving, press Enter and enter both values. Existing values will be overwritten.",
    ),
  );
  await pauseForGoogleRedirectRegistration(ctx, redirectUri);

  for (const variable of variables) {
    const value = await promptRequiredOAuthCredential(ctx, variable);
    await ensureConvexEnv(ctx, variable.name, value, {
      secret: true,
      force: true,
    });
  }
  ui.ok(
    tr(
      "Google OAuth 설정 완료 (값 숨김)",
      "Google OAuth configured (values hidden)",
    ),
  );
}

export async function pauseForGoogleRedirectRegistration(
  ctx: RuntimeContext,
  redirectUri: string,
) {
  const key = "google-oauth:redirect-registered";
  const stub = ctx.stubs.answers?.[key];
  if (stub !== undefined) {
    const confirmed =
      stub === true ||
      (typeof stub === "string" &&
        ["y", "yes", "true", "1", "registered"].includes(
          stub.trim().toLowerCase(),
        ));
    if (!confirmed) {
      throw googleOAuthFailure(ctx, redirectUri);
    }
    ui.ok(
      tr(
        "Redirect URI 등록 확인됨 (stub)",
        "Redirect URI registration confirmed (stub)",
      ),
    );
    return;
  }

  if (ctx.options.dryRun) {
    ui.info(
      localized(
        ctx.locale,
        "DRY RUN: Redirect URI 등록을 기다린 뒤 Enter로 자동 재개합니다.",
        "DRY RUN: setup would wait for Redirect URI registration and resume on Enter.",
      ),
    );
    return;
  }
  if (ctx.options.nonInteractive) {
    throw googleOAuthFailure(ctx, redirectUri);
  }

  await promptLine(
    localized(
      ctx.locale,
      `  ${glyph.step} Google Console 저장을 마쳤으면 Enter를 눌러 계속하세요: `,
      `  ${glyph.step} Press Enter after saving the Google Console settings: `,
    ),
  );
  ui.ok(tr("Redirect URI 등록 확인됨", "Redirect URI registration confirmed"));
}

export function googleOAuthFailure(ctx: RuntimeContext, redirectUri: string) {
  return new SetupFailure(
    "oauth_configuration",
    localized(
      ctx.locale,
      "Google Redirect URI 등록 확인이 필요합니다.",
      "Google Redirect URI registration must be confirmed.",
    ),
    [
      localized(
        ctx.locale,
        `Google OAuth client에 ${redirectUri}를 정확히 등록하세요.`,
        `Register ${redirectUri} exactly on the Google OAuth client.`,
      ),
      localized(
        ctx.locale,
        "등록 후 bun setup을 다시 실행하세요.",
        "Run bun setup again after registration.",
      ),
    ],
  );
}

export async function promptRequiredOAuthCredential(
  ctx: RuntimeContext,
  variable: StepVariable,
) {
  const stub = stubValue(ctx, variable.name);
  if (stub !== undefined) {
    if (!stub.trim()) {
      throw new SetupFailure(
        "oauth_configuration",
        localized(
          ctx.locale,
          `${variable.name} 값이 비어 있습니다.`,
          `${variable.name} is empty.`,
        ),
        [
          localized(
            ctx.locale,
            "Google OAuth client 값을 확인한 뒤 bun setup을 다시 실행하세요.",
            "Check the Google OAuth client value, then run bun setup again.",
          ),
        ],
      );
    }
    ctx.knownSecrets.add(stub);
    console.log(
      localized(
        ctx.locale,
        `${variable.name}: stub 값 사용 (값 숨김).`,
        `${variable.name}: using stub value (hidden).`,
      ),
    );
    return stub;
  }
  if (ctx.options.dryRun) {
    console.log(
      localized(
        ctx.locale,
        `DRY RUN: ${variable.name} 입력을 요청할 예정입니다 (값 숨김).`,
        `DRY RUN: would prompt for ${variable.name} (value hidden).`,
      ),
    );
    return `dry-run-${variable.name.toLowerCase()}`;
  }
  if (ctx.options.nonInteractive) {
    throw new SetupFailure(
      "oauth_configuration",
      localized(
        ctx.locale,
        `${variable.name} 입력이 필요합니다.`,
        `${variable.name} is required.`,
      ),
      [
        localized(
          ctx.locale,
          "Google Cloud Console에서 Web application OAuth client 값을 확인하세요.",
          "Check the Web application OAuth client in Google Cloud Console.",
        ),
        localized(
          ctx.locale,
          `JEOMWON_SETUP_${variable.name}를 제공하고 bun setup --non-interactive를 다시 실행하세요.`,
          `Provide JEOMWON_SETUP_${variable.name}, then run bun setup --non-interactive again.`,
        ),
      ],
    );
  }

  const value = await promptSecret(
    `  ${glyph.step} ${variable.details ?? variable.name}: `,
  );
  if (!value.trim()) {
    throw new SetupFailure(
      "oauth_configuration",
      localized(
        ctx.locale,
        `${variable.name} 입력이 필요합니다.`,
        `${variable.name} is required.`,
      ),
      [
        localized(
          ctx.locale,
          "Google OAuth client 값을 확인한 뒤 bun setup을 다시 실행하세요.",
          "Check the Google OAuth client value, then run bun setup again.",
        ),
      ],
    );
  }
  ctx.knownSecrets.add(value.trim());
  return value.trim();
}

export async function configureAnonymousLogin(
  ctx: RuntimeContext,
  siteUrl: string,
) {
  const step = requireStep(ctx, "anonymous-login");
  section(step.title);
  const providerBefore = await readConvexEnvValue(ctx, "AUTH_ANONYMOUS_LOGIN");
  const appBefore = readLocalEnv(ctx, "app").get("AUTH_ANONYMOUS_LOGIN");
  assertAnonymousLoginSynchronized(providerBefore, appBefore);

  const production = !isLocalDevelopmentUrl(siteUrl);
  let enable = true;
  if (production) {
    enable = await promptConfirm(ctx, {
      key: "anonymous-login:enable",
      message: localized(
        ctx.locale,
        "이 프로덕션 배포에서 비회원 로그인을 활성화할까요?",
        "Enable product anonymous login for this production deployment?",
      ),
      defaultValue: false,
    });
    if (enable) {
      const confirmedProduction = await promptConfirm(ctx, {
        key: "anonymous-login:production-deployment",
        message: localized(
          ctx.locale,
          "프로덕션 배포임을 확인하세요.",
          "Confirm this is a production deployment",
        ),
        defaultValue: true,
      });
      if (!confirmedProduction) {
        throw new Error(
          localized(
            ctx.locale,
            "프로덕션 배포 확인이 필요합니다.",
            "Production deployment confirmation is required.",
          ),
        );
      }
      await requireProductionAnonymousOptIn(ctx);
    }
  } else {
    ui.ok(
      tr(
        "로컬 첫 성공용 익명 고객 로그인 자동 활성화",
        "Anonymous customer login enabled for local first success",
      ),
    );
  }

  const nextValue = enable ? "1" : "0";
  await ensureConvexEnv(ctx, "AUTH_ANONYMOUS_LOGIN", nextValue, {
    secret: false,
    overwritePromptKey: "overwrite:AUTH_ANONYMOUS_LOGIN",
    force: true,
  });
  await setLocalEnv(ctx, "app", "AUTH_ANONYMOUS_LOGIN", nextValue);
  await verifyAnonymousLoginPostflight(ctx);
}

export function isLocalDevelopmentUrl(value: string) {
  const url = new URL(validateUrl(value));
  return (
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1") &&
    (url.protocol === "http:" || url.protocol === "https:")
  );
}

export async function configureFirstSuccessDefaults(
  ctx: RuntimeContext,
  features: DomainFeatures,
) {
  section(tr("첫 성공 런타임", "First-success runtime"));
  const openAiKey = readLocalEnv(ctx, "app").get("OPENAI_API_KEY");
  await setLocalEnv(ctx, "app", "AGENT_RUNTIME", openAiKey ? "openai" : "mock");
  if (features.email) {
    await ensureConvexEnv(ctx, "RESERVATION_EMAIL_MODE", "capture", {
      secret: false,
      force: true,
    });
  }
  ui.skip(
    tr(
      "Resend · OpenAI · Polar 설정은 첫 성공 이후로 유예",
      "Resend, OpenAI, and Polar are deferred until after first success",
    ),
  );
  ui.info(
    tr(
      "예약·취소·에스컬레이션은 Convex 영속 상태로 바로 검증할 수 있습니다.",
      "Reservations, cancellation, and escalation can be verified with persisted Convex state.",
    ),
  );
}

export async function requireProductionAnonymousOptIn(ctx: RuntimeContext) {
  const key = "anonymous-login:production-opt-in";
  const expected = "ENABLE_PRODUCTION_ANONYMOUS_LOGIN";
  const stub = ctx.stubs.answers?.[key];
  let response = "";

  if (typeof stub === "string") {
    response = stub;
    console.log(
      localized(
        ctx.locale,
        "프로덕션 비회원 로그인 동의 응답을 받았습니다 (stub).",
        "Production anonymous login opt-in response received (stub).",
      ),
    );
  } else if (!ctx.options.nonInteractive) {
    response = await promptLine(
      localized(
        ctx.locale,
        `프로덕션 비회원 로그인을 활성화하려면 ${expected}를 입력하세요: `,
        `Type ${expected} to enable product anonymous login in production: `,
      ),
    );
  }

  if (response !== expected) {
    throw new Error(
      localized(
        ctx.locale,
        "production_anonymous_opt_in_required: 비회원 로그인을 위한 명시적 프로덕션 동의가 필요합니다.",
        "production_anonymous_opt_in_required: explicit production opt-in is required for anonymous login",
      ),
    );
  }
}

export function isAnonymousLoginOn(value: string | undefined) {
  return value === "1";
}

export function assertAnonymousLoginSynchronized(
  providerValue: string | undefined,
  appValue: string | undefined,
) {
  if (isAnonymousLoginOn(providerValue) !== isAnonymousLoginOn(appValue)) {
    throw new Error("anonymous_login_config_mismatch");
  }
}

export async function verifyAnonymousLoginPostflight(ctx: RuntimeContext) {
  const providerValue = await readConvexEnvValue(ctx, "AUTH_ANONYMOUS_LOGIN");
  const appValue = readLocalEnv(ctx, "app").get("AUTH_ANONYMOUS_LOGIN");
  assertAnonymousLoginSynchronized(providerValue, appValue);

  if (isAnonymousLoginOn(providerValue)) {
    const allowlist = await readConvexEnvValue(ctx, "JEOMWON_ADMIN_EMAILS");
    requireValidAdminEmails(allowlist, ctx.locale);
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
export async function configureAdminEmails(ctx: RuntimeContext) {
  const step = requireStep(ctx, "admin-emails");
  section(step.title);

  const variable = requireVariable(step, "JEOMWON_ADMIN_EMAILS");
  console.log(
    "Only allowlisted, non-anonymous accounts can access operator functions. Values remain hidden.",
  );

  const configured = await isConvexEnvConfigured(ctx, "JEOMWON_ADMIN_EMAILS");
  if (configured) {
    console.log(
      localized(
        ctx.locale,
        "JEOMWON_ADMIN_EMAILS가 설정되어 있습니다 (값 숨김).",
        "JEOMWON_ADMIN_EMAILS is configured (value hidden).",
      ),
    );
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:JEOMWON_ADMIN_EMAILS",
      message: localized(
        ctx.locale,
        "JEOMWON_ADMIN_EMAILS를 덮어쓸까요?",
        "Overwrite JEOMWON_ADMIN_EMAILS?",
      ),
      defaultValue: false,
    });
    if (!overwrite) {
      const existingValue = await readConvexEnvValue(
        ctx,
        "JEOMWON_ADMIN_EMAILS",
      );
      requireValidAdminEmails(existingValue, ctx.locale);
      return;
    }
  }

  const value = await promptText(ctx, {
    key: "JEOMWON_ADMIN_EMAILS",
    message: localized(
      ctx.locale,
      "운영자 이메일 (쉼표로 구분)",
      "Operator emails (comma-separated)",
    ),
    defaultValue: variable.defaultValue ?? "",
    secret: true,
    required: true,
  });
  const emails = requireValidAdminEmails(value, ctx.locale);

  await ensureConvexEnv(ctx, "JEOMWON_ADMIN_EMAILS", emails, {
    secret: true,
    force: true,
  });
}

// Stored normalized (trimmed, lowercased, de-duplicated). The backend lowercases
// both sides anyway, so this is for legibility in `convex env get`, not matching.
export function normalizeAdminEmails(
  value: string,
  locale: RuntimeContext["locale"] = "en",
) {
  const emails = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  const invalid = emails.filter((email) => !email.includes("@"));
  if (invalid.length > 0) {
    throw new Error(
      localized(
        locale,
        "admin_email_invalid: JEOMWON_ADMIN_EMAILS에는 이메일 주소가 필요합니다.",
        "admin_email_invalid: JEOMWON_ADMIN_EMAILS expects email addresses.",
      ),
    );
  }

  return [...new Set(emails)].join(",");
}

export function requireValidAdminEmails(
  value: string | undefined,
  locale: RuntimeContext["locale"] = "en",
) {
  const emails = normalizeAdminEmails(value ?? "", locale);
  if (!emails) {
    throw new Error(
      localized(
        locale,
        "admin_email_required: JEOMWON_ADMIN_EMAILS 값이 필요합니다.",
        "admin_email_required: JEOMWON_ADMIN_EMAILS is required.",
      ),
    );
  }
  return emails;
}

export async function configureResend(ctx: RuntimeContext) {
  const step = requireStep(ctx, "resend");
  section(step.title);
  console.log(
    localized(
      ctx.locale,
      "Resend는 건너뛸 수 있습니다.",
      step.requiredMessage ?? "Resend can be skipped.",
    ),
  );

  const apiKeyConfigured = await isConvexEnvConfigured(ctx, "RESEND_API_KEY");
  if (apiKeyConfigured) {
    console.log(
      localized(
        ctx.locale,
        "RESEND_API_KEY가 설정되어 있습니다 (값 숨김).",
        "RESEND_API_KEY is configured (value hidden).",
      ),
    );
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:RESEND_API_KEY",
      message: localized(
        ctx.locale,
        "RESEND_API_KEY를 덮어쓸까요?",
        "Overwrite RESEND_API_KEY?",
      ),
      defaultValue: false,
    });
    if (!overwrite) {
      await maybeConfigureResendSender(ctx, step);
      const existingMode = await readConvexEnvValue(
        ctx,
        "RESERVATION_EMAIL_MODE",
      );
      await setReservationEmailMode(
        ctx,
        existingMode === "sent" ? "sent" : "capture",
      );
      return;
    }
  } else {
    const configure = await promptConfirm(ctx, {
      key: "resend:configure",
      message: localized(
        ctx.locale,
        "지금 Resend를 설정할까요?",
        "Configure Resend now?",
      ),
      defaultValue: false,
    });
    if (!configure) {
      await setReservationEmailMode(ctx, "capture");
      ui.skip(
        localized(
          ctx.locale,
          "Resend 건너뜀 - 이메일은 capture 모드로 동작 (나중에 추가 가능)",
          "Resend skipped - email remains in capture mode (can be added later)",
        ),
      );
      return;
    }
  }

  const apiKey = await promptCredentialVariable(
    ctx,
    requireVariable(step, "RESEND_API_KEY"),
  );
  if (!apiKey) {
    await setReservationEmailMode(ctx, "capture");
    console.log(
      localized(
        ctx.locale,
        "Resend가 유예되었습니다. 이메일 수명주기는 capture 모드로 유지됩니다.",
        "Resend deferred. Email lifecycle remains in capture mode.",
      ),
    );
    return;
  }
  await ensureConvexEnv(ctx, "RESEND_API_KEY", apiKey, {
    secret: true,
    force: true,
  });

  const sender = await maybeConfigureResendSender(ctx, step);
  await setReservationEmailMode(ctx, "sent");

  const runProbe = await promptConfirm(ctx, {
    key: "resend:test",
    message: localized(
      ctx.locale,
      "Resend 테스트 이메일 확인을 보낼까요?",
      "Send a Resend test email probe?",
    ),
    defaultValue: false,
  });
  if (runProbe) {
    const to = await promptText(ctx, {
      key: "resend:testRecipient",
      message: localized(
        ctx.locale,
        "테스트 수신 이메일",
        "Test recipient email",
      ),
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

async function setReservationEmailMode(
  ctx: RuntimeContext,
  mode: "capture" | "sent",
) {
  await ensureConvexEnv(ctx, "RESERVATION_EMAIL_MODE", mode, {
    secret: false,
    force: true,
  });
  ui.ok(`RESERVATION_EMAIL_MODE=${mode}`);
}

export async function maybeConfigureResendSender(
  ctx: RuntimeContext,
  step: StepConfig,
) {
  const senderConfigured = await isConvexEnvConfigured(
    ctx,
    "RESEND_SENDER_EMAIL_AUTH",
  );
  if (senderConfigured) {
    console.log(
      localized(
        ctx.locale,
        "RESEND_SENDER_EMAIL_AUTH가 설정되어 있습니다.",
        "RESEND_SENDER_EMAIL_AUTH is configured.",
      ),
    );
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:RESEND_SENDER_EMAIL_AUTH",
      message: localized(
        ctx.locale,
        "RESEND_SENDER_EMAIL_AUTH를 덮어쓸까요?",
        "Overwrite RESEND_SENDER_EMAIL_AUTH?",
      ),
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
      localized(ctx.locale, "Resend 발신 이메일", "Resend sender email"),
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

export async function probeResend(
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
    throw new Error(
      localized(
        ctx.locale,
        `Resend 확인이 HTTP ${response.status}로 실패했습니다.`,
        `Resend probe failed with HTTP ${response.status}.`,
      ),
    );
  }

  console.log("Resend probe succeeded.");
}

export async function configureOpenAI(ctx: RuntimeContext) {
  const step = requireStep(ctx, "openai");
  section(step.title);
  console.log(
    localized(
      ctx.locale,
      "OpenAI는 건너뛸 수 있습니다.",
      step.requiredMessage ?? "OpenAI can be skipped.",
    ),
  );

  // The authenticated app is the only agent runtime owner.
  const setAgentEnv = async (name: string, value: string) => {
    await setLocalEnv(ctx, "app", name, value);
  };

  const existing = readLocalEnv(ctx, "app").get("OPENAI_API_KEY");
  if (existing) {
    console.log(
      localized(
        ctx.locale,
        "OPENAI_API_KEY가 apps/app/.env.local에 설정되어 있습니다.",
        "OPENAI_API_KEY is configured in apps/app/.env.local.",
      ),
    );
    const overwrite = await promptConfirm(ctx, {
      key: "overwrite:OPENAI_API_KEY",
      message: localized(
        ctx.locale,
        "OPENAI_API_KEY를 덮어쓸까요?",
        "Overwrite OPENAI_API_KEY?",
      ),
      defaultValue: false,
    });
    if (!overwrite) {
      await setAgentEnv("AGENT_RUNTIME", "openai");
      return;
    }
  } else {
    const configure = await promptConfirm(ctx, {
      key: "openai:configure",
      message: localized(
        ctx.locale,
        "지금 OpenAI를 설정할까요?",
        "Configure OpenAI now?",
      ),
      defaultValue: false,
    });
    if (!configure) {
      await setAgentEnv("AGENT_RUNTIME", "mock");
      ui.skip(
        localized(
          ctx.locale,
          "OpenAI 건너뜀 - AGENT_RUNTIME=mock 사용 (나중에 추가 가능)",
          "OpenAI skipped - using AGENT_RUNTIME=mock (can be added later)",
        ),
      );
      return;
    }
  }

  const apiKey = await promptCredentialVariable(
    ctx,
    requireVariable(step, "OPENAI_API_KEY"),
  );
  if (!apiKey) {
    await setAgentEnv("AGENT_RUNTIME", "mock");
    console.log(
      localized(
        ctx.locale,
        "OpenAI가 유예되었습니다. AGENT_RUNTIME=mock을 사용합니다.",
        "OpenAI deferred. AGENT_RUNTIME=mock will be used.",
      ),
    );
    return;
  }
  await probeOpenAI(ctx, apiKey);
  await setAgentEnv("OPENAI_API_KEY", apiKey);
  await setAgentEnv("AGENT_RUNTIME", "openai");
}

export async function probeOpenAI(ctx: RuntimeContext, apiKey: string) {
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
    throw new Error(
      localized(
        ctx.locale,
        `OpenAI 모델 확인이 HTTP ${response.status}로 실패했습니다.`,
        `OpenAI models probe failed with HTTP ${response.status}.`,
      ),
    );
  }

  console.log("OpenAI models probe succeeded.");
}

export async function configurePolar(
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
  const productIds = normalizePolarProductIds(
    await promptText(ctx, {
      key: "POLAR_PRODUCT_IDS",
      message:
        requireVariable(step, "POLAR_PRODUCT_IDS").details ??
        "Polar product IDs (comma-separated)",
      defaultValue: "",
      secret: false,
      required: true,
    }),
  );
  await ensureConvexEnv(ctx, "POLAR_PRODUCT_IDS", productIds, {
    secret: false,
    force: true,
  });
}

export function normalizePolarProductIds(value: string) {
  const ids = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error("polar_product_ids_invalid");
  }
  return ids.join(",");
}

export async function configureOptionalLocalSteps(ctx: RuntimeContext) {
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
      message: localized(
        ctx.locale,
        `${step.title} 설정을 진행할까요?`,
        `Configure ${step.title}?`,
      ),
      defaultValue: false,
    });
    if (!configure) {
      console.log(
        localized(
          ctx.locale,
          `${step.title} 설정을 건너뛰었습니다.`,
          `${step.title} skipped.`,
        ),
      );
      continue;
    }
    await configureLocalDefaults(ctx, step);
  }
}

export async function configureConvexSecretVariable(
  ctx: RuntimeContext,
  step: StepConfig,
  name: string,
) {
  const variable = requireVariable(step, name);
  const configured = await isConvexEnvConfigured(ctx, name);
  if (configured) {
    console.log(
      localized(
        ctx.locale,
        `${name}이 설정되어 있습니다 (값 숨김).`,
        `${name} is configured (value hidden).`,
      ),
    );
    const overwrite = await promptConfirm(ctx, {
      key: `overwrite:${name}`,
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

  const value = await promptCredentialVariable(ctx, variable);
  if (!value) {
    return;
  }
  await ensureConvexEnv(ctx, name, value, {
    secret: variable.secret === true,
    force: true,
  });
}

export async function promptCredentialVariable(
  ctx: RuntimeContext,
  variable: StepVariable,
) {
  const stub = stubValue(ctx, variable.name);
  if (stub !== undefined) {
    ctx.knownSecrets.add(stub);
    console.log(
      localized(
        ctx.locale,
        `${variable.name}: stub 값 사용 (값 숨김).`,
        `${variable.name}: using stub value (hidden).`,
      ),
    );
    return stub;
  }

  const defaultValue = variable.defaultValue ?? "";
  if (ctx.options.dryRun) {
    console.log(
      localized(
        ctx.locale,
        `DRY RUN: ${variable.name} 입력을 요청할 예정입니다 (값 숨김).`,
        `DRY RUN: would prompt for ${variable.name} (value hidden).`,
      ),
    );
    recordDeferredKey(ctx, variable.name);
    return undefined;
  }

  if (ctx.options.nonInteractive) {
    if (defaultValue) {
      ctx.knownSecrets.add(defaultValue);
      return defaultValue;
    }
    logDeferredKey(
      ctx,
      variable.name,
      localized(
        ctx.locale,
        "비대화형 값 없음",
        "missing non-interactive value",
      ),
    );
    return undefined;
  }

  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const value = await promptSecret(
    `${variable.details ?? variable.name}${suffix}: `,
  );
  const finalValue = value.trim() || defaultValue;
  if (!finalValue) {
    logDeferredKey(
      ctx,
      variable.name,
      localized(ctx.locale, "값이 입력되지 않음", "no value provided"),
    );
    return undefined;
  }

  ctx.knownSecrets.add(finalValue);
  return finalValue;
}

export async function getValueForVariable(
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
