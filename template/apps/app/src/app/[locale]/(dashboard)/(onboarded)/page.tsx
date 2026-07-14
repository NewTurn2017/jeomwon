import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { domainConfig } from "@jeomwon/backend/domain.config";
import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { fetchQuery } from "convex/nextjs";
import { AdminDashboard } from "@/app/[locale]/(dashboard)/_components/admin-dashboard";
import { CustomerCalendar } from "@/app/[locale]/(dashboard)/_components/customer-calendar";
import { Header } from "@/app/[locale]/(dashboard)/_components/header";
import {
  loadViewerRole,
  rootDashboardSurface,
} from "@/lib/admin-routing";
import { getScopedI18n } from "@/locales/server";

export const metadata = {
  title: "Jeomwon Admin",
};

export default async function Page() {
  const t = await getScopedI18n("dashboard");
  const token = await convexAuthNextjsToken();
  const role = await loadViewerRole(() =>
    fetchQuery(jeomwonConvex.admin.viewerRole, {}, { token }),
  );
  const surface = rootDashboardSurface(
    role,
    domainConfig.features.customerAccounts,
  );

  if (surface === "operator") {
    return (
      <>
        <Header title={t("title")} description={t("description")} />
        <AdminDashboard />
      </>
    );
  }

  if (surface === "customer-disabled") {
    return (
      <Header
        title={t("customer.disabledTitle")}
        description={t("customer.disabledDescription")}
      />
    );
  }

  return (
    <>
      <Header
        title={t("customer.title")}
        description={t("customer.description")}
      />
      <CustomerCalendar />
    </>
  );
}
