import { AdminDashboard } from "@/app/[locale]/(dashboard)/_components/admin-dashboard";
import { Header } from "@/app/[locale]/(dashboard)/_components/header";
import { getScopedI18n } from "@/locales/server";

export const metadata = {
  title: "Jeomwon Admin",
};

export default async function Page() {
  const t = await getScopedI18n("dashboard");

  return (
    <>
      <Header title={t("title")} description={t("description")} />
      <AdminDashboard />
    </>
  );
}
