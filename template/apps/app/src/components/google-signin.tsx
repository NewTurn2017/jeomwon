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
        className="w-full"
        disabled={signingInWith !== null}
        onClick={() => void signInWithProvider("google")}
      >
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
