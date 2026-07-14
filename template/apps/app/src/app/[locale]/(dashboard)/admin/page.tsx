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

export default async function Page() {
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
