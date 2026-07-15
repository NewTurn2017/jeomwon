# jeomwon — CS AI SaaS 에이전트 킷 계획서

> "AI 점원이 가게 프런트를 지킨다 — 도메인 인터뷰 한 번으로 인증 고객 앱의 CS AI 챗·자기 예약 관리, 내부 운영자 `/admin`, 예약 메일이 붙은 Convex SaaS를 뽑아주는 소상공인용 agentic CS SaaS 킷"

작성일: 2026-07-02 · 상태: **로드맵 Phase 0~7 전체 완료** (2026-07-02, 펜션 도메인 셀프 증명까지) · 구현 방식: `/senior-mode` (Codex 위임 + 오케스트레이터 게이트 검증)

> 잔여 폴리시 백로그: 킷 배포 채널(make-public/skill-installer). B1 완료: 표시용 예약 번호, reschedule 호출 연결, 로그인 후 URL replace, 목 파서 "N번째" 선택. B2 완료: Polar 선택 모듈화의 env optional 경계.

## 0. 확정된 결정 (ADR 요약)

| 결정 | 선택 | 이유 |
| --- | --- | --- |
| 킷 이름 | `jeomwon` (점원, 표시명 Jeomwon) | AI 점원이 가게 프런트를 지킨다. 폴더 `~/dev/side/jeomwon`, 패키지·스킬 이름 공용 |
| 형태 | 하이브리드 | Claude Code 스킬이 인터뷰·도메인 생성·코드 주입 담당. 생성된 프로젝트에는 `bun setup` 대화형 위저드 내장 — 스킬 없는 사용자도 셋업 재실행 가능 |
| 템플릿 | 핀 고정 패치 템플릿 | get-convex/v1 특정 커밋을 벤더링해 Sentry·OpenPanel 제거 + CS AI 슬롯을 미리 반영한 자체 템플릿 유지. 재현성 보장 |
| Polar 결제 | 선택 모듈 | 인터뷰에서 켜고 끔. 예약금·구독 없는 도메인은 깔끔하게 제외 |
| 플로우 순서 | 도메인 인터뷰 → 스캐폴드 생성 → 셋업 위저드 | 프로젝트 이름·구조가 도메인에 의존. env 키는 도메인과 무관하므로 뒤에 두고 언제든 재실행 가능하게 |

## 0.1 Phase 0 조사 후 보정 (2026-07-02, docs/upstream-report.md 근거)

- **패키지 매니저는 bun** (upstream이 `bun@1.1.26` 고정, pnpm 워크스페이스 없음). 이 문서의 모든 명령은 bun 기준으로 정정됨. 위저드는 `bun setup`.
- **Next는 14.2.7로 벤더링되지만, 사용자 결정(2026-07-02)으로 Phase 1.5에서 전면 최신화한다**: Next 16 + React 19 + Convex/Convex Auth 최신 + 전체 의존성 최신, 런타임·패키지 매니저는 bun 유지. Tailwind 4 + shadcn 최신화는 리스크가 커서 같은 Phase의 2단계로 분리 — 실패 시 Tailwind 3 유지로 폴백하고 보고.
- **i18n 실상**: `next-international`, `en/fr/es`, 기본 `en`, **app 전용**(web은 i18n 없음). → Phase 3에서 ko locale 추가 + 기본 ko 전환. web 카피는 도메인 config가 주도.
- **upstream 자체 결함 4건 → Phase 1 게이트에 포함해 수선**: ① web이 `@v1/backend`를 import하면서 의존 미선언 ② app `.env.example`에 `NEXT_PUBLIC_CONVEX_URL` 누락 ③ backend env가 `SITE_URL`을 required로 검증하나 어디에도 미문서화 ④ backend가 `zod`/`@t3-oss/env-core`를 직접 의존 선언 안 함.
- **upstream에 `setup-config.json` 기반 셋업 개념이 이미 존재** → Phase 5 위저드는 이 포맷을 계승·확장 (Google OAuth·Convex·Resend 항목 구조 재사용, Sentry/OpenPanel 항목 제거).
- **Polar는 현재 required env** (`packages/backend/convex/env.ts`) — "선택 모듈"화에는 env optional 경계 + 대시보드 billing UI·webhook·Convex component 토글 작업 필요. Phase 2~3에서 경계 설계.
- **Resend/React Email**: backend에 발송 유틸·템플릿이 있으나 호출자 없음 — Phase 4의 깨끗한 삽입 지점.
- **@openai/agents**: upstream에 route handler 없음, edge 강제 없음 → 챗 API는 route handler + `export const runtime = "nodejs"` 명시. 대안 경로로 Convex `"use node"` action 확보.

