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

**예약 상태 11종** (`schema.ts` `reservationStatus`): `draft · eligible · held · confirmed · rescheduled · no_show · waitlisted · cancelled · expired · denied · escalated`.

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
- **상태 전이** — 확정은 `held`만, 변경은 `confirmed`/`rescheduled`만. 노쇼는 기능이 켜진 경우 서버 시각상 시작이 지난 `confirmed`/`rescheduled`만 운영자 인증 mutation이 `no_show`로 전이한다.

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

- **위젯 렌더 분기** — `domain.config.ts` `adminWidget: "calendar" | "seatGrid"`. 값은 팩 계약·데이터 경로(config → `inject.mjs` 검증 → `admin.ts` `dashboardSnapshot`·`engine/lifecycle.ts` `publicDomainSnapshot`)로 흐르고, `_components/admin-widget-board.tsx`의 `AdminWidgetBoard`가 스냅샷 값으로 분기 렌더한다 — `calendar`는 7일 요일별 예약 목록, `seatGrid`는 리소스별 현재 상태(이용 중/다음 예약/이용 가능) 그리드. 슬롯 점유 상태(held/confirmed/rescheduled/escalated)만 표시하고 시각 기준은 스냅샷 `generatedAtMs`(로컬 시계 미사용). locale `calendarTitle`/`seatGridTitle` 등(`apps/app/src/locales/*.ts`) 소비(`apps/app/README.md` 참고).
- **대시보드 스냅샷** — `admin.ts` `dashboardSnapshot` 쿼리(인증 게이트). 리소스·예약(시간순)·에스컬레이션·최근 이벤트 80건 + 영업시간/정책.
- **에스컬레이션 해소** — `resolveEscalation` 뮤테이션. `approveCancel`(→`cancelled`) / `keepReservation`(→`confirmed`), 감사 이벤트·고객 메일 동반.
- **인증 게이트** — `ensureAdmin`은 로그인뿐 아니라 서버의 `JEOMWON_ADMIN_EMAILS` allowlist를 강제한다. 캘린더 CRUD의 생성·수정·취소 권한과 `origin: "operator"` 소유 표시는 서버가 결정하며, 브라우저가 운영자 신원·시각·종료 시각·예약번호를 결정하지 않는다.
- **증거 한계** — manifest의 운영자 CRUD maturity는 `implemented`다. QA gate 10은 미인증·비운영자 차단만 증명하며, 실제 Google 운영자 로그인과 성공 CRUD는 별도 승인 소유 smoke 전까지 `BLOCKED`다.

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
- **익명 로컬 로그인** — `AUTH_ANONYMOUS_LOGIN=1`일 때만 등록. setup은 local first-success에서 app과 Convex에 같은 값을 쓰며 production origin에서는 명시적 opt-in과 비어 있지 않은 운영자 allowlist 없이는 거부한다.
- 고객 챗의 `thread_id`는 인증 아님 — 연속성 키일 뿐(`route.ts` 주석 + Session Rule 7).

---

## 9. 선택적 계정 구독 (Polar)

`packages/backend/convex/subscriptions.ts` — `features.polar` 토글. off면 전 표면이 빈 값/무시로 안전 degrade.

- **범위** — Polar는 로그인 계정의 SaaS 구독만 처리한다. 상품 목록(`listAllProducts`), 계정 구독 체크아웃 링크(`generateCheckoutLink`), 고객 포털(`generateCustomerPortalUrl`), 구독 변경/취소, 현재 구독 조회, 웹훅 라우트(`/polar/events`)가 표면이다.
- **필수 env** — `POLAR_ORGANIZATION_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_IDS`. 누락 시 명시적 에러.
- **예약 보증금 (별도 capability)** — `packages/backend/convex/deposits.ts`. 계정 구독과 분리된 일회성 Polar 상품이며 `features.polar`와 `POLAR_DEPOSIT_PRODUCT_ID`가 모두 있어야 켜진다. 표면은 체크아웃 액션(`startDepositCheckout`), 소유권 확인(`claimDepositCheckout`), 주문 웹훅 반영(`recordDepositOrder`), 고객 조회(`depositSnapshot`)이다. 예약 문서 id는 서버가 checkout metadata에 넣고, `order.created`/`order.refunded`가 같은 `/polar/events` 라우트로 돌아와 예약의 `deposit` 필드와 audit 항목을 갱신한다.
- **예약 커머스 범위** — 보증금 외의 예약 대금 청구·부분 환불 UI·예약별 결제 ledger는 구현되지 않았다. 서비스 `price`는 표시 문자열이며 Polar 상품과 연결되지 않는다. 보증금 표면에도 고객·운영자 UI는 없다.
- 관리자 앱 UI: `settings/billing`, `_components/polar-checkout-link.tsx`. 두 Polar capability 모두 manifest maturity는 positive provider 왕복 없이 `implemented`이며 operational proof를 주장하지 않는다.

