import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import {
  anonymousLoginProviderPolicy,
  productAnonymousProfile,
} from "./authPolicy";
import { adminEmailAllowlist } from "./engine/identity";

// Product anonymous login is fail-closed: the operator allowlist must already be
// configured before this provider can be exposed.
const enableProductAnonymous = anonymousLoginProviderPolicy({
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