## 1. 제품 정의

**사용자**: SaaS를 빠르게 세우고 싶은 개발자/창업자. Claude Code 사용자면 스킬로, 아니면 생성된 레포의 위저드로.

**생성물(엔드 유저 제품)의 구성**:
- `apps/web` — **정적 마케팅 안내 + 인증 앱 CTA**. 공개 서비스·영업·정책 정보만 렌더하며 인증·Convex·챗 런타임은 두지 않음
- `apps/app` — **인증 고객 앱**(Google 로그인, 선택적 product anonymous): 루트에서 CS AI 챗과 자기 예약 조회·생성·변경·취소. 내부 운영자는 별도 `/admin`에서 예약 캘린더/좌석 그리드, 에스컬레이션 큐, 에이전트 활동 타임라인 사용
- `packages/backend` — Convex: 도메인 스키마, 불변식 mutation, 스케줄러, 이벤트
- 메일 — React Email + Resend: 예약 확정/변경/취소/에스컬레이션 알림
- 선택 — Polar 결제(예약금/구독)

**지원 도메인**: 예약형 서비스 전반 — 미용실, PC방, 도서관/독서실/공부방, 펜션, 진료, generic. 도메인은 코드 재작성이 아니라 **도메인 팩(config+시드) 주입**으로 갈아끼움.

## 2. 아키텍처 — 4개 계층

### 2.1 템플릿 계층 (`template/`)
- get-convex/v1 핀 커밋 벤더링. 스택: Convex, Next.js, Turborepo, Biome, Tailwind, shadcn, TypeScript, React Email, Resend, i18n(ko 기본 + en), Polar, next-themes, nuqs. **Sentry·OpenPanel 제거.**
- `UPSTREAM.md`에 핀 커밋 해시·제거/추가 내역 기록. upstream 갱신은 의식적 리베이스로만.
- CS AI 슬롯(에이전트 런타임, 챗 위젯, 대시보드 셸, 도메인 팩 주입 지점)이 미리 포함된 상태로 유지.

### 2.2 도메인 생성 계층 (스킬 `skill/`)
- agentic-system-builder의 인터뷰 방법론 확장: Actor/Resource/Reservation/Availability/Policy/Tool/Agent/Handoff/Guardrail/PublicContext/Widget/Event.
- **핵심 설계: generic reservation core + 도메인 config.** Convex 스키마는 범용 코어(resources, reservations, threads, events, policies)로 고정하고, 인터뷰 산출물은 `domain.config.ts`(리소스 타입, 시술/좌석/객실 정의, 소요시간, 영업시간, 시간대, 취소 정책, 라벨/카피, 위젯 타입, 메일 토글, Polar 토글) + 시드 데이터. 코드젠은 위젯 선택과 카피 수준으로 최소화 — 도메인 교체가 안전해짐.
- 관리자 위젯 프리미티브 2종: **캘린더 뷰**(시간 슬롯형: 미용실·펜션·진료) / **좌석 그리드 뷰**(공간형: PC방·도서관). 도메인 config가 선택.
  - > 현재 상태(PR4, 2026-07-15): `adminWidget`는 config → `inject.mjs` 검증 → `dashboardSnapshot` → `AdminWidgetBoard`로 전달된다. `seatGrid`이면 `SeatGridWidget`, 그 외에는 `CalendarWidget`을 렌더하는 분기가 구현되어 있으며 두 위젯은 동일한 예약 snapshot을 사용한다. 상세 계약은 `apps/app/README.md` 참고.
- 스킬 구성: `SKILL.md`(오케스트레이션 fast path) + `REFERENCE.md`(방법론·주입 계약·QA 레시피) + `EXAMPLES.md`(도메인 팩) + `scripts/`(scaffold.mjs: 템플릿 복사·이름 치환 / inject.mjs: 도메인 팩 주입 / verify.mjs: 게이트 러너).

### 2.3 셋업 계층 (생성된 프로젝트의 `bun setup`)
대화형 CLI(@clack/prompts 계열). 각 단계 = 안내 → 입력 → 즉시 검증 프로브 → 저장:
1. **Convex**: `~/.convex/config.json` 인증 확인 → `npx convex dev --once --configure new --project <이름>` (이번 세션에서 검증된 플로우). 미로그인 시 `npx convex login` 안내.
2. **Google OAuth**: 콘솔 단계별 안내 출력(프로젝트 생성 → OAuth 동의 화면 → 클라이언트 생성), **redirect URI를 Convex 배포 URL에서 자동 계산해 복사용으로 출력** → client id/secret 입력 → `npx convex env set`.
3. **Resend**: API 키 입력 → 테스트 발송 옵션으로 검증.
4. **OpenAI**: 키 입력 → 모델 리스트 프로브로 검증.
5. **Polar** (도메인 config가 켠 경우만): 키 입력.
6. `.env.example` → `.env.local` 생성. 마무리에 `bun qa` 스모크 안내.