---

## 10. 검증

**12게이트 QA** (`scripts/qa.ts`, `bun run qa` = `scripts/qa-local.ts` 오케스트레이터로 원커맨드, evidence contract v2; v1 artifact bundles remain validator-compatible):

<!-- doc-contract:qa:start -->
| ID | Gate name | Artifact | SKIP contract |
|---:|---|---|---|
| 1 | 해피 패스 | `01-happy-path.json` | none |
| 2 | cancelWindow 위반 | `02-cancel-window.json` | physical-impossibility-only |
| 3 | 확인 없는 쓰기 차단 | `03-confirmation-guardrail.json` | none |
| 4 | 무관 의도 차단 | `04-relevance-guardrail.json` | none |
| 5 | 스키마 위반 422 | `05-malformed-input.json` | none |
| 6 | 내부 키 grep 0건 | `06-privacy-grep.json` | none |
| 7 | 홀드 만료 전이 | `07-hold-expiry.json` | none |
| 8 | 메일 capture 모드 | `08-email-capture.json` | escalation subcase: physical-impossibility-only |
| 9 | 대기자 접수·알림 | `09-waitlist.json` | `features.waitlist=false` |
| 10 | 운영자 캘린더 CRUD | `10-operator-calendar-crud.json` | features.operatorCalendarCrud=false (CRUD subcase only) |
| 11 | 고객 계정 경계 | `11-customer-accounts.json` | none (accounts are core) |
| 12 | 노쇼 전이 경계 | `12-no-show.json` | `features.noShow=false` |
<!-- doc-contract:qa:end -->

SKIP은 성공 증거가 아니다. 토글이 켜진 gate 9·10·12에서 env 누락이나 설정 실패는 FAIL이며, gate 2·8만 실제 열린 슬롯이 물리적으로 없는 경우 구체적 이유와 함께 결정론적으로 SKIP할 수 있다. Gate 10은 Google 운영자 성공 CRUD를 증명하지 않는다.

QA는 business-hours-aware — cancel-window 오프셋을 엔진 순수 헬퍼(`nextAllowedSlotStart`/`insideCancelFeasible`)로 실제 열린 슬롯에 앵커, 불가능한 실행시각엔 게이트 2·8을 결정론 SKIP.

**오프라인 verify 게이트** (`skill/scripts/verify.mjs`, `skill/REFERENCE.md`): `bun install --frozen-lockfile --offline` → typecheck → lint → tests → email/app/web builds. bootstrap은 ambient `JEOMWON_QA_BASE_URL`을 제거하므로 `VERIFY PASS`는 live QA·setup·배포·provider 성공 증거가 아니다. QA는 명시적 실행에서만 선택되며 프로바이더 시크릿을 fetch하지 않는다.

---

## 11. 커스터마이즈 매트릭스

`domain-pack.json` → `inject.mjs` → `domain.config.ts` + 리소스 seed. 스키마 상세는 [skill/REFERENCE.md](./skill/REFERENCE.md).

