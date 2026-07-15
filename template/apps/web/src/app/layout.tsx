import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@jeomwon/ui/globals.css";
import { domainConfig } from "@jeomwon/backend/domain.config";
import { cn } from "@jeomwon/ui/utils";
import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

const pageTitle = `${domainConfig.storeName} 예약`;
const pageDescription = `${domainConfig.storeName}의 서비스와 운영 시간을 확인하고 예약 앱으로 이동할 수 있습니다.`;

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
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
