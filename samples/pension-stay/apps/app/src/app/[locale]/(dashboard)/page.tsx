import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { domainConfig } from "@pension-stay/backend/domain.config";
import { jeomwonConvex } from "@pension-stay/backend/src/convex-refs";
import { fetchQuery } from "convex/nextjs";
import { AdminDashboard } from "@/app/[locale]/(dashboard)/_components/admin-dashboard";
import { CustomerCalendar } from "@/app/[locale]/(dashboard)/_components/customer-calendar";
import { Header } from "@/app/[locale]/(dashboard)/_components/header";
import { getScopedI18n } from "@/locales/server";

export const metadata = {
  title: "Jeomwon Admin",
};

export default async function Page() {
  const t = await getScopedI18n("dashboard");

  // Compile-time flag first. With customerAccounts OFF the role branch never
  // even evaluates: the operator dashboard renders byte-for-byte as it does
  // today, with no extra Convex round-trip and no customer surface compiled in.
  if (!domainConfig.features.customerAccounts) {
    return (
      <>
        <Header title={t("title")} description={t("description")} />
        <AdminDashboard />
      </>
    );
  }

  // Flag ON: the role is decided by Convex (the operator allowlist lives in the
  // deployment env, not here) using the same `isOperator` rule as `ensureAdmin`.
  // We never trust a client-sent role.
  const token = await convexAuthNextjsToken();
  const role = await fetchQuery(jeomwonConvex.admin.viewerRole, {}, { token });

  if (role === "operator") {
    return (
      <>
        <Header title={t("title")} description={t("description")} />
        <AdminDashboard />
      </>
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
