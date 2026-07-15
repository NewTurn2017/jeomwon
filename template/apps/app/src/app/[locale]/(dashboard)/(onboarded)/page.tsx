import { CustomerReservationManager } from "@/app/[locale]/(dashboard)/_components/customer-reservation-manager";
import { Header } from "@/app/[locale]/(dashboard)/_components/header";
import { getScopedI18n } from "@/locales/server";

export default async function Page() {
  const t = await getScopedI18n("dashboard");

  return (
    <>
      <Header
        title={t("customer.title")}
        description={t("customer.description")}
      />
      <CustomerReservationManager />
    </>
  );
}
