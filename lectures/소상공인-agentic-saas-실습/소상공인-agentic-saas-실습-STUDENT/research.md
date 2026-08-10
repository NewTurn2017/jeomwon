# 소상공인을 위한 Agentic SaaS 구축 1시간 실습 리서치

조사 기준일: 2026-08-08
깊이: deep
범위: Jeomwon 현재 소스, 공식 제품 문서, 학습과학 연구

## TL;DR

Jeomwon은 자연어로 임의 애플리케이션을 작성하는 시스템이 아니다. 준비된
템플릿을 복사하고, 닫힌 도메인 설정을 주입하고, 오프라인 검증을 수행한다.
생성된 런타임은 두 Next.js 프로젝트와 별도 Convex 배포로 구성된다. Convex는
reactive query와 transactional mutation 같은 실행 기반을 제공하고, 중복 예약,
홀드, 취소 제한, 권한 같은 규칙은 Jeomwon mutation 코드가 구현한다.

수업의 정확한 약속은 **“60분 안에 오프라인 검증된 예약 SaaS 코드베이스를
생성한다”**이다. setup, authenticated live QA, Vercel, Polar sandbox는 검증되지
않은 후속 checkpoint다. Polar 연결은 현재 Jeomwon 계정 플랜 구독이며 예약금이나
건별 결제와 연결되지 않는다.

교육 흐름은 완성 예시 → 판단 근거 → 일부 비운 과제 → 빈 화면 재현 → 다른 업종
적용 → 48–72시간 후 재현으로 구성한다. `한 자리, 두 손님` slot passport는
S1·S4·S10·S15에서만 점차 사라지는 scaffold로 사용한다.

## A1. 생성기와 생성된 애플리케이션

### 관찰

- `scaffold.mjs`는 비어 있는 target에 `template/`을 복사하고 package scope와
  이름 토큰만 바꾼다. [R1]
- `inject.mjs`는 닫힌 domain-pack schema를 검증하고
  `packages/backend/domain.config.ts`와 선택형 email sample만 쓴다. Seed는
  template-owned 상태를 유지한다. [R2]
- `bootstrap.mjs`는 scaffold → inject → verify만 실행한다. verify child에서
  `JEOMWON_QA_BASE_URL`을 제거하므로 setup과 live QA가 자동으로 실행되지 않는다.
  [R3][R4]
- 현재 chat route는 `apps/app`에 있다. `FEATURES.md`와 일부 `VISION.md` 설명은
  이전 구조를 반영하므로 현재 source와 app README가 우선한다. [R5]

### 확정 주장

- **C1:** Jeomwon 생성 계약은 template copy → strict configuration injection →
  offline verification이다. 임의 vertical 코드를 자연어로 생성하지 않는다.
- 수동 확장은 생성 이후 named hook과 `extension.config.ts`를 사용하는 별도
  코드 작업이다.
- Bootstrap PASS는 배포·인증·live QA 성공이 아니다.

### 슬라이드 적용

- S5/S9에서 자연어가 코드 전체로 변하는 애니메이션을 금지한다.
- Seed는 변경되지 않는 template asset으로 표시한다.
- Setup·live QA·manual extension은 bootstrap box 바깥에 둔다.

## A2. Next.js, Convex, Vercel 배포 경계

### 관찰

- `apps/web`은 public domain values와 login link를 제공하는 prerenderable
  marketing surface다. Convex/auth/chat runtime은 없다. [R6]
- `apps/app`은 authenticated customer/admin UI와 Node.js `/api/chat` route를
  포함한다. [R7]
- `apps/app/vercel.json`은 Convex deploy와 app build를 조정한다. Convex는
  Vercel 내부 데이터베이스가 아니라 별도 deployment URL과 functions를 가진다.
  [R8][R9]
- Vercel monorepo는 deployable directory별 project를 사용한다. web과 app은
  독립 root, env, URL, rollout을 가진다. [R10]

### 확정 주장

