import "@jeomwon/ui/globals.css";
import { domainConfig } from "@jeomwon/backend/domain.config";
import { cn } from "@jeomwon/ui/utils";
import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
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
          {children}
          <Footer />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
