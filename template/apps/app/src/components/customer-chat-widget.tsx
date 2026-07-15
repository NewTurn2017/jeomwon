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
  type KeyboardEvent,
  type SubmitEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

// The thread is derived from the signed-in identity inside Convex rather than
// minted in localStorage: this widget never invents a thread id. It reads its
// own thread from `chat.publicState` (which resolves it from the forwarded auth
// token) and echoes that id back on POST, where the authenticated /api/chat
// route forwards the token and Convex re-derives/verifies it.
export function CustomerChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const state = useQuery(jeomwonConvex.chat.publicState, {});
  const threadId = state?.threadId ?? null;
  const copy = state?.domain.copy;
  const messages = useMemo(() => state?.messages ?? [], [state?.messages]);
  const publicContext = state?.publicContext;
  const storeName = state?.domain.storeName ?? "Jeomwon";
  const timezone = state?.domain.storeTimezone ?? "Asia/Seoul";

  useEffect(() => {
    const openChat = () => {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setIsOpen(true);
    };
    window.addEventListener(openChatEventName, openChat);
    return () => window.removeEventListener(openChatEventName, openChat);
  }, []);

  useEffect(() => {
    if (isOpen) {
      textareaRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, publicContext?.status, isOpen]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
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

  function closePanel() {
    setIsOpen(false);
    returnFocusRef.current?.focus();
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    closePanel();
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {isOpen ? (
        <section
          aria-label="예약 채팅"
          className="chat_room flex h-[min(640px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/5"
          id="jeomwon-chat-panel"
          onKeyDown={handlePanelKeyDown}
        >
          <header className="chat_header flex flex-none items-center justify-between px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <StoreAvatar storeName={storeName} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-sm">
                  {copy?.chatTitle ?? "예약 도우미"}
                </p>
                <p className="truncate text-xs opacity-70">{storeName}</p>
              </div>
            </div>
            <Button
              aria-label="채팅 닫기"
              className="h-8 w-8 rounded-full"
              size="icon"
              type="button"
              variant="ghost"
              onClick={closePanel}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </header>

          <div
            ref={scrollRef}
            aria-label="대화 내용"
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
            role="log"
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
            className="chat_inputbar flex flex-none items-end gap-2 p-3"
            onSubmit={submit}
          >
            <textarea
              ref={textareaRef}
              aria-label="예약 문의 메시지 입력"
              className="chat_textfield max-h-28 min-h-10 min-w-0 flex-1 resize-none rounded-2xl px-4 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              disabled={isSending || !threadId || message.trim().length === 0}
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
        aria-controls="jeomwon-chat-panel"
        aria-expanded={isOpen}
        aria-label={isOpen ? "예약 채팅 닫기" : "예약 채팅 열기"}
        className="h-14 gap-2 rounded-full px-5 shadow-lg"
        type="button"
        onClick={(event) => {
          if (isOpen) {
            closePanel();
            return;
          }

          returnFocusRef.current = event.currentTarget;
          setIsOpen(true);
        }}
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
      <span className="chat_timestamp shrink-0 text-xs">{timeLabel}</span>
      <p className="chat_bubble--outgoing whitespace-pre-line rounded-2xl rounded-tr-md px-3 py-2 text-sm leading-6">
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
        <p className="chat_sender_name mb-1 font-medium text-xs">{storeName}</p>
        <div className="flex items-end gap-2">
          <p className="chat_bubble--incoming whitespace-pre-line rounded-2xl rounded-tl-md px-3 py-2 text-sm leading-6">
            {message}
          </p>
          <span className="chat_timestamp shrink-0 text-xs">{timeLabel}</span>
        </div>
      </div>
    </div>
  );
}

function SystemNotice({ children }: { children: string }) {
  return (
    <p className="chat_system_notice mx-auto max-w-[84%] rounded-full px-3 py-1.5 text-center text-xs leading-5">
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
      <article className="chat_reservation_card rounded-2xl rounded-tl-md p-3">
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
