# Jeomwon — 현행 기능 세트

> 골격(`template/`)이 **지금 제공하는** 기능을 코드와 대조해 사실만 기록한 문서.
> "왜/어디로"는 [VISION.md](./VISION.md), "지금 뭐가 되는가"는 이 문서.
> 근거: `template/` 소스 대조(2026-07-07). 모든 항목은 실제 파일 경로를 인라인 참조한다.
> 예약 엔진 primitive 경계는 `template/packages/backend/convex/engine/README.md`를 기준으로 본다.

---

## 1. 개요 & 아키텍처

AI 점원이 가게 프런트를 지키는 예약 CS SaaS. 고객은 공개 웹에서 채팅으로 예약하고, 운영자는 관리자 앱에서 상태·에스컬레이션을 관리한다. 업종 커스터마이즈 레버는 `packages/backend/domain.config.ts` **하나**(스킬이 `domain-pack.json`에서 생성).

```text
apps/web           고객용 예약 웹 앱 (공개 페이지 + 챗 위젯 + /api/chat)
apps/app           운영자 관리자 앱 (locale 기반 대시보드·온보딩·설정·결제)
packages/backend   Convex 함수·도메인 설정·예약 엔진·에이전트 도구·인증·메일
packages/agents    예약 에이전트 런타임 (결정론 + OpenAI 하이브리드)
packages/email     예약/구독 이메일 템플릿
packages/ui        Tailwind v4 + shadcn 공용 UI
tooling            공유 TypeScript 설정
```

- 챗 진입점: `apps/web/src/app/api/chat/route.ts` (`POST` 턴 실행, `GET` 상태 조회). `runtime = "nodejs"`.
- 공개 상태 소스: `packages/backend/convex/chat.ts`의 `publicState` / `domainPublicConfig` 쿼리.
- 데이터 모델: `packages/backend/convex/schema.ts` — `resources`, `reservations`, `chatThreads`, `chatEvents` + Convex Auth 테이블.

---

## 2. 챗 예약 수명주기

**예약 상태 10종** (`schema.ts` `reservationStatus`): `draft · eligible · held · confirmed · rescheduled · waitlisted · cancelled · expired · denied · escalated`.

흐름 (결정론 엔진 `packages/agents/src/index.ts`, 실제 쓰기는 `packages/backend/convex/agentTools.ts` 뮤테이션):

1. **가용성 조회** — `searchAvailability` 쿼리. `firstSearchStart`(최소 now+30분)부터 **21일 지평**을 30분(또는 day) 스텝으로 스캔, `isSlotAllowed`(영업시간+블랙아웃)·`hasCollision` 통과 슬롯을 최대 `count`(기본 3)개 반환. `recordAvailability`가 스레드 상태를 `eligible`(슬롯 0개면 `waitlisted`)로 전이하고 `suggestedSlots` 저장.
2. **홀드** — `createHold`. duration 일치·`isSlotAllowed`·충돌 검사 후 `held` 예약 삽입, `reservationNumber` 발급, `holdExpiresAtMs` 설정, **영속 deadline에 `expireHold` 스케줄**.
3. **확정** — `confirmReservation`. `held`에서만 진행. 홀드 만료 시각이 지났으면 `expired`로 전이, 아니면 `confirmed` + 확정 메일 스케줄.
4. **변경** — `rescheduleReservation`. `confirmed`/`rescheduled`만 대상, 변경창 안이면 `reschedule_window_closed` 거부, 새 슬롯 검증 후 `rescheduled` + 메일.
5. **취소** — `cancelReservation`. `isInsideCancelWindow`면 `escalated`(운영자 확인), 아니면 `cancelled`. 두 경우 모두 메일.
6. **조회** — `lookupReservation`. 예약번호(또는 레거시 Convex id)로 조회하되 **thread 스코프** 검증.
7. **에스컬레이션** — 취소창 위반은 `escalated` 큐로. 운영자가 관리자 앱에서 해소(6번 참고).

**예약번호**: `PREFIX-YYMMDD-XXXXXX` (`PREFIX`는 `domainKey` 이니셜, 접미사 6자리 crypto 난수). 공개 표면엔 이 번호만 노출, 원 Convex id는 숨김.

