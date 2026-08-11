import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/app/[locale]/(dashboard)/_components/admin-dashboard";
import { Header } from "@/app/[locale]/(dashboard)/_components/header";
import { loadViewerRole } from "@/lib/admin-routing";
import { getScopedI18n } from "@/locales/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getScopedI18n("admin");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (
    process.env.JEOMWON_QA_NO_SHOW_FIXTURE === "1" &&
    process.env.JEOMWON_QA_RESET === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    const [{ locale }, query] = await Promise.all([params, searchParams]);
    const { AdminNoShowQaFixture } = await import(
      "@/app/[locale]/(dashboard)/_components/admin-no-show-qa-fixture"
    );
    return (
      <AdminNoShowQaFixture
        lang={locale === "ko" ? "ko" : "en"}
        scenario={query.scenario ?? "success"}
      />
    );
  }

  const token = await convexAuthNextjsToken();
  const role = await loadViewerRole(() =>
    fetchQuery(jeomwonConvex.admin.viewerRole, {}, { token }),
  );

  if (role !== "operator") {
    notFound();
  }

  const t = await getScopedI18n("admin");
  return (
    <>
      <Header title={t("title")} description={t("description")} />
      <AdminDashboard />
    </>
  );
}