- **C2:** 두 Next.js deployable과 하나의 별도 Convex backend가 있다.
- Vercel web, Vercel app, Convex는 독립 실패가 가능한 비원자적 배포 단위다.
- 실제 dashboard root, env scope, domain, deploy key는 git 밖의 operator state다.

### 슬라이드 적용

- S5/S6은 web Vercel, app Vercel, external Convex를 별도 상자로 그린다.
- S13은 production claim이 아니라 operator verification checklist다.
- `apps/web`을 static export라고 단정하지 않는다.

## A3. Convex DB와 예약 불변식

### 관찰

- Convex query는 read-only server function이고 subscribed result는 의존 데이터가
  바뀌면 갱신된다. Mutation의 read/write는 하나의 transaction으로 commit된다.
  [R11][R12]
- Scheduled mutation은 durable/exactly-once지만 정확한 wall-clock 시각을
  약속하지 않는다. Scheduled action은 다른 execution guarantee를 가진다. [R13]
- Jeomwon hold creation은 auth, identity, timezone/end, business hours, blackout,
  overlap, state writes, audit/chat, expiry scheduling을 mutation 내부에서 처리한다.
  [R14]
- Capacity를 막는 상태는 held, confirmed, rescheduled, escalated다. 유효한 held
  취소는 즉시 cancelled로 바뀌고 자리를 해제한다. Confirmed/rescheduled의
  cancel-window 내부 취소만 escalated가 되어 자리를 계속 막는다. [R14]

### 확정 주장

- **C3:** Convex는 reactive/transaction primitives를 제공하고, Jeomwon mutation
  코드가 booking policy를 소유한다.
- “Convex가 예약 규칙을 알아서 중복 예약을 막는다”는 표현은 틀리다.
- Lock API가 아니라 같은 guarded mutation의 collision read와 transaction
  semantics가 동시 요청을 직렬화한다.

### 슬라이드 적용

- S7: table → subscribed query → UI result.
- S8: one mutation transaction과 상태 전이. Scheduler에는 “durable, not punctual.”
- `held` cancel과 `confirmed/rescheduled` inside-window escalation을 구분한다.

## A4. 네 업종과 라이브 데모 안전성

| 순위 | 업종 | capability | 안전한 라이브 경로 | 현재 한계 |
|---:|---|---|---|---|
| 1 | 헤어살롱 | `person × minutes:30 × calendar` | haircut, 디자이너 1명 | color 90분·디자이너 자격은 표준 QA 범위 밖 |
| 2 | 풋살장 | `unit × hour × calendar` | 실내 A, 1시간 | 날씨 상태·예약금 없음 |
| 3 | PC방 | `seat × hour × seatGrid` | 좌석 1개, 22시 이전 | 그룹/인접 좌석 원자 예약·자정 횡단 없음 |
| 4 | 펜션 | `room × day × calendar` | fresh pack, 1실 1박, 21일 이내 | guest count·다박·부가서비스 없음 |

근거: current examples, domain schema, availability engine, admin widget branch. [R15]

### 확정 주장

- **C4:** 네 후보는 현재 resource×slot×widget matrix 안에 있지만 각각 한계를
  가진다.
- Default deterministic parser는 `N시간 뒤`, `N일 뒤`, `내일`, `모레`만 처리한다.
  `15:00`과 `다음 주 토요일`을 deterministic demo 입력으로 사용하지 않는다. [R16]
- Committed pension sample은 stale artifact이므로 current generator input으로 쓰지
  않는다.

### 슬라이드 적용

- S3에서 matrix와 capability limit을 함께 보여준다.
- S11은 salon haircut happy path만 실행한다.
- S12는 offline VERIFY와 authenticated live QA 증거를 분리한다.

## A5. Polar 구독과 예약 결제

### 관찰

- Polar는 recurring subscription뿐 아니라 one-time product/order도 지원한다.
  [R17][R18]
- Jeomwon은 `features.polar`가 켜진 경우 account plan product, CheckoutLink,
  subscription change/cancel, Customer Portal, webhook을 제공한다. [R19]
