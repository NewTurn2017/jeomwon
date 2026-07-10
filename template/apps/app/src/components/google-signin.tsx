"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@jeomwon/ui/button";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useScopedI18n } from "@/locales/client";

export function GoogleSignin({
  devAnonymousEnabled = false,
}: {
  devAnonymousEnabled?: boolean;
}) {
  const t = useScopedI18n("login");
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [signingInWith, setSigningInWith] = useState<
    "google" | "anonymous" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  async function signInWithProvider(provider: "google" | "anonymous") {
    setSigningInWith(provider);
    setErrorMessage(null);
    try {
      const result = await signIn(provider, { redirectTo: "/" });
      if (result.signingIn) {
        router.replace("/");
      }
    } catch {
      setErrorMessage(t("signInError"));
    } finally {
      setSigningInWith(null);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Button
        className="w-full gap-2"
        disabled={signingInWith !== null}
        onClick={() => void signInWithProvider("google")}
      >
        <GoogleIcon />
        {signingInWith === "google" ? t("actionWorking") : t("google")}
      </Button>
      {devAnonymousEnabled ? (
        <div className="flex w-full flex-col items-center gap-2 rounded-md border border-chart-3/30 bg-chart-3/10 p-3">
          <Button
            className="w-full"
            disabled={signingInWith !== null}
            type="button"
            variant="secondary"
            onClick={() => void signInWithProvider("anonymous")}
          >
            {signingInWith === "anonymous"
              ? t("actionWorking")
              : t("devAnonymous")}
          </Button>
          <p className="text-center text-chart-3 text-xs">{t("devOnly")}</p>
        </div>
      ) : null}
      {errorMessage ? (
        <p className="text-center text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

// Official multi-color Google "G" brand mark; brand hex values are intentional
// and must not be replaced with semantic theme tokens.
function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
