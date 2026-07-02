"use client";

import { jeomwonConvex } from "@v1/backend/src/convex-refs";
import { Button } from "@v1/ui/button";
import { useQuery } from "convex/react";
import { CalendarClock, MessageCircle, Send, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

const threadStorageKey = "jeomwon_thread_id";

export function CustomerChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const state = useQuery(
    jeomwonConvex.chat.publicState,
    threadId ? { threadId } : "skip",
  );
  const copy = state?.domain.copy;
  const messages = useMemo(() => state?.messages ?? [], [state?.messages]);
  const publicContext = state?.publicContext;

  useEffect(() => {
    const existing = window.localStorage.getItem(threadStorageKey);
    const nextThreadId = existing ?? crypto.randomUUID();
    window.localStorage.setItem(threadStorageKey, nextThreadId);
    setThreadId(nextThreadId);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isOpen]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!threadId || !trimmed) {
      return;
    }

    setIsSending(true);
    setError(null);
    setMessage("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          thread_id: threadId,
          message: trimmed,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        const detail = body?.error?.details?.[0];
        setError(
          typeof detail === "string" ? detail : "요청을 처리하지 못했습니다.",
        );
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {isOpen ? (
        <section className="w-[calc(100vw-2rem)] max-w-[380px] overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
          <header className="flex items-center justify-between border-border border-b px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">
                {copy?.chatTitle ?? "예약 도우미"}
              </p>
              <p className="truncate text-muted-foreground text-xs">
                {state?.domain.storeName ?? "Jeomwon"}
              </p>
            </div>
            <Button
              aria-label="챗 닫기"
              className="h-8 w-8"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </header>

          <div
            ref={scrollRef}
            className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-4"
          >
            {state?.guardrailBanner ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive-foreground text-xs">
                {state.guardrailBanner}
              </div>
            ) : null}

            {messages.length === 0 ? (
              <div className="rounded-md border border-border bg-secondary/40 px-3 py-3 text-sm">
                {copy?.chatGreeting ??
                  "가능한 시간 확인, 임시 홀드, 확정을 도와드릴게요."}
              </div>
            ) : null}

            {messages
              .filter((event) => event.role !== "system")
              .map((event) => (
                <div
                  className={
                    event.role === "user"
                      ? "ml-auto max-w-[82%] rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm"
                      : "mr-auto max-w-[88%] whitespace-pre-line rounded-md border border-border bg-card px-3 py-2 text-card-foreground text-sm"
                  }
                  key={event.id}
                >
                  {event.message}
                </div>
              ))}

            {publicContext && publicContext.status !== "draft" ? (
              <div className="rounded-md border border-border bg-card p-3">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <CalendarClock aria-hidden="true" className="h-4 w-4" />
                  <span className="font-medium">예약 상태</span>
                </div>
                <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">상태</dt>
                  <dd>{publicContext.status}</dd>
                  <dt className="text-muted-foreground">서비스</dt>
                  <dd>{publicContext.serviceLabel ?? "-"}</dd>
                  <dt className="text-muted-foreground">리소스</dt>
                  <dd>{publicContext.resourceLabel ?? "-"}</dd>
                  <dt className="text-muted-foreground">시간</dt>
                  <dd>{publicContext.timeWindow ?? "-"}</dd>
                  <dt className="text-muted-foreground">다음</dt>
                  <dd>{publicContext.nextStep}</dd>
                </dl>
              </div>
            ) : null}

            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive-foreground text-xs">
                {error}
              </p>
            ) : null}
          </div>

          <form
            className="flex gap-2 border-border border-t p-3"
            onSubmit={submit}
          >
            <input
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={isSending}
              placeholder={copy?.chatPlaceholder ?? "예약 문의를 입력하세요"}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button
              aria-label="메시지 보내기"
              className="h-10 w-10"
              disabled={isSending}
              size="icon"
              type="submit"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
            </Button>
          </form>
        </section>
      ) : null}

      <Button
        aria-label="예약 챗 열기"
        className="h-12 w-12 rounded-full shadow-xl"
        size="icon"
        type="button"
        onClick={() => setIsOpen((value) => !value)}
      >
        <MessageCircle aria-hidden="true" className="h-5 w-5" />
      </Button>
    </div>
  );
}