- **리소스 4종** — `person` / `seat` / `room` / `unit`.
- **슬롯 3종** — `minutes:30` / `hour` / `day`(day는 체크인/체크아웃 시각·라벨 필요).
- **위젯 필드 2종** — `calendar` / `seatGrid` (`AdminWidgetBoard`가 대시보드에서 분기 렌더 — 6절 참고).
- **정책** — `cancelWindowHours` · `holdMinutes` · `confirmationRequired`(항상 `true`).
- **기능 토글** — `features.email` · `features.polar` · `features.waitlist` · `features.operatorCalendarCrud` · `features.noShow` (`noShow`는 off-default이며 전용 QA gate 12 소유). 고객 계정은 호환성 필드 `customerAccounts: true`인 core이며 끌 수 없다.
- **대기자 매트릭스** — `waitlist=false`: gate 9 SKIP, 슬롯 0개 기존 경로 유지. `waitlist=true`: gate 9 PASS 대상, notify-only 접수·알림 활성.
- **copy** — 인사·거절·확정·취소·홀드만료·정책요약 등 고객 노출 한국어 문구 일체.
- **영업시간·블랙아웃** — 요일별 open/close 또는 closed, 블랙아웃 구간.

---

## 12. 릴리스 capability 계약

아래 구조화 행은 `template/jeomwon-capabilities.json`에서 검증된다. `qa-proven`은 선언된 deterministic QA gate의 범위만 뜻하며 provider/operator operational 성공으로 확대 해석하지 않는다.

<!-- doc-contract:capabilities:start -->
| Capability ID | Ownership | Enablement | Default | Maturity | Evidence | QA gate |
|---|---|---|---:|---|---|---:|
| reservation.customerLifecycle | core | always | true | qa-proven | qa | 1 |
| accounts.customer | core | always | true | qa-proven | qa | 11 |
| accounts.deletion | core | always | true | implemented | test | - |
| delivery.reservationEmail.capture | core | feature | true | qa-proven | qa | 8 |
| delivery.reservationEmail.resend | integration | feature | false | implemented | test | - |
| waitlist.notifyOnly | kit-core | feature | false | qa-proven | qa | 9 |
| operator.calendarCrud | kit-core | feature | false | implemented | test | - |
| billing.accountSubscription.polar | integration | feature | false | implemented | test | - |
| attendance.noShow | kit-core | feature | false | qa-proven | qa | 12 |
| payment.reservationDeposit | integration | feature | false | implemented | test | - |
<!-- doc-contract:capabilities:end -->

현재 manifest는 10개 구현/QA-proven capability를 선언하고 planned capability는 없다. `payment.reservationDeposit`은 계정 구독과 분리된 일회성 Polar 주문이며, `features.polar`와 `POLAR_DEPOSIT_PRODUCT_ID`가 모두 있어야 켜진다. 예제 coverage는 capability 개수가 아니라 `resourceKind × slotUnit × adminWidget` 24칸 중 9칸이며 [EXAMPLES.md](./skill/EXAMPLES.md)의 팩과 matrix에서 유도한다.

<!-- doc-contract:identities:start -->
| Contract ID | Value |
|---|---:|
| template.schema | 1 |
| template.api | 1 |
| domain-pack.writer | 0 |
| domain-pack.schema | 1 |
| capability.schema | 1 |
| setup.schema | 2 |
| qa.contract | 2 |
| qa.gates | 12 |
| receipt.schema | 3 |
| bun.version | 1.3.14 |
<!-- doc-contract:identities:end -->

Domain pack v1이 canonical 형식이다. `schemaVersion`이 없는 정확한 legacy v0 shape만 순수하게 v1을 붙여 migrate하며, 명시된 미래/미지원 버전은 fail-closed한다. 생성 receipt v3는 프로젝트·template source·contract hash·canonical pack·managed output hash를 묶는 로컬 일관성 계약이지 hostile coordinated rewrite에 대한 서명은 아니다.

## 알려진 한계 (VISION 2.3 참고)

- 보증금·멤버십·다지점 등을 위한 일반 registry 경로는 없다. 노쇼는 예외적인 registry가 아니라 직접 명명된 kit-core command와 off-default flag, 전용 gate 12로 제공된다. 후속 generated-app 확장은 `skill/REFERENCE.md`의 Code Extension Contract를 따른다.
- M1 대기자 파일럿은 현재 참조 패턴이다. 정식 plugin framework나 범용 생성기는 확장 패턴이 3개 이상 반복 검증된 뒤로 유보한다.
