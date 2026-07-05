import { GoogleSignin } from "@/components/google-signin";
import { getScopedI18n } from "@/locales/server";

export const metadata = {
  title: "Jeomwon Login",
};

export default async function Page() {
  const t = await getScopedI18n("login");
  const devAnonymousEnabled = process.env.AUTH_DEV_ANONYMOUS === "1";

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-muted/40 px-4 py-10">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-sm md:grid-cols-[1fr_380px]">
        <div className="flex min-h-80 flex-col justify-between border-border border-b p-8 md:border-r md:border-b-0">
          <div>
            <div className="inline-flex rounded-md border border-border bg-background px-3 py-2 font-semibold text-foreground text-sm">
              Jeomwon
            </div>
            <h1 className="mt-8 max-w-xl font-semibold text-3xl text-card-foreground leading-tight">
              {t("title")}
            </h1>
            <p className="mt-4 max-w-md text-muted-foreground text-sm leading-6">
              {t("description")}
            </p>
          </div>
          <p className="mt-10 text-muted-foreground text-xs">{t("privacy")}</p>
        </div>
        <div className="flex flex-col justify-center gap-5 p-8">
          <div>
            <h2 className="font-semibold text-card-foreground text-lg">
              {t("cardTitle")}
            </h2>
            <p className="mt-2 text-muted-foreground text-sm">
              {t("cardDescription")}
            </p>
          </div>
          <GoogleSignin devAnonymousEnabled={devAnonymousEnabled} />
        </div>
      </section>
    </main>
  );
}