**홀드 만료**: `expireHold` internalMutation이 남은 시간 재확인 후 `held`→`expired` 전이. 로컬 QA는 `JEOMWON_TEST_HOLD_MS`로 만료를 단축.

### 대기자 파일럿 (notify-only)

`features.waitlist`는 기본 `false`인 3번째 기능 토글이다. 꺼져 있으면 슬롯 0개 경로는 기존 문구와 상태 전이를 유지하고, 대기자 row·알림은 만들지 않는다.

켜져 있으면 결정론 엔진은 슬롯 0개일 때 `joinWaitlist`를 호출해 `reservations`에 `status: "waitlisted"` row를 실제 삽입하고 공개 예약번호를 발급한다. 대기 row는 `isActiveReservation`에서 비활성으로 취급되므로 실제 예약 충돌을 막지 않는다.

슬롯이 비는 지점은 `cancelReservation`·`expireReservation`·`rescheduleReservation` 3곳이며, 공통 훅 `engine/waitlist.ts` `onSlotFreed`가 처리한다. 동작은 notify-only: 첫 미알림 대기자 스레드에 `waitlist.slotOpened` 챗 이벤트를 넣고, 운영자 메일 `reservation.waitlist_opened`를 스케줄하며, 대기 row audit에 `waitlist.notified`를 남겨 중복 알림을 막는다. 자동 홀드·자동 승격·고객 이메일 수집은 없다.

---

## 3. 불변식 (Convex 뮤테이션이 강제)

`agentTools.ts` 뮤테이션 레벨에서 보장 — 런타임(mock/openai)과 무관하게 항상 적용:

- **충돌 없음** — `hasCollision`은 활성 예약(`confirmed`/`rescheduled`/미만료 `held`)과 시간 겹침 차단.
- **영업시간·블랙아웃** — `isSlotAllowed`. 위반 시 `slot_outside_business_hours`. 시간은 **store 타임존 캘린더 파트**로 평가(런타임 `getHours()` 아님, `calendarParts`).
- **duration 일치** — `endMs === serviceEndMs(...)` 아니면 `slot_duration_mismatch`.
- **홀드 만료** — 영속 `holdExpiresAtMs` + 스케줄러(재시도·QA가 같은 시계 공유).
- **취소창** — `isInsideCancelWindow`(정책 `cancelWindowHours`)로 취소=에스컬레이션 / 변경=거부 판정.
- **thread 스코프** — `resolveThreadReservation`이 `domainKey`+`threadId` 일치만 반환.
- **상태 전이** — 확정은 `held`만, 변경은 `confirmed`/`rescheduled`만.

---

## 4. 가드레일 & 공개/내부 분리

**가드레일 3종** — `runGuardrailChecks`(`packages/agents/src/index.ts`)에서 **결정론으로 선차단**. LLM 추론 전에 short-circuit 하므로 openai 런타임도 동일 보장(방어심층):

- **privacy** — `내부/시스템 프롬프트/system prompt/token/raw` 등 → `privacyRefusal`.
- **relevance** — 도메인 파생 관련어(서비스·리소스·copy에서 추출)에 안 걸리면 → `relevanceRefusal` + 배너.
- **confirmation** — `확인 없이/바로 확정/skip confirmation` 등 → `confirmationRequired`.

스레드별 `guardrailStatus`(`relevance`/`confirmation`/`privacy` = `clear`|`blocked`)를 `recordGuardrail`이 기록.

**공개/내부 분리** — `PublicContext`(`schema.ts` `publicContext`)만 고객 표면에. 내부 정보(`operatorMemo`·`privateDecision`·`riskSignals`·`costBasisCents`)는 `admin.ts` `toAdminReservation`의 `internalContext`에만 존재. QA 게이트 6이 공개 표면을 grep 해 이 마커·원 id 유출 0건을 강제.

---

## 5. 하이브리드 에이전트

런타임 선택: `AGENT_RUNTIME` env → `normalizeRuntimeMode`(`mock` 기본 | `openai`). `route.ts`가 매 턴 읽음.

