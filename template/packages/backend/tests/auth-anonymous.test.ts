import { describe, expect, mock, test } from "bun:test";
import {
  anonymousLoginProviderPolicy,
  productAnonymousProfile,
} from "../convex/authPolicy";
import {
  normalizeAdminEmailAllowlist,
  viewerRolePolicy,
} from "../convex/engine/identity";

type Provider = {
  readonly id?: string;
  readonly options?: {
    readonly profile?: (
      params: Record<string, unknown>,
      ctx: unknown,
    ) => Record<string, unknown>;
  };
};

describe("anonymous auth provider characterization", () => {
  test("registers an anonymous profile that is marked anonymous and has no email", async () => {
    const previousDevFlag = process.env.AUTH_DEV_ANONYMOUS;
    const previousProductFlag = process.env.AUTH_ANONYMOUS_LOGIN;
    const previousAllowlist = process.env.JEOMWON_ADMIN_EMAILS;
    let configuredProviders: readonly Provider[] = [];

    process.env.AUTH_DEV_ANONYMOUS = "1";
    process.env.AUTH_ANONYMOUS_LOGIN = "1";
    process.env.JEOMWON_ADMIN_EMAILS = "owner@example.invalid";

    mock.module("../domain.config", () => ({
      domainConfig: { features: { customerAccounts: true } },
    }));
    mock.module("@convex-dev/auth/server", () => ({
      convexAuth: (config: { readonly providers: readonly Provider[] }) => {
        configuredProviders = config.providers;
        return {
          auth: {},
          signIn: () => undefined,
          signOut: () => undefined,
          store: () => undefined,
          isAuthenticated: () => false,
        };
      },
      createAccount: () => {
        throw new Error("not_used_by_profile_characterization");
      },
    }));

    try {
      await import(`../convex/auth.ts?baseline=${Date.now()}`);

      const anonymous = configuredProviders.find(
        (provider) => provider.id === "credentials",
      );
      expect(anonymous === undefined).toBe(false);

      const profile = anonymous?.options?.profile?.({}, {});
      expect(profile?.isAnonymous).toBe(true);
      expect(profile !== undefined && "email" in profile).toBe(false);
    } finally {
      restoreEnv("AUTH_DEV_ANONYMOUS", previousDevFlag);
      restoreEnv("AUTH_ANONYMOUS_LOGIN", previousProductFlag);
      restoreEnv("JEOMWON_ADMIN_EMAILS", previousAllowlist);
      mock.restore();
    }
  });
});

describe("anonymousLoginProviderPolicy", () => {
  test("enables only when customer accounts, exact env 1, and a non-empty allowlist all match", () => {
    const enabled = anonymousLoginProviderPolicy({
      anonymousLoginEnv: "1",
      adminEmailAllowlist: ["owner@example.invalid"],
    });

    expect(enabled).toBe(true);
  });

  for (const anonymousLoginEnv of [
    undefined,
    "",
    "0",
    "true",
    "yes",
    "01",
    " 1",
    "1 ",
  ]) {
    test(`fails closed for non-exact env value ${JSON.stringify(anonymousLoginEnv)}`, () => {
      expect(
        anonymousLoginProviderPolicy({
          anonymousLoginEnv,
          adminEmailAllowlist: ["owner@example.invalid"],
        }),
      ).toBe(false);
    });
  }

  test("stays off when the normalized admin allowlist is missing or empty", () => {
    for (const rawAllowlist of [undefined, "", "  ,  "]) {
      expect(
        anonymousLoginProviderPolicy({
          anonymousLoginEnv: "1",
          adminEmailAllowlist: normalizeAdminEmailAllowlist(rawAllowlist),
        }),
      ).toBe(false);
    }
  });
});

describe("product anonymous profile and role", () => {
  test("uses the exact Guest profile without synthesizing an email", () => {
    const profile = productAnonymousProfile();

    expect(profile.isAnonymous).toBe(true);
    expect(profile.name).toBe("Guest");
    expect(profile.username).toBe("guest");
    expect("email" in profile).toBe(false);
  });

  test("remains a customer even when a synthetic email matches the allowlist", () => {
    expect(
      viewerRolePolicy(
        {
          ...productAnonymousProfile(),
          email: "owner@example.invalid",
        },
        ["owner@example.invalid"],
      ),
    ).toBe("customer");
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
