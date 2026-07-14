import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import { domainConfig } from "../domain.config";
import {
  anonymousLoginProviderPolicy,
  productAnonymousProfile,
} from "./authPolicy";
import { adminEmailAllowlist } from "./engine/identity";

// Product anonymous login is fail-closed. The legacy web flow remains unchanged
// while customer accounts are disabled, and the operator allowlist must already
// be configured before this provider can be exposed.
const enableProductAnonymous = anonymousLoginProviderPolicy({
  customerAccounts: domainConfig.features.customerAccounts,
  anonymousLoginEnv: process.env.AUTH_ANONYMOUS_LOGIN,
  adminEmailAllowlist: adminEmailAllowlist(),
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google,
    ...(enableProductAnonymous
      ? [
          Anonymous({
            profile: productAnonymousProfile,
          }),
        ]
      : []),
  ],
});
