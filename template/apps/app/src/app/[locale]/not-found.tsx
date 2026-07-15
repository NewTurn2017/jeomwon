import { getScopedI18n } from "@/locales/server";

// A not-found boundary inside the dynamic [locale] layout. Without it, notFound()
// thrown deep in a rendered route (e.g. /admin for a non-operator) falls through
// to the root default not-found, which resolves outside this already-streamed
// layout and returns HTTP 200. With this segment boundary Next renders the
// not-found here and emits a real 404 status, so /admin is genuinely "not found"
// for non-operators, not just visually.
export default async function LocaleNotFound() {
  const t = await getScopedI18n("notFound");

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-16 text-foreground">
      <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <svg
            aria-hidden="true"
            className="h-6 w-6"
            fill="none"
            height="24"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            viewBox="0 0 24 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl text-card-foreground">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {t("description")}
          </p>
        </div>
      </section>
    </main>
  );
}
