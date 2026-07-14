import { domainConfig } from "@jeomwon/backend/domain.config";
import type { Metadata } from "next";
import { GoogleSignin } from "@/components/google-signin";
import { normalizeReturnTo } from "@/lib/admin-routing";
import { getScopedI18n } from "@/locales/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getScopedI18n("login");

  return {
    title: `${domainConfig.storeName} · ${t("title")}`,
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getScopedI18n("login");
  const devAnonymousEnabled = process.env.AUTH_DEV_ANONYMOUS === "1";
  const returnTo = normalizeReturnTo((await searchParams).returnTo);

  return (
    <main className="flex min-h-[100dvh] w-full items-center justify-center bg-muted/40 px-4 py-8">
      <section
        aria-labelledby="login-title"
        className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8"
      >
        <p className="text-center font-semibold text-card-foreground text-sm leading-5">
          {domainConfig.storeName}
        </p>
        <div className="mt-6 text-center">
          <h1
            className="font-semibold text-2xl text-card-foreground leading-tight"
            id="login-title"
          >
            {t("title")}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {t("description")}
          </p>
        </div>
        <div className="mt-8">
          <GoogleSignin
            devAnonymousEnabled={devAnonymousEnabled}
            returnTo={returnTo}
          />
        </div>
        <p className="mt-6 text-center text-muted-foreground text-xs leading-5">
          {t("privacy")}
        </p>
      </section>
    </main>
  );
}