**시크릿 규칙(엄수)**: 키 입력은 마스킹, 어떤 로그·보고서·증거 파일에도 키 값 출력 금지(존재 여부만), `.env.local`·`.convex` 관련 파일 .gitignore 보장, 킷 레포에는 시크릿이 존재할 수 없음.

### 2.4 검증 계층 (킷 규약)
생성된 프로젝트마다: `bun build` + Biome + tsc + QA 게이트(라우팅/가드레일 차단/프라이버시 grep/영속성/홀드 만료/메일 발송 증거) + 브라우저 실증(챗 해피 패스, 대시보드 렌더). 킷 자체의 셀프 테스트: 스킬로 샘플 도메인을 실제 생성해 전체 게이트 통과.

## 3. builder-test에서 검증된 규약 (킷에 명문화할 것)

`~/dev/side/builder-test`(미용실 샘플)에서 실제 버그·수정으로 확인된 교훈:

1. **불변식은 Convex mutation 안에서** — 슬롯 충돌, 홀드 생성/만료, 상태 전이, 24시간 규칙을 mutation이 트랜잭션으로 강제. Node/Next는 오케스트레이션만.
2. **시간대는 매장 TZ의 calendar parts로 판정** — Convex 런타임은 UTC. `getHours()`류 런타임 로컬 시간 사용 금지 (실제 발생: 13:00 KST 슬롯이 "영업시간 밖"으로 거부된 버그).
3. **Node↔Convex 경계 직렬화 일괄 정규화** — Date/undefined/Map/Set은 경계에서 변환. raw client 직접 호출 금지, store 경계 모듈 경유 (실제 발생: `Date` 인자로 500).
4. **SSE 수제 중계 폐기 → Convex 반응형 쿼리(useQuery)** — builder-test의 SSE 계층 전체가 Next+Convex 조합에서는 불필요. 큰 단순화.
5. **홀드 만료는 scheduler + 테스트용 단축 env** (`SALON_TEST_HOLD_MS` 패턴).
6. **PublicContext/InternalContext 분리 + 공개 표면 grep 게이트** — 내부 키가 챗·위젯·공개 JSON에 나오면 게이트 실패.
7. **thread_id는 인증이 아님** — 고객 챗과 자기 예약은 Convex Auth 사용자 ID로 권한을 판정하고, thread ID는 대화 라우팅 키로만 사용. 내부 `/admin`은 별도 운영자 allowlist를 fail-closed로 적용.
8. **2단 검증 루프** — Codex 샌드박스는 네트워크 차단(npm·Convex 불가). 브리프에 "네트워크 게이트는 로컬 실행 지침으로 남겨라"를 명시하고 오케스트레이터가 로컬에서 게이트 실행. 실패 시 증거(오류 전문, 재현 커맨드)를 좁혀 재위임.
9. **브리프 계약** — Goal/Scope/Must-NOT/게이트/Stop condition/완료 마커. 게이트 없는 위임 금지.
10. **에이전트 로스터 패턴** — triage(분류·핸드오프만) + availability/reservation/policy/escalation 전문가. 쓰기 도구는 reservation 계열만 소유. 되돌리기 어려운 쓰기는 확인 가드레일 필수.

## 4. 킷 레포 구조 (`~/dev/side/jeomwon`)

```
jeomwon/
├── docs/
│   ├── plan.md              # 이 문서 (SSOT)
│   └── upstream-report.md   # Phase 0 산출: v1 구조 조사 보고
├── template/                # 핀 고정 패치 템플릿 (Phase 1~5의 작업 대상)
│   ├── UPSTREAM.md
│   ├── apps/web, apps/app, packages/backend, packages/email, ...
│   └── scripts/setup/       # bun setup 위저드
├── skill/                   # Claude Code 스킬 (Phase 6)
│   ├── SKILL.md, REFERENCE.md, EXAMPLES.md
│   ├── scripts/  (scaffold.mjs, inject.mjs, verify.mjs)
│   └── templates/ (도메인 팩 조각)
└── samples/                 # Phase 7 셀프 증명 산출물 (생성 예: 펜션 예약)
```

## 5. 구현 로드맵 — senior-mode 위임 단위

