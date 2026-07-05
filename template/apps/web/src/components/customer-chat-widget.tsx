"use client";

import type { PublicContext } from "@jeomwon/backend/src/agent-contract";
import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { Button } from "@jeomwon/ui/button";
import { cn } from "@jeomwon/ui/utils";
import { useQuery } from "convex/react";
import {
  CalendarClock,
  LoaderCircle,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const threadStorageKey = "jeomwon_thread_id";
const openChatEventName = "jeomwon:open-chat";
const friendlyErrorMessage =
  "메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.";

const reservationStatusView: Record<
  PublicContext["status"],
  { label: string; className: string }
> = {
  draft: { label: "예약 준비", className: "bg-muted text-muted-foreground" },
  eligible: {
    label: "예약 가능",
    className: "bg-accent text-accent-foreground",
  },
  held: {
    label: "임시 홀드",
    className: "bg-primary/10 text-primary",
  },
  confirmed: {
    label: "예약 확정",
    className: "bg-emerald-100 text-emerald-900",
  },
  rescheduled: {
    label: "일정 변경됨",
    className: "bg-sky-100 text-sky-900",
  },
  waitlisted: {
    label: "대기 등록",
    className: "bg-amber-100 text-amber-900",
  },
  cancelled: {
    label: "예약 취소",
    className: "bg-muted text-muted-foreground",
  },
  expired: {
    label: "홀드 만료",
    className: "bg-muted text-muted-foreground",
  },
  denied: {
    label: "예약 불가",
    className: "bg-destructive/10 text-destructive",
  },
  escalated: {
    label: "확인 필요",
    className: "bg-amber-100 text-amber-900",
  },
};

export function CustomerChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const state = useQuery(
    jeomwonConvex.chat.publicState,
    threadId ? { threadId } : "skip",
  );
  const copy = state?.domain.copy;
  const messages = useMemo(() => state?.messages ?? [], [state?.messages]);
  const publicContext = state?.publicContext;
  const storeName = state?.domain.storeName ?? "Jeomwon";
  const timezone = state?.domain.storeTimezone ?? "Asia/Seoul";

  useEffect(() => {
    const existing = window.localStorage.getItem(threadStorageKey);
    const nextThreadId = existing ?? crypto.randomUUID();
    window.localStorage.setItem(threadStorageKey, nextThreadId);
    setThreadId(nextThreadId);
  }, []);

  useEffect(() => {
    const openChat = () => setIsOpen(true);
    window.addEventListener(openChatEventName, openChat);
    return () => window.removeEventListener(openChatEventName, openChat);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, publicContext?.status, isOpen]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!threadId || !trimmed || isSending) {
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
        setError(friendlyErrorMessage);
      }
    } catch {
      setError(friendlyErrorMessage);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || isComposing) {
      return;
    }

    event.preventDefault();
    formRef.current?.requestSubmit();
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {isOpen ? (
        <section
          aria-label="예약 채팅"
          className="flex h-[min(640px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-lg border border-border bg-secondary shadow-lg"
        >
          <header className="flex flex-none items-center justify-between border-border border-b bg-card px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <StoreAvatar storeName={storeName} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-card-foreground text-sm">
                  {copy?.chatTitle ?? "예약 도우미"}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {storeName}
                </p>
              </div>
            </div>
            <Button
              aria-label="채팅 닫기"
              className="h-8 w-8 rounded-full"
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
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          >
            {state?.guardrailBanner ? (
              <SystemNotice>
                {copy?.guardrailBanner ?? state.guardrailBanner}
              </SystemNotice>
            ) : null}

            {messages.length === 0 ? (
              <AssistantBubble
                message={
                  copy?.chatGreeting ??
                  "가능한 시간 확인, 임시 홀드, 확정을 도와드릴게요."
                }
                storeName={storeName}
                timeLabel={formatChatTime(Date.now(), timezone)}
              />
            ) : null}

            {messages.map((event) => {
              if (event.role === "system") {
                return (
                  <SystemNotice key={event.id}>{event.message}</SystemNotice>
                );
              }

              if (event.role === "user") {
                return (
                  <UserBubble
                    key={event.id}
                    message={event.message}
                    timeLabel={formatChatTime(event.createdAtMs, timezone)}
                  />
                );
              }

              return (
                <AssistantBubble
                  key={event.id}
                  message={event.message}
                  storeName={storeName}
                  timeLabel={formatChatTime(event.createdAtMs, timezone)}
                />
              );
            })}

            {publicContext && publicContext.status !== "draft" ? (
              <ReservationCard
                context={publicContext}
                storeName={storeName}
                timezone={timezone}
              />
            ) : null}

            {error ? <SystemNotice>{error}</SystemNotice> : null}
          </div>

          <form
            ref={formRef}
            className="flex flex-none items-end gap-2 border-border border-t bg-card p-3"
            onSubmit={submit}
          >
            <textarea
              className="max-h-28 min-h-10 min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isSending}
              placeholder={copy?.chatPlaceholder ?? "예약 문의를 입력하세요"}
              rows={1}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onCompositionEnd={() => setIsComposing(false)}
              onCompositionStart={() => setIsComposing(true)}
              onKeyDown={handleKeyDown}
            />
            <Button
              aria-label="메시지 보내기"
              className="h-10 w-10 shrink-0 rounded-full"
              disabled={isSending || message.trim().length === 0}
              size="icon"
              type="submit"
            >
              {isSending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Send aria-hidden="true" className="h-4 w-4" />
              )}
            </Button>
          </form>
        </section>
      ) : null}

      <Button
        aria-label="예약 채팅 열기"
        className="h-14 gap-2 rounded-full px-5 shadow-lg"
        type="button"
        onClick={() => setIsOpen((value) => !value)}
      >
        <MessageCircle aria-hidden="true" className="h-5 w-5" />
        예약 문의
      </Button>
    </div>
  );
}

