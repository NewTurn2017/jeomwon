import Image from "next/image";
import { GoogleSignin } from "@/components/google-signin";
import { getScopedI18n } from "@/locales/server";

export const metadata = {
  title: "Jeomwon Login",
};

export default async function Page() {
  const t = await getScopedI18n("login");
  const devAnonymousEnabled = process.env.AUTH_DEV_ANONYMOUS === "1";

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-secondary px-6 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col items-center justify-center gap-5 rounded-lg border border-border bg-card p-8">
        <Image src="/logo.png" alt="logo" width={350} height={350} />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-semibold text-2xl text-primary">{t("title")}</h1>
          <p className="text-primary/60 text-sm">{t("description")}</p>
        </div>
        <GoogleSignin devAnonymousEnabled={devAnonymousEnabled} />
      </div>
    </div>
  );
}
