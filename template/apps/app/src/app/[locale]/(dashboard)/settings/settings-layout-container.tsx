"use client";

import { buttonVariants } from "@jeomwon/ui/button";
import { cn } from "@jeomwon/ui/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScopedI18n } from "@/locales/client";

export function SettingsLayoutContainer({
  children,
  isPolarEnabled,
}: {
  children: React.ReactNode;
  isPolarEnabled: boolean;
}) {
  const t = useScopedI18n("settings.sidebar");
  const pathname = usePathname();
  const normalizedPath =
    pathname.replace(/^\/(ko|en|fr|es)(?=\/|$)/, "") || "/";
  const isSettingsPath = normalizedPath === "/settings";
  const isBillingPath = normalizedPath === "/settings/billing";

  return (
    <div className="flex h-full w-full px-4 py-6 sm:px-6 lg:py-8">
      <div className="mx-auto grid h-full w-full max-w-screen-xl gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex w-full gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          <Link
            href="/settings"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              isSettingsPath && "bg-muted",
              "justify-start rounded-md",
            )}
          >
            <span
              className={cn(
                "text-foreground text-sm",
                isSettingsPath && "font-medium",
              )}
            >
              {t("general")}
            </span>
          </Link>
          {isPolarEnabled && (
            <Link
              href="/settings/billing"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                isBillingPath && "bg-muted",
                "justify-start rounded-md",
              )}
            >
              <span
                className={cn(
                  "text-foreground text-sm",
                  isBillingPath && "font-medium",
                )}
              >
                {t("billing")}
              </span>
            </Link>
          )}
        </aside>
        {children}
      </div>
    </div>
  );
}
