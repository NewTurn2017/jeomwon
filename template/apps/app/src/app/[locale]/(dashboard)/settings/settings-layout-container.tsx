"use client";

import { buttonVariants } from "@v1/ui/button";
import { cn } from "@v1/ui/utils";
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
  const isSettingsPath = pathname === "/settings";
  const isBillingPath = pathname === "/settings/billing";

  return (
    <div className="flex h-full w-full px-6 py-8">
      <div className="mx-auto flex h-full w-full max-w-screen-xl gap-12">
        <div className="hidden w-full max-w-64 flex-col gap-0.5 lg:flex">
          <Link
            href="/settings"
            className={cn(
              `${buttonVariants({ variant: "ghost" })} ${isSettingsPath && "bg-primary/5"}`,
              "justify-start rounded-md",
            )}
          >
            <span
              className={cn(
                `text-sm text-primary/80 ${isSettingsPath && "font-medium text-primary"}`,
              )}
            >
              {t("general")}
            </span>
          </Link>
          {isPolarEnabled && (
            <Link
              href="/settings/billing"
              className={cn(
                `${buttonVariants({ variant: "ghost" })} ${isBillingPath && "bg-primary/5"} justify-start rounded-md`,
              )}
            >
              <span
                className={cn(
                  `text-sm text-primary/80 ${isBillingPath && "font-medium text-primary"}`,
                )}
              >
                {t("billing")}
              </span>
            </Link>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