- **mock (기본)** — 결정론 엔진. 기본값·QA 경로·폴백. 의도 분류 → 툴 호출을 규칙으로 구동.
- **openai** — OpenAI Agents SDK 실 추론(`runLlmTurn`). 툴 6종(`find_availability`·`hold_slot`·`confirm_reservation`·`cancel_reservation`·`reschedule_reservation`·`lookup_reservation`)을 `AgentToolbox`에 매핑해 LLM이 Convex 상태를 실제로 구동. 지시문은 슬롯 값(serviceKey/resourceKey/startMs/endMs)을 그대로 넘기고 내부정보 언급 금지를 명시.
- **폴백** — openai 런타임이 model/API 오류로 실패하면 `runDeterministicCore`로 **graceful fallback**(500 없음).
- **모델 override** — `OPENAI_AGENT_MODEL`(미설정 시 SDK 기본).
- 가드레일은 두 런타임 공통 결정론 선차단(4번 참고).

---

## 6. 운영자 관리자 (`apps/app`)

- **위젯 필드(데이터 경로만)** — `domain.config.ts` `adminWidget: "calendar" | "seatGrid"`. 값은 팩 계약·데이터 경로(config → `inject.mjs` 검증 → `admin.ts` `dashboardSnapshot`·`engine/lifecycle.ts` `publicDomainSnapshot`)로만 흐르고 **대시보드 렌더에는 미반영**이다. `_components/admin-dashboard.tsx`는 이 값을 읽지 않고 단일 고정 레이아웃을 렌더하며 `CalendarWidget`/`SeatGridWidget`이나 위젯 분기는 없다. locale의 `calendarTitle`/`seatGridTitle` 등(`apps/app/src/locales/*.ts`)도 미소비. 위젯 실구현은 UI 재설계와 함께 별도 결정(`apps/app/README.md` 참고).
- **대시보드 스냅샷** — `admin.ts` `dashboardSnapshot` 쿼리(인증 게이트). 리소스·예약(시간순)·에스컬레이션·최근 이벤트 80건 + 영업시간/정책.
- **에스컬레이션 해소** — `resolveEscalation` 뮤테이션. `approveCancel`(→`cancelled`) / `keepReservation`(→`confirmed`), 감사 이벤트·고객 메일 동반.
- **인증 게이트** — `ensureAdmin`이 `getAuthUserId` 없으면 `admin_auth_required`.

---

## 7. 라이프사이클 메일

- **토글** — `domain.config.ts` `features.email`. off면 스케줄·발송 모두 skip.
- **경로** — `scheduleReservationEmail`(`reservationEmailScheduler.ts`) → `sendReservationEmail` internalAction(`email/reservationActions.ts`).
- **capture vs sent** — `RESEND_API_KEY` 없거나 `JEOMWON_QA_RESET=1`이면 **capture**(발송 없이 `email.captured` 이벤트 기록 → QA 결정론 + 프로덕션 키 유지 안전), 아니면 Resend 발송 + `email.sent`.
- **종류 5** — `reservation.confirmed` / `rescheduled` / `cancelled` / `escalated` / `waitlist_opened`. 수신자는 `notificationEmail`.

---

## 8. 인증

`packages/backend/convex/auth.ts` — Convex Auth.

- **Google OAuth** — 항상 활성. `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`.
- **익명 dev 로그인** — `AUTH_DEV_ANONYMOUS=1`일 때만 등록. **dev 전용 가드**(프로덕션 배포엔 설정 금지, setup/문서가 강제).
- 고객 챗의 `thread_id`는 인증 아님 — 연속성 키일 뿐(`route.ts` 주석 + Session Rule 7).

---

## 9. 선택 결제 (Polar)

`packages/backend/convex/subscriptions.ts` — `features.polar` 토글. off면 전 표면이 빈 값/무시로 안전 degrade.

- **표면** — 상품 목록(`listAllProducts`), 체크아웃 링크(`generateCheckoutLink`), 고객 포털(`generateCustomerPortalUrl`), 구독 변경/취소(`changeCurrentSubscription`/`cancelCurrentSubscription`), 현재 구독 조회, 웹훅 라우트(`/polar/events`).
- **필수 env** — `POLAR_ORGANIZATION_TOKEN`, `POLAR_WEBHOOK_SECRET`. 누락 시 명시적 에러.
- 관리자 앱 UI: `settings/billing`, `_components/polar-checkout-link.tsx`.