function StoreAvatar({ storeName }: { storeName: string }) {
  const initial = Array.from(storeName.trim())[0] ?? "점";

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm">
      {initial}
    </span>
  );
}

function UserBubble({
  message,
  timeLabel,
}: {
  message: string;
  timeLabel: string;
}) {
  return (
    <div className="ml-auto flex max-w-[82%] items-end gap-2">
      <span className="text-muted-foreground text-[11px]">{timeLabel}</span>
      <p className="whitespace-pre-line rounded-lg rounded-br-sm bg-primary px-3 py-2 text-primary-foreground text-sm leading-6">
        {message}
      </p>
    </div>
  );
}

function AssistantBubble({
  message,
  storeName,
  timeLabel,
}: {
  message: string;
  storeName: string;
  timeLabel: string;
}) {
  return (
    <div className="flex max-w-[88%] items-start gap-2">
      <StoreAvatar storeName={storeName} />
      <div className="min-w-0">
        <p className="mb-1 font-medium text-muted-foreground text-xs">
          {storeName}
        </p>
        <div className="flex items-end gap-2">
          <p className="whitespace-pre-line rounded-lg rounded-bl-sm border border-border bg-card px-3 py-2 text-card-foreground text-sm leading-6">
            {message}
          </p>
          <span className="shrink-0 text-muted-foreground text-[11px]">
            {timeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function SystemNotice({ children }: { children: string }) {
  return (
    <p className="mx-auto max-w-[84%] rounded-full bg-muted px-3 py-1.5 text-center text-muted-foreground text-xs leading-5">
      {children}
    </p>
  );
}

function ReservationCard({
  context,
  storeName,
  timezone,
}: {
  context: PublicContext;
  storeName: string;
  timezone: string;
}) {
  const status = reservationStatusView[context.status];

  return (
    <div className="flex max-w-[92%] items-start gap-2">
      <StoreAvatar storeName={storeName} />
      <article className="rounded-lg rounded-bl-sm border border-border bg-card p-3 text-card-foreground">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarClock aria-hidden="true" className="h-4 w-4" />
            <h3 className="font-semibold text-sm">예약 상태</h3>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-medium text-xs",
              status.className,
            )}
          >
            {status.label}
          </span>
        </div>
        <dl className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">서비스</dt>
          <dd>{context.serviceLabel ?? "상담 후 안내"}</dd>
          <dt className="text-muted-foreground">담당</dt>
          <dd>{context.resourceLabel ?? "상담 후 배정"}</dd>
          <dt className="text-muted-foreground">시간</dt>
          <dd>{context.timeWindow ?? "원하는 시간을 알려 주세요"}</dd>
          <dt className="text-muted-foreground">다음</dt>
          <dd>{context.nextStep}</dd>
        </dl>
        <p className="mt-3 text-muted-foreground text-xs">
          기준 시간대: {timezone}
        </p>
      </article>
    </div>
  );
}

function formatChatTime(timestampMs: number, timezone: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(new Date(timestampMs));
}
