import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@jeomwon/ui/globals.css";
import "@/components/customer-chat-widget.css";
import { domainConfig } from "@jeomwon/backend/domain.config";
import { cn } from "@jeomwon/ui/utils";
import type { Metadata } from "next";
import { DemoBanner } from "@/components/demo-banner";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { env } from "@/env";
import { ConvexClientProvider } from "./convex-client-provider";

const pageTitle = `${domainConfig.storeName} 예약`;
const pageDescription = `${domainConfig.storeName}의 서비스 예약을 채팅으로 문의하고 확정할 수 있습니다.`;

export const metadata: Metadata = {
  title: {
    default: pageTitle,
    template: `%s | ${domainConfig.storeName}`,
  },
  description: pageDescription,
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: pageTitle,
    description: pageDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const language = domainConfig.locale === "ko-KR" ? "ko" : "en";

  return (
    <html lang={language} suppressHydrationWarning>
      <body className={cn("min-h-screen bg-background font-sans antialiased")}>
        <ConvexClientProvider>
          <Header />
          <DemoBanner enabled={env.NEXT_PUBLIC_JEOMWON_DEMO === "1"} />
          {children}
          <Footer />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