각 Phase = 브리프 1개 + 게이트 + 완료 마커. 순서 의존 있음.

| Phase | 내용 | 핵심 게이트 |
| --- | --- | --- |
| **0. 리서치** (read-only) | get-convex/v1 실구조 조사: 핀 커밋 결정, 앱/패키지 경계, Convex Auth(Google) 구성 방식, Sentry·OpenPanel 제거 지점, i18n·Polar 배선. @openai/agents를 Next route handler(Node 런타임)에서 쓰는 제약 확인 | 조사 보고서에 파일 경로 근거 인용, 제거 대상 전수 목록 |
| **1. 템플릿 벤더링** | v1 핀 클론 → strip(Sentry/OpenPanel) → 이름 치환 가능화 → `template/`로 벤더링 | `bun install && bun build` + Biome + tsc 통과 (CS AI 없이) |
| **1.5 전면 최신화** | 1단계: Next 16 + React 19 + Convex/Convex Auth·Polar·React Email·Resend·nuqs·next-themes 등 전 의존성 최신 (i18n 라이브러리는 Next 16 호환 확인 후 유지 또는 교체). 2단계: Tailwind 4 + shadcn 최신 (실패 시 Tailwind 3 폴백). Codex는 버전·코드 마이그레이션, install/build 오류 루프는 로컬 2단 검증 | 단계별 `bun install && bun build` + typecheck + lint + 두 앱 dev 부팅 스모크 |
| **2. CS AI 코어** | generic reservation core 스키마 + 에이전트 런타임(@openai/agents, mock 폴백 포함) + 고객 챗 위젯. 도메인 하드코딩 금지 — 전부 `domain.config.ts` 주도 | builder-test QA 7항목 이식판 + 직렬화·시간대 규약 준수 검사 |
| **3. 관리자 대시보드** | 캘린더 뷰·좌석 그리드 프리미티브, 에스컬레이션 큐, 타임라인. Convex useQuery 실시간 | 브라우저 실증(예약 발생 → 대시보드 실시간 반영), 프라이버시 grep |
| **4. 메일** | React Email 템플릿(확정/변경/취소/에스컬레이션) + Resend 발송(Convex action/scheduler 경유) | 상태 전이 → 발송 증거(테스트 모드 페이로드 캡처), mutation 내 발송 금지 |
| **5. 셋업 위저드** | `bun setup`: Convex 프로비저닝, Google OAuth 안내+입력, Resend/OpenAI/Polar 키, .env 생성. 단계별 검증 프로브 | 신규 머신 시나리오 리허설, 시크릿 마스킹·비출력 검사 |
| **6. 스킬 계층** | SKILL/REFERENCE/EXAMPLES + scaffold/inject/verify 스크립트. 인터뷰 → domain.config + 시드 생성 | 스킬 드라이런: 인터뷰 답변 고정 입력 → 결정적 산출 |
| **7. 셀프 증명** | 스킬로 **펜션 예약** 도메인(미용실과 다른 축: 숙박일 단위, 좌석 아님) 생성 → 셋업 → 전체 QA → 브라우저 실증 | 전 게이트 + 도메인 일반성 증명 |

## 6. 1차 범위에서 제외 (명시적 아웃)

- 프로덕션 배포 파이프라인(Vercel/Convex prod deploy) — 킷 v2
- 관리자 다중 계정/권한 체계(RBAC) — Google 로그인 단일 운영자로 시작
- 실 결제 플로우 E2E(Polar는 배선+토글까지, 실 과금 시나리오는 도메인 프로젝트에서)
- 킷 배포 채널(skills CLI 원라이너, GitHub template화) — 완성 후 `make-public`/`skill-installer`로 별도 진행

## 7. 리스크와 대응

| 리스크 | 대응 |
| --- | --- |
| v1 upstream이 예상과 다른 구조 (Bun? 앱 경계?) | Phase 0 read-only 조사로 계획 보정 후 Phase 1 진입. 계획은 조사 결과에 열려 있음 |
| @openai/agents가 Next 런타임/엣지에서 제약 | Phase 0에서 확인. 실패 시 대안: Convex action 내 실행 또는 별도 Node 워커 |
| generic core가 특정 도메인(숙박일 단위 등)을 못 담음 | 도메인 config에 slot 단위(30분/1시간/1일) 축 포함, Phase 7 펜션으로 조기 검증 |
| Codex 샌드박스 네트워크 차단 | 규약 8(2단 검증 루프) 고정 적용 |
| 시크릿 유출 | 규약: 마스킹 입력, 로그 금지, gitignore 게이트, 킷 레포 시크릿 제로 |
```
