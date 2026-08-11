"use client";

import type { AdminChatEvent } from "@jeomwon/backend/src/agent-contract";
import { Activity, Clock } from "lucide-react";
import { useScopedI18n } from "@/locales/client";
import { formatAdminDateTime } from "./admin-dashboard-format";

export function AdminAgentTimeline({
  events,
  locale,
}: {
  events: AdminChatEvent[];
  locale: string;
}) {
  const t = useScopedI18n("dashboard");
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-border border-b p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Activity aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-card-foreground text-lg">
              {t("timelineTitle")}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("timelineDescription")}
            </p>
          </div>
        </div>
        <span className="hidden rounded-full border border-border bg-background px-3 py-1 text-muted-foreground text-xs sm:inline-flex">
          {t("realtimeLabel")}
        </span>
      </div>
      <div className="divide-y divide-border">
        {events.length === 0 ? (
          <div className="px-5 py-8 text-muted-foreground text-sm">
            {t("timelineEmpty")}
          </div>
        ) : (
          events.slice(0, 24).map((event) => (
            <article
              className="grid gap-3 px-5 py-4 md:grid-cols-[180px_1fr_180px]"
              key={event.id}
            >
              <div>
                <p className="font-medium text-foreground text-sm">
                  {t(`agent.${event.agent}`)}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {event.type}
                </p>
              </div>
              <p className="min-w-0 text-foreground/80 text-sm">
                {event.message}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground text-xs md:justify-end">
                <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                {formatAdminDateTime(event.createdAtMs, locale)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