---

## 10. 검증

**9게이트 QA** (`scripts/qa.ts`, `bun run qa` = `scripts/qa-local.ts` 오케스트레이터로 원커맨드):

| # | 이름 | 확인 |
|---|------|------|
| 1 | 해피 패스 | 가용성→홀드→확정, 공개 예약번호 형식 |
| 2 | cancelWindow 위반 | 취소창 안 취소 → `escalated` (실행시각상 불가능하면 **결정론 SKIP**) |
| 3 | 확인 없는 쓰기 차단 | confirmation 가드레일 `blocked`, 상태 불변 |
| 4 | 무관 의도 차단 | relevance `blocked` + 배너, 이후 정상 요청 복구 |
| 5 | 스키마 위반 422 | 잘못된 입력 → HTTP 422 `invalid_chat_request` |
| 6 | 내부 키 grep 0건 | 공개 표면에 내부 마커·원 예약 id 유출 0 |
| 7 | 홀드 만료 전이 | 홀드 → `expired` (`JEOMWON_TEST_HOLD_MS`) |
| 8 | 메일 capture 모드 | confirmed/cancelled/(escalated)/rescheduled `email.captured` |
| 9 | 대기자 접수·알림 | `features.waitlist=false`면 SKIP, on이면 포화→0슬롯→`waitlisted` row→슬롯 해제→`waitlist.slotOpened` + `reservation.waitlist_opened` |

QA는 business-hours-aware — cancel-window 오프셋을 엔진 순수 헬퍼(`nextAllowedSlotStart`/`insideCancelFeasible`)로 실제 열린 슬롯에 앵커, 불가능한 실행시각엔 게이트 2·8을 결정론 SKIP.

**오프라인 verify 게이트** (`skill/scripts/verify.mjs`, `skill/REFERENCE.md`): offline install → typecheck → lint → build, `JEOMWON_QA_BASE_URL` 지정 시 QA까지. 프로바이더 시크릿을 절대 fetch 안 함.

---

## 11. 커스터마이즈 매트릭스

`domain-pack.json` → `inject.mjs` → `domain.config.ts` + 리소스 seed. 스키마 상세는 [skill/REFERENCE.md](./skill/REFERENCE.md).

- **리소스 4종** — `person` / `seat` / `room` / `unit`.
- **슬롯 3종** — `minutes:30` / `hour` / `day`(day는 체크인/체크아웃 시각·라벨 필요).
- **위젯 필드 2종** — `calendar` / `seatGrid` (팩·데이터 경로만, 대시보드 렌더 미반영 — 6절 참고).
- **정책** — `cancelWindowHours` · `holdMinutes` · `confirmationRequired`(항상 `true`).
- **기능 토글** — `features.email` · `features.polar` · `features.waitlist`.
- **대기자 매트릭스** — `waitlist=false`: gate 9 SKIP, 슬롯 0개 기존 경로 유지. `waitlist=true`: gate 9 PASS 대상, notify-only 접수·알림 활성.
- **copy** — 인사·거절·확정·취소·홀드만료·정책요약 등 고객 노출 한국어 문구 일체.
- **영업시간·블랙아웃** — 요일별 open/close 또는 closed, 블랙아웃 구간.

---

## 알려진 한계 (VISION 2.3 참고)

- 전문 기능(보증금·노쇼·멤버십·다지점 등)을 위한 일반 registry 경로는 아직 없다. 후속 코드 확장은 `skill/REFERENCE.md`의 Code Extension Contract를 따라 불변식 상속, 기능 소유 모듈, 명명된 훅, off-default `extension.config.ts`, SKIP-aware QA 게이트로 진행한다.
- M1 대기자 파일럿은 현재 참조 패턴이다. 정식 plugin framework나 범용 생성기는 확장 패턴이 3개 이상 반복 검증된 뒤로 유보한다.