- Reservation schema와 customer mutation args에는 payment, order, amount,
  currency, deposit, refund 연결이 없다. [R20]
- Reservation `hold`는 결제 승인 hold가 아니라 slot capacity의 임시 점유다.

### 확정 주장

- **C5 (high risk):** 현재 Jeomwon Polar 연결은 기본 OFF인 계정 플랜 구독
  결제이며, 예약 lifecycle에는 건별 checkout/payment state가 없다.
- 부재는 Polar provider 한계가 아니라 Jeomwon 제품 구현 범위다.
- Live Polar sandbox checkout→webhook→portal은 이번 조사에서 실행 검증하지
  않았다.

### 슬라이드 적용

- S14 제목: **결제 옵션 ≠ 예약 결제**.
- Account plan subscription과 booking lifecycle 사이에 `현재 연결 없음` 물리적
  간격을 둔다.
- 미래 통합 arrow와 production-ready 표현을 금지한다.

## A6. 60분 교육과 수업 후 재현

### 관찰

- Novice는 problem-first보다 worked example 또는 example→problem에서 더 낮은
  mental effort와 높은 transfer를 보였다. [R21]
- Complete example에서 점차 단계를 비우는 fading은 near transfer를 도왔다.
  Far transfer는 덜 확실하다. [R22]
- 짧은 video segment는 engagement에 유리하지만, 과도한 segmentation과 prompt는
  cognitive load를 높일 수 있다. [R23][R24]
- Retrieval practice는 즉시 자신감보다 2일·1주 후 retention을 더 잘 예측한다.
  [R25]

### 확정 주장

- **C6:** 60분은 efficacy가 검증된 최적 시간이 아니라 delivery container다.
- **C7:** 강의는 worked example → focused explanation → faded completion →
  blank reconstruction → changed-domain adaptation → delayed reproduction으로
  설계한다.
- 이 exact ladder와 nondeveloper small-business audience를 직접 검증한 randomized
  trial은 찾지 못했다.

### 슬라이드 적용

- S1: 완성 slot passport.
- S4: collision owner 한 칸 비우기.
- S10: 다른 업종 sheet를 대부분 비우고 prompt는 하나만 사용.
- S15: passport 없이 새 업종을 처음부터 재구성.
- 48–72시간 후 다른 업종으로 delayed reproduction.

## Ultradebate 결론

승인된 15장 순서와 시간은 유지한다. `한 자리, 두 손님, 네 경계`는 recurring
story가 아니라 네 번만 나타나는 completion scaffold다.

1. S1: 완성 예시
2. S4: 판단 한 칸 비우기
3. S10: 대부분 비운 changed case
4. S15: passport 제거 후 blank reproduction

Critical misconception은 aggregate 평균이 아니라 각 항목 zero-regression으로
평가한다.

- offline verified ≠ operational/deployed
- Convex primitive ≠ booking policy
- Convex ≠ Vercel 내부
- 세 deployment ≠ atomic rollout
- mock runtime ≠ LLM 사용 증거
- Polar subscription ≠ reservation payment

Passport는 topology, state machine, UI evidence, payment visual에 재사용하지 않는다.

## Gate 2 고위험 주장 검증

### C5: Jeomwon account subscription과 reservation payment 부재

- **지원 그룹 1 — 제품 소스:** subscription API/UI는 account product와 portal을
  사용하고 reservation schema에는 money/order linkage가 없다. [R19][R20]
- **지원 그룹 2 — provider 공식 문서:** Polar는 subscription과 one-time order를
  모두 지원한다. 따라서 현재 부재는 provider 제약이 아니라 Jeomwon wiring
  경계다. [R17][R18]
- **반대 검색:** backend/app/agents source에서 payment, checkout, order, amount,
  currency, refund, deposit 연결을 검색했다. 실질 checkout hit는 account
  subscription 경로뿐이며 reservation 연결은 없었다.
