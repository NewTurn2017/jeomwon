import {
  type BusinessHoursWindow,
  domainConfig,
  getServiceDurationMinutes,
  type Weekday,
} from "@pension-stay/backend/domain.config";
import { CalendarDays, Clock3, MessageCircle, ShieldCheck } from "lucide-react";
import { ChatCtaButton } from "@/components/chat-cta-button";

const weekdayLabels: Record<Weekday, string> = {
  monday: "월요일",
  tuesday: "화요일",
  wednesday: "수요일",
  thursday: "목요일",
  friday: "금요일",
  saturday: "토요일",
  sunday: "일요일",
};

const orderedWeekdays = Object.keys(weekdayLabels) as Weekday[];

function formatBusinessHours(window: BusinessHoursWindow) {
  if ("closed" in window) {
    return "휴무";
  }

  return `${window.open} - ${window.close}`;
}

function formatServiceDuration(minutes: number) {
  if (minutes >= 24 * 60) {
    return "1일 단위";
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60}시간`;
  }

  return `${minutes}분`;
}

export default function Page() {
  const services = domainConfig.services.map((service) => ({
    ...service,
    durationLabel: formatServiceDuration(getServiceDurationMinutes(service)),
  }));

  return (
    <main className="min-h-screen">
      <section className="border-border border-b bg-background">
        <div className="container grid min-h-[calc(100vh-5rem)] gap-12 py-16 md:grid-cols-[minmax(0,1fr)_420px] md:items-center md:py-20">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-6xl">
              {domainConfig.storeName} 예약
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              원하는 서비스와 시간을 채팅으로 남기면 예약 가능 여부 확인부터
              임시 홀드와 확정 안내까지 한 흐름으로 도와드립니다.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ChatCtaButton className="h-12 gap-2 px-5 text-base">
                <MessageCircle aria-hidden="true" className="h-5 w-5" />
                채팅으로 예약하기
              </ChatCtaButton>
              <a
                className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-5 font-medium text-foreground text-sm transition-colors hover:bg-muted"
                href="#services"
              >
                서비스 먼저 보기
              </a>
            </div>
          </div>

          <aside
            aria-label="예약 안내 요약"
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CalendarDays aria-hidden="true" className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-card-foreground">예약 안내</p>
                <p className="text-muted-foreground text-sm">
                  {domainConfig.copy.policySummary}
                </p>
              </div>
            </div>
            <dl className="mt-6 grid gap-4">
              <div className="rounded-md bg-muted p-4">
                <dt className="flex items-center gap-2 font-medium text-sm">
                  <Clock3 aria-hidden="true" className="h-4 w-4" />
                  임시 홀드
                </dt>
                <dd className="mt-2 text-muted-foreground text-sm">
                  선택한 시간은 {domainConfig.policies.holdMinutes}분 동안
                  임시로 잡아둡니다.
                </dd>
              </div>
              <div className="rounded-md bg-muted p-4">
                <dt className="flex items-center gap-2 font-medium text-sm">
                  <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                  변경 및 취소
                </dt>
                <dd className="mt-2 text-muted-foreground text-sm">
                  예약 시작 {domainConfig.policies.cancelWindowHours}시간 이내
                  요청은 확인 후 처리됩니다.
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="bg-muted/40 py-16" id="services">
        <div className="container">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-foreground">
              예약 가능한 서비스
            </h2>
            <p className="mt-3 text-muted-foreground">
              현재 공개된 서비스와 기본 소요 시간입니다. 세부 일정은 채팅에서
              가능한 시간 기준으로 안내됩니다.
            </p>
          </div>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {services.map((service) => (
              <li
                className="rounded-lg border border-border bg-card p-5"
                key={service.key}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-card-foreground">
                      {service.label}
                    </h3>
                    <p className="mt-2 text-muted-foreground text-sm">
                      기본 소요 시간 {service.durationLabel}
                    </p>
                  </div>
                  {service.price ? (
                    <span className="rounded-md bg-secondary px-2.5 py-1 font-medium text-secondary-foreground text-sm">
                      {service.price}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-background py-16">
        <div className="container grid gap-8 md:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              영업 안내
            </h2>
            <p className="mt-3 text-muted-foreground">
              운영 시간 안에서 예약 가능 시간을 확인합니다.
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {orderedWeekdays.map((weekday) => (
              <div
                className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
                key={weekday}
              >
                <dt className="font-medium text-sm">
                  {weekdayLabels[weekday]}
                </dt>
                <dd className="text-muted-foreground text-sm">
                  {formatBusinessHours(domainConfig.businessHours[weekday])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
