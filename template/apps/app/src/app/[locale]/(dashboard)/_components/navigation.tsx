"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import type { api } from "@jeomwon/backend/convex/_generated/api";
import { Button, buttonVariants } from "@jeomwon/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@jeomwon/ui/dropdown-menu";
import { Logo } from "@jeomwon/ui/logo";
import { cn } from "@jeomwon/ui/utils";
import { type Preloaded, usePreloadedQuery } from "convex/react";
import { Check, ChevronDown, ChevronUp, LogOut, Settings } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  useChangeLocale,
  useCurrentLocale,
  useScopedI18n,
} from "@/locales/client";

const PolarCheckoutLink = dynamic(
  () =>
    import("./polar-checkout-link").then((module) => module.PolarCheckoutLink),
  { ssr: false },
);

type ProductsPreload = Preloaded<typeof api.subscriptions.listAllProducts>;

export function Navigation({
  isPolarEnabled,
  preloadedUser,
  preloadedProducts,
}: {
  isPolarEnabled: boolean;
  preloadedUser: Preloaded<typeof api.users.getUser>;
  preloadedProducts: ProductsPreload | null;
}) {
  const t = useScopedI18n("navigation");
  const { signOut } = useAuthActions();
  const pathname = usePathname();
  const router = useRouter();
  const normalizedPath = pathname.replace(/^\/(ko|en)(?=\/|$)/, "") || "/";
  const isDashboardPath = normalizedPath === "/";
  const isSettingsPath = normalizedPath === "/settings";
  const isBillingPath = normalizedPath === "/settings/billing";

  const user = usePreloadedQuery(preloadedUser);

  if (!user) {
    return null;
  }

  return (
    <nav className="sticky top-0 z-50 flex w-full flex-col border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
      <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between py-3">
        <div className="flex h-10 items-center gap-2">
          <Link
            href="/"
            aria-label="Jeomwon"
            className="flex h-10 items-center"
          >
            <Logo width={32} height={32} />
          </Link>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="gap-2 px-2 data-[state=open]:bg-muted"
              >
                <div className="flex items-center gap-2">
                  {user.avatarUrl ? (
                    <Image
                      unoptimized
                      className="h-8 w-8 rounded-full object-cover"
                      alt={user.name ?? user.email ?? ""}
                      src={user.avatarUrl}
                      width={32}
                      height={32}
                    />
                  ) : (
                    <span className="h-8 w-8 rounded-full border border-border bg-muted" />
                  )}

                  <p className="text-sm font-medium text-foreground">
                    {user?.name || ""}
                  </p>
                  <span className="flex h-5 items-center rounded-full bg-muted px-2 text-muted-foreground text-xs font-medium">
                    {t("free")}
                  </span>
                </div>
                <span className="flex flex-col items-center justify-center">
                  <ChevronUp className="relative top-[3px] h-[14px] w-[14px] stroke-[1.5px] text-muted-foreground" />
                  <ChevronDown className="relative bottom-[3px] h-[14px] w-[14px] stroke-[1.5px] text-muted-foreground" />
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              sideOffset={8}
              className="min-w-56 bg-card p-2"
            >
              <DropdownMenuLabel className="flex items-center font-normal text-muted-foreground text-xs">
                {t("account")}
              </DropdownMenuLabel>
              <DropdownMenuItem className="h-10 w-full cursor-pointer justify-between rounded-md bg-muted px-2">
                <div className="flex items-center gap-2">
                  {user.avatarUrl ? (
                    <Image
                      unoptimized
                      className="h-6 w-6 rounded-full object-cover"
                      alt={user.name ?? user.email ?? ""}
                      src={user.avatarUrl}
                      width={24}
                      height={24}
                    />
                  ) : (
                    <span className="h-6 w-6 rounded-full border border-border bg-background" />
                  )}

                  <p className="text-sm font-medium text-foreground">
                    {user.name || ""}
                  </p>
                </div>
                <Check className="h-[18px] w-[18px] stroke-[1.5px] text-muted-foreground" />
              </DropdownMenuItem>

              <DropdownMenuSeparator className="mx-0 my-2" />
              {isPolarEnabled && preloadedProducts && (
                <PolarUpgradeMenuItem preloadedProducts={preloadedProducts} />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex h-10 items-center gap-3">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 rounded-full">
                {user.avatarUrl ? (
                  <Image
                    unoptimized
                    className="min-h-8 min-w-8 rounded-full object-cover"
                    alt={user.name ?? user.email ?? ""}
                    src={user.avatarUrl}
                    width={32}
                    height={32}
                  />
                ) : (
                  <span className="min-h-8 min-w-8 rounded-full border border-border bg-muted" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              sideOffset={8}
              className="fixed -right-4 min-w-56 bg-card p-2"
            >
              <DropdownMenuItem className="group flex-col items-start focus:bg-transparent">
                <p className="text-sm font-medium text-foreground">
                  {user?.name || ""}
                </p>
                <p className="text-muted-foreground text-sm">{user?.email}</p>
              </DropdownMenuItem>

              <DropdownMenuItem
                className="group h-9 w-full cursor-pointer justify-between rounded-md px-2"
                onClick={() => router.push("/settings")}
              >
                <span className="text-muted-foreground text-sm group-hover:text-foreground group-focus:text-foreground">
                  {t("settings")}
                </span>
                <Settings className="h-[18px] w-[18px] stroke-[1.5px] text-muted-foreground group-hover:text-foreground group-focus:text-foreground" />
              </DropdownMenuItem>

              <ThemeSubmenu />
              <LanguageSubmenu />

              <DropdownMenuSeparator className="mx-0 my-2" />

              <DropdownMenuItem
                className="group h-9 w-full cursor-pointer justify-between rounded-md px-2"
                onClick={() => signOut()}
              >
                <span className="text-muted-foreground text-sm group-hover:text-foreground group-focus:text-foreground">
                  {t("logout")}
                </span>
                <LogOut className="h-[18px] w-[18px] stroke-[1.5px] text-muted-foreground group-hover:text-foreground group-focus:text-foreground" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-xl items-center gap-3">
        <div
          className={cn(
            "flex h-12 items-center border-b-2",
            isDashboardPath ? "border-primary" : "border-transparent",
          )}
        >
          <Link
            href="/"
            className={cn(
              `${buttonVariants({ variant: "ghost", size: "sm" })} text-foreground`,
            )}
          >
            {t("dashboard")}
          </Link>
        </div>
        <div
          className={cn(
            "flex h-12 items-center border-b-2",
            isSettingsPath ? "border-primary" : "border-transparent",
          )}
        >
          <Link
            href="/settings"
            className={cn(
              `${buttonVariants({ variant: "ghost", size: "sm" })} text-foreground`,
            )}
          >
            {t("settings")}
          </Link>
        </div>
        {isPolarEnabled && (
          <div
            className={cn(
              "flex h-12 items-center border-b-2",
              isBillingPath ? "border-primary" : "border-transparent",
            )}
          >
            <Link
              href="/settings/billing"
              className={cn(
                `${buttonVariants({ variant: "ghost", size: "sm" })} text-foreground`,
              )}
            >
              {t("billing")}
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

function PolarUpgradeMenuItem({
  preloadedProducts,
}: {
  preloadedProducts: ProductsPreload;
}) {
  const t = useScopedI18n("navigation");
  const products = usePreloadedQuery(preloadedProducts);
  const monthlyProProduct = products?.find(
    (product) => product.recurringInterval === "month",
  );
  const yearlyProProduct = products?.find(
    (product) => product.recurringInterval === "year",
  );

  if (!monthlyProProduct || !yearlyProProduct) {
    return null;
  }

  return (
    <DropdownMenuItem className="p-0 focus:bg-transparent">
      <Button size="sm" className="w-full" asChild>
        <PolarCheckoutLink
          productIds={[monthlyProProduct.id, yearlyProProduct.id]}
        >
          {t("upgradePro")}
        </PolarCheckoutLink>
      </Button>
    </DropdownMenuItem>
  );
}

function ThemeSubmenu() {
  const t = useScopedI18n("navigation");
  const { theme, setTheme, themes } = useTheme();

  function formatTheme(value: string) {
    if (value === "light") {
      return t("themeOptions.light");
    }
    if (value === "dark") {
      return t("themeOptions.dark");
    }
    return t("themeOptions.system");
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="h-9 rounded-md px-2 text-muted-foreground text-sm">
        {t("theme")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="bg-card">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themes.map((value) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              className="text-muted-foreground text-sm"
            >
              {formatTheme(value)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function LanguageSubmenu() {
  const t = useScopedI18n("navigation");
  const changeLocale = useChangeLocale();
  const locale = useCurrentLocale();

  const langs = [
    { text: "한국어", value: "ko" },
    { text: "English", value: "en" },
  ] as const;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="h-9 rounded-md px-2 text-muted-foreground text-sm">
        {t("language")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="bg-card">
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => changeLocale(value as "ko" | "en")}
        >
          {langs.map(({ text, value }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              className="text-muted-foreground text-sm"
            >
              {text}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
