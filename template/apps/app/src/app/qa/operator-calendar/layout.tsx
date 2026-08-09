import "@jeomwon/ui/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { notFound } from "next/navigation";

export default function OperatorCalendarQaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (
    process.env.JEOMWON_QA_RESET !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    notFound();
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-muted/40 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
