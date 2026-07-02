import { domainConfig } from "@v1/backend/domain.config";
import { I18nProviderClient } from "@/locales/client";
import { SettingsLayoutContainer } from "./settings-layout-container";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <I18nProviderClient locale={locale}>
      <SettingsLayoutContainer isPolarEnabled={domainConfig.features.polar}>
        {children}
      </SettingsLayoutContainer>
    </I18nProviderClient>
  );
}
