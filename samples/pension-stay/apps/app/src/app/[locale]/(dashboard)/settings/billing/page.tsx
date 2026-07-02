import { domainConfig } from "@pension-stay/backend/domain.config";
import { notFound } from "next/navigation";

export default async function BillingSettingsPage() {
  if (!domainConfig.features.polar) {
    notFound();
  }

  const { default: BillingSettings } = await import("./billing-settings");
  return <BillingSettings />;
}