- **검증 결과:** source-state claim confirmed. Live sandbox runtime evidence는
  pending이며 슬라이드 각주로 공개한다.

## 미해결·수용 한계

1. 실제 Vercel dashboard roots/env scopes/domains는 git 밖 operator state다.
2. Polar sandbox checkout→webhook→portal은 실행하지 않았다.
3. 네 vertical 모두의 fresh authenticated live QA를 실행하지 않았다.
4. 이 exact completion ladder를 소상공인 비개발자에게 적용한 RCT는 없다.
5. 48–72시간 delayed reproduction 데이터는 강의 후 수집 대상이다.

이 한계들은 강의의 source-state 설명과 offline bootstrap 시연을 막지 않는다.
각각 production, payment, live QA, efficacy claim의 범위를 낮추는 근거로 사용한다.

## 슬라이드별 연구 변경 요약

| 슬라이드 | 변경 |
|---|---|
| S1 | “60분 안에 오프라인 검증된 예약 SaaS 코드베이스”로 약속 축소 |
| S4 | slot passport의 collision-owner blank |
| S5 | template copy → strict injection → offline verify |
| S6 | web Vercel / app Vercel / external Convex |
| S7 | reactive data + transaction primitive |
| S8 | Jeomwon rule, actual collision, cancel nuance, durable-not-punctual |
| S10 | mostly blank changed-case sheet + one prompt |
| S11 | salon haircut, supported relative time/direct slot selection |
| S12 | pre-provisioned reference app label 또는 fingerprint |
| S13 | OFFLINE VERIFIED hard stop + unchecked next-stage checklist |
| S14 | account subscription / booking money disconnected |
| S15 | blank reconstruction + delayed changed-domain task |

## Sources

- **R1** Jeomwon scaffold script — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/skill/scripts/scaffold.mjs
- **R2** Jeomwon inject script — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/skill/scripts/inject.mjs
- **R3** Jeomwon bootstrap script — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/skill/scripts/bootstrap.mjs
- **R4** Jeomwon verify script — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/skill/scripts/verify.mjs
- **R5** Authenticated chat route — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/template/apps/app/src/app/api/chat/route.ts
- **R6** Public web contract — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/template/apps/web/README.md
- **R7** Authenticated app contract — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/template/apps/app/README.md
- **R8** App Vercel config — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/template/apps/app/vercel.json
- **R9** Convex Vercel hosting — https://docs.convex.dev/production/hosting/vercel
- **R10** Vercel monorepos — https://vercel.com/docs/monorepos
- **R11** Convex query functions — https://docs.convex.dev/functions/query-functions
- **R12** Convex mutation functions — https://docs.convex.dev/functions/mutation-functions
- **R13** Convex scheduled functions — https://docs.convex.dev/scheduling/scheduled-functions
- **R14** Jeomwon customer lifecycle — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/template/packages/backend/convex/engine/customerReservationLifecycle.ts
- **R15** Jeomwon examples — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/skill/EXAMPLES.md
- **R16** Jeomwon agent parser/runtime — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/template/packages/agents/src/index.ts
- **R17** Polar subscriptions — https://polar.sh/docs/features/subscriptions/introduction
- **R18** Polar products — https://polar.sh/docs/features/products
- **R19** Jeomwon subscriptions — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/template/packages/backend/convex/subscriptions.ts
- **R20** Jeomwon schema — https://github.com/NewTurn2017/jeomwon/blob/cd8d222/template/packages/backend/convex/schema.ts
- **R21** Van Gog et al. worked examples — https://doi.org/10.1016/j.cedpsych.2010.10.004
- **R22** Renkl et al. fading — https://eric.ed.gov/?id=EJ658398
- **R23** Guo et al. video engagement — https://up.csail.mit.edu/other-pubs/las2014-pguo-engagement.pdf
- **R24** Yoon et al. segmentation counterevidence — https://eric.ed.gov/?id=EJ1341335
- **R25** Roediger & Karpicke retrieval — https://pubmed.ncbi.nlm.nih.gov/16507066/
