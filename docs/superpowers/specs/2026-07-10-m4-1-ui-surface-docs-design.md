# M4.1 — UI 표면 사실 문서화 + 문서-코드 불일치 정정

날짜: 2026-07-10 · 브랜치: `m4-1-ui-docs` · 상태: 설계 확정 (사용자 승인, senior-mode 팀 델리게이트)

## 1. 배경 — M4 분해와 M4.1 재정의

VISION 로드맵 M4(DX & 갤러리)를 3분할로 확정: **M4.1 UI 표면 문서화(본 스펙) → M4.2 원커맨드 플로우 → M4.3 기능 모듈 갤러리·예제**. 테스트는 각 단계 게이트로 흡수.

M3가 이월한 "widget kit 문서화"는 조사(`task-20260710021401-27bnbz`, 2026-07-10)로 전제가 바뀌었다: **`adminWidget: "calendar" | "seatGrid"`는 데이터 경로만 존재하고 렌더 분기가 없다.** 팩 인터뷰가 묻고, `inject.mjs`(153-168행)가 검증하고, `dashboardSnapshot`(admin.ts:60-71)이 반환하지만, `apps/app` 코드에 `CalendarWidget`/`SeatGridWidget` 컴포넌트도 `adminWidget` 참조 분기도 없다. 실제 렌더 표면은 단일 `AdminDashboard`(`_components/admin-dashboard.tsx`) 하나다.

사용자 결정: **사실 문서화 + 불일치 정정** — 위젯 실구현은 UI 재설계 방향(카톡형 위젯 등)과 묶어 별도 결정.

## 2. 산출물

### 2.1 앱 경계 README 2개 신설 (영어, M3 engine/README 패턴 — scaffold로 생성물에 복사)

1. **`template/apps/web/README.md`** — 고객 UI 표면:
   - 컴포넌트 인벤토리: `CustomerChatWidget`(props 없음, `useQuery(chat.publicState)` + `/api/chat` POST 소비, 내부 컴포넌트 `StoreAvatar`/`UserBubble`/`AssistantBubble`/`SystemNotice`/`ReservationCard`), `ChatCtaButton`, `AnimatedText`, `Header`/`Footer`, `ConvexClientProvider`
   - 확장 에이전트 소비 방법 + Session Rules 상속(공개 표면 grep-clean, PublicContext만 노출, `thread_id`는 연속성 키)
   - 기존 `apps/web/README.md`가 있으면 신설 대신 확장
2. **`template/apps/app/README.md`** — 관리자 UI 표면:
   - 단일 `AdminDashboard` 진입(page.tsx에서 렌더), 내부 컴포넌트 표(`ReservationsPanel`/`ReservationMetric`/`ReservationRow`/`EscalationQueue`/`AgentTimeline`/`StatusPill`), `dashboardSnapshot` 쿼리·`resolveEscalation` 뮤테이션 소비
   - **adminWidget 한계 명시**: 값은 팩 계약·데이터 경로(config→inject 검증→snapshot 반환)로만 흐르고 UI 렌더 분기 없음 — calendar/seatGrid 선택이 현재 대시보드에 미반영. locale 문자열(ko.ts:24-30 등)도 미소비.
   - 경로 참조는 **생성물에서도 유효한 상대 경로**(M3 교훈 — `template/` 접두사 금지, `skill/REFERENCE.md` 참조는 킷 repo 소재 명시)

### 2.2 문서-코드 불일치 정정 (조사에서 확인된 4건)

| # | 파일 | 정정 |
|---|---|---|
| 1 | `FEATURES.md`(99행 등), `README.md`(39행), `docs/plan.md` | "대시보드가 adminWidget 값으로 렌더" 서술 → 사실로 정정(계약·데이터 경로만, 렌더 미반영). plan.md는 역사 문서이므로 원문 유지+주석 한 줄 또는 최소 정정 중 플랜 단계에서 결정 |
| 2 | `README.md`(47행), `template/scripts/setup/index.ts`(1261-1266행 완료 메시지) | "8게이트" → 9게이트 |
| 3 | `README.md`(40행) | EXAMPLES에 없는 clinic 예제 언급 제거(실제 5종: Salon/PC Bang/Library And Study Room/Pension Stay/Generic Appointment) |
| 4 | `skill/REFERENCE.md`(114-124행) | QA 수동 기동 절차를 현행 `bun qa` 원커맨드(qa-local.ts가 Convex 준비·web 기동·게이트·정리 자동화)와 동기화 |
| 5 | `README.ko.md` | README.md의 한국어 1:1 미러 — 동일 불일치 3건(위젯 렌더 서술·8게이트·clinic) 동일 정정 (플랜 리뷰에서 추가 확정, 2026-07-10) |
| 6 | `VISION.md` 2.2(30·34행) | 내부 일관성: "관리자 위젯 2종" working 함의 최소 정정, "8게이트"→9게이트(86행과 일치) |
| 7 | `START-HERE.md`(42행) | "8게이트" → 9게이트 (사실 대조 패스 발견, 2026-07-10 추가). 49행 "8/8"은 웨비나 데모 생성물의 당시 관측치(해당 앱 qa.ts는 gate 9 이전 8게이트 — 실물 대조로 확인)라 8/8 유지 + "gate 9 이전 생성물" 한정어만 추가 |
| 8 | `template/packages/backend/convex/email/reservationActions.ts`(51행) | 주석 "8-gate email check" → 9-gate (주석만, 동작 무변경) |

수용 결정(무변경): `docs/plan.md` 41행 "진료" 열거는 비전 진술(킷은 도메인 무관)로 수용, 53행은 개념 예시+인접 정정 주석으로 보정됨. `VISION.md` 39행·M1 스펙의 "8게이트"는 역사 관측치.

`setup/index.ts` 수정은 문자열 리터럴(카피)만 — 동작 무변경, typecheck/lint/QA로 회귀 확인.

### 2.3 VISION 갱신

- 2.3 알려진 한계에 추가: adminWidget 렌더 미반영(실구현은 UI 재설계와 함께 결정)
- 로드맵 M4를 M4.1/M4.2/M4.3 분해로 기록, M4.1 완료 표기

## 3. 검증 게이트

| 대상 | 게이트 |
|---|---|
| 문서 정확성 | fresh 팀메이트 사실 대조 패스(read-only): 신설 README 2개 + 정정분의 모든 경로·심볼·서술 주장을 코드와 대조, 불일치 0까지 수정 |
| 회귀 | `cd template && bun run qa` 9게이트 그린 + typecheck·lint(setup 문자열 수정 커버) — 오케스트레이터 실행 |
| 스코프 감사 | `git diff --name-only`가 2.1~2.3 대상 파일만 보고 |

## 4. 하드 요구 · 비목표

- **동작 변경 금지** — 코드 수정은 setup 완료 메시지 문자열 1곳뿐. 엔진·앱·스킬 스크립트 로직 불변.
- calendar/seatGrid 위젯 구현 금지(UI 재설계와 별도 결정), M4.2 원커맨드·M4.3 갤러리 범위 침범 금지.
- `upstream/`, `docs/upstream-report.md` 수정 금지. main 직접 커밋 금지(본 브랜치 사용).
- adminWidget 데이터 경로(config/inject/snapshot) 제거·변경 금지 — 한계 기록만.

## 5. 완료 조건

1. 2절 산출물 작성 완료
2. 사실 대조 불일치 0 + QA·typecheck·lint 그린 + 스코프 감사 통과
3. 브랜치 커밋 완료 (머지·push는 사용자 결정)
