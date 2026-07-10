"use client";

import "@jeomwon/ui/globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <main className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-16 text-foreground">
          <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
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
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="font-semibold text-2xl text-card-foreground">
                문제가 발생했습니다
              </h1>
              <p className="text-muted-foreground text-sm leading-6">
                예상치 못한 오류로 화면을 표시하지 못했습니다. 잠시 후 다시
                시도해 주세요.
              </p>
            </div>
            {error.digest ? (
              <p className="rounded-md bg-muted px-3 py-1 font-mono text-muted-foreground text-xs">
                오류 코드: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              className="mt-2 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 font-medium text-primary-foreground text-sm transition hover:bg-primary/90"
            >
              다시 시도
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
