import { notFound } from "next/navigation";
import { OperatorCalendarQaFixture } from "./operator-calendar-qa-fixture";

export default async function OperatorCalendarQaPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; scenario?: string }>;
}) {
  if (
    process.env.JEOMWON_QA_RESET !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    notFound();
  }

  const query = await searchParams;
  return (
    <OperatorCalendarQaFixture
      lang={query.lang === "ko" ? "ko" : "en"}
      scenario={query.scenario ?? "success"}
    />
  );
}
