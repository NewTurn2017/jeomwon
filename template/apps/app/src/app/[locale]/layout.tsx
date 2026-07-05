import "@jeomwon/ui/globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { TooltipProvider } from "@jeomwon/ui/tooltip";
import { cn } from "@jeomwon/ui/utils";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { I18nProviderClient } from "@/locales/client";
import { ConvexClientProvider } from "../convex-client-provider";

export const metadata: Metadata = {
  title: "Jeomwon",
  description: "AI reservation operations dashboard",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)" },
    { media: "(prefers-color-scheme: dark)" },
  ],
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  return (
    <ConvexAuthNextjsServerProvider>
      <html lang={locale} suppressHydrationWarning>
        <body className={cn("font-sans antialiased")}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider delayDuration={0}>
              <I18nProviderClient locale={locale}>
                <ConvexClientProvider>{children}</ConvexClientProvider>
              </I18nProviderClient>
            </TooltipProvider>
          </ThemeProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
