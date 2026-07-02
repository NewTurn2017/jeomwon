import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

// AUTH_DEV_ANONYMOUS is the deployment guard for this dev-only provider.
// Never set it on production deployments; the setup wizard/docs must enforce
// that operators only opt in on dev deployments.
const enableDevAnonymous = process.env.AUTH_DEV_ANONYMOUS === "1";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google,
    ...(enableDevAnonymous
      ? [
          Anonymous({
            profile: () => ({
              isAnonymous: true,
              name: "Dev Operator",
              username: "dev-operator",
            }),
          }),
        ]
      : []),
  ],
});
