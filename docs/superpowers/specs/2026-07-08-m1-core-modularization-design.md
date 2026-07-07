# M1 — 코어 모듈화 (대기자 파일럿) 설계 스펙

- 날짜: 2026-07-08
- 상태: 확정 (구현 대기)
- 브랜치 대상: `main`에서 새 작업 브랜치(`m1-modularization`) 파생
- 근거 문서: [VISION.md](../../../VISION.md) (결정 ②·③, 로드맵 M1), [FEATURES.md](../../../FEATURES.md) (현행 기능)

## 목표 (Goal)

예약 수명주기 엔진을 **경계 있는 관심사 모듈**로 정리하고, **팩 토글 패턴을 견고화**한다. 이를 추측성 registry가 아니라 **구체 기능 1개(대기자, notify-only)**로 실증한다. 대기자를 붙일 때 자기 모듈 + 훅 1개만 건드리고 코어 뮤테이션 바디는 안 건드리는 seam을 증명한다.

## 제약 (Constraints)

- **결정 ②** — 팩 토글 먼저 견고화. 이벤트 버스/registry 프레임워크는 확장 패턴 3+ 반복 시로 유보(이번엔 명명된 훅 함수 하나만).
- **결정 ③** — 새 `packages/*` 금지. 백엔드 내부 폴더 경계(`convex/engine/`)로만 분리.
- **동작 보존** — 엔진 분리는 순수 리팩터. `features.waitlist=false`(기본)면 기존 동작 0 변경.
- **보호 파일** — `upstream/`, `docs/upstream-report.md` 수정 금지.
- **비밀** — 팩 밖·setup에만. 스펙/코드에 시크릿 없음.
- **검증** — 모든 경로에 8게이트 QA + verify 유지. 새 기능엔 새 게이트.

## 비목표 (Must-NOT)

- 자동 홀드/승격(auto-offer) 캐스케이드 금지 — v1은 notify-only.
- 이벤트 버스/플러그인 registry 금지.
- 새 Convex 테이블 금지 — 기존 `reservations` 재사용.
- 고객 이메일 수집 금지 — 고객 알림은 챗 스레드, 운영자만 메일.
- 스키마(`schema.ts`) 변경 금지(가능한 한). `waitlisted` 상태·`by_domain_status_time` 인덱스는 이미 존재.

---

## 1. 모듈 경계 (엔진 분리 — 동작 보존)

현행 `packages/backend/convex/jeomwonLib.ts`(≈449줄, 관심사 혼재)를 관심사 폴더로 분리:

| 새 파일 | 옮겨오는 심볼 |
|---|---|
| `convex/engine/availability.ts` | `buildSlot`·`isSlotAllowed`·`alignToSlot`·`serviceEndMs`·`slotStepMs`·`firstSearchStart`·`hasCollision`·`calendarParts`·블랙아웃/영업시간/day-slot 내부 헬퍼 |
| `convex/engine/policy.ts` | `isInsideCancelWindow`·홀드 기간 헬퍼·(신규)`isInsideRescheduleWindow` 술어 |
| `convex/engine/lifecycle.ts` | `defaultPublicContext`·`publicContextFromReservation`·`nextStepForStatus`·`isActiveReservation`·`defaultGuardrailStatus`·`publicDomainSnapshot`·`auditEvent`·`appendAudit`·`timeWindowLabel`·`serviceByKey`·`resourceByKey`·`resourcesForService` |

- `jeomwonLib.ts`는 **삭제**한다(배럴 재export로 남기지 않는다 — 경계를 실제로 긋기 위해).
- 임포터 갱신(경로만): `agentTools.ts`, `admin.ts`, `chat.ts`, `scripts/qa.ts`. 각 파일이 실제 쓰는 심볼을 해당 `engine/*`에서 import.
- 함수 시그니처·본문 로직 불변. 순수 이동. → 기존 8게이트 QA green + typecheck/lint/build로 무회귀 증명.

## 2. 토글 견고화 (`features.waitlist`)

- `packages/backend/domain.config.ts`의 `DomainPack.features`에 `waitlist: boolean` 추가. 기본 `false`.
- `skill/REFERENCE.md` 스키마 + `skill/scripts/inject.mjs` 검증에 `features.waitlist`(boolean, 필수 또는 기본 false) 반영.
- 기존 팩은 `waitlist` 미지정 시 `false`로 취급(하위호환). email/polar 다음 **3번째 토글**로 토글 패턴을 견고화한다.

## 3. 대기자 모듈 (`convex/engine/waitlist.ts`)

### 데이터 모델 (스키마 변경 0)
- 대기 엔트리 = `reservations` row, status `waitlisted`. 필드: `threadId`, `serviceKey`, `resourceKey`(희망 없으면 서비스 기본), `startMs`/`endMs`(희망창; 미지정이면 조회 기준 시각), `reservationNumber`(고객 참조용 발급).
- `isActiveReservation`은 이미 `waitlisted`를 비활성 처리 → 실 예약/충돌을 절대 막지 않음.
- 조회: `by_domain_status_time`(domainKey, status, startMs) 인덱스로 `waitlisted` row 스캔.

### 접수 (join)
- `AgentToolbox`에 7번째 메서드 `joinWaitlist(args)` 추가 + Convex `joinWaitlist` 뮤테이션.
- 결정론 엔진(`packages/agents/src/index.ts`): `handleAvailability`에서 슬롯 0개 **그리고** `features.waitlist=true`면 `joinWaitlist` 호출 → 공개상태 `waitlisted`, nextStep 문구는 **기존 대기 문구 재사용**(`recordAvailability`가 0슬롯 시 쓰는 "운영자 확인 가능한 대기 요청으로 접수할 수 있습니다." 계열). **copy 스키마에 새 필드 추가하지 않는다**(모든 팩·inject 검증 파급 회피).
- openai 런타임: 7번째 툴 `join_waitlist`(파라미터 serviceKey nullable, whenHint nullable)를 `buildAgentTools`에 추가.
- 토글 off면 접수 경로 미노출 — 기존 "조건에 맞는 시간 없음" 문구 유지.

### 알림 (onSlotFreed 훅)
- `waitlist.ts`에 `onSlotFreed(ctx, { serviceKey, resourceKey, startMs, endMs })` 하나.
- 호출 지점 **3곳**(슬롯이 비는 곳): `cancelReservation`(취소·에스컬레이션 모두), `expireReservation`(홀드 만료), `rescheduleReservation`(옛 슬롯 이탈).
- 동작(토글 on일 때만): 해당 `serviceKey`의 `waitlisted` 첫 대기자를 찾아
  1. 그 대기자 `threadId`에 챗 이벤트 삽입(role system, type `waitlist.slotOpened`, publicMessage = "자리가 났어요. 지금 예약 가능합니다.")
  2. 운영자 메일 스케줄(kind `reservation.waitlist_opened`)
  3. 대기 row audit에 `waitlist.notified` 추가 → 같은 대기자 재알림 dedupe(이미 notified면 스킵하고 다음 대기자).
- 토글 off면 no-op(early return).

## 4. 알림 채널 (기존 seam 재사용)

- 고객 = 챗 스레드(Convex 반응형 쿼리, 재방문 시 노출). 신규 이메일 수집 없음.
- 운영자 = 메일. 신규 종류 `reservation.waitlist_opened` 1개:
  - `packages/email` `renderReservationEmail`의 `ReservationEmailKind`에 추가 + 템플릿 카피.
  - `convex/email/validators.ts` `reservationEmailKindValidator`에 리터럴 추가.
  - `convex/email/reservationActions.ts` `agentForKind`에 매핑 → `reservation`(신규 액터 도입 안 함; `AgentName` 유니온 무변경).
  - `features.email=false`면 기존대로 스케줄·발송 skip(대기 알림 챗 이벤트는 그대로).

## 5. 검증

### 엔진 분리 무회귀
- 쇼케이스 앱(`~/dev/side/jeomwon-showcase/06-webinar-live/app`, waitlist off)에서 `bun run qa` **8/8** + `bun typecheck`/`lint`/`build`.

### 대기자 게이트 9 (`scripts/qa.ts`)
- 기존 SKIP 패턴을 따른다: `features.waitlist=false`면 결정론 **SKIP**(사유 출력).
- on이면: 리소스 포화로 0슬롯 유도 → 대기 접수(상태 `waitlisted` 확인) → 슬롯 취소로 `onSlotFreed` 유발 → 대상 스레드 상태 조회로 (a) 챗 이벤트 `waitlist.slotOpened` 존재 (b) `email.captured` payload.template === `reservation.waitlist_opened` 검증.
- 쇼케이스 팩은 waitlist off이므로 기본 실행 시 게이트 9는 SKIP. 대기자 실증은 토글 on 팩(쇼케이스 팩 복제/토글 또는 신규 샘플)에서 게이트 9 PASS로 확인.

## 6. 문서

- `FEATURES.md`: 대기자(notify-only) 섹션 + `features.waitlist` 매트릭스 반영.
- `VISION.md`: 로드맵 M1 진행 표시.

---

## 구현 순서 (플랜에서 태스크로 분해)

1. **엔진 분리** — `engine/{availability,policy,lifecycle}.ts` 생성, `jeomwonLib.ts` 삭제, 임포터 4곳 갱신. 게이트: 8/8 QA + typecheck/lint/build green (동작 보존).
2. **토글 + contract** — `features.waitlist` (domain.config·REFERENCE·inject), `agent-contract.ts`에 `WaitlistArgs`·toolbox 메서드 타입.
3. **접수(join)** — `joinWaitlist` 뮤테이션 + toolbox 구현 + 결정론 0슬롯 경로 + openai `join_waitlist` 툴.
4. **알림** — `waitlist.ts` `onSlotFreed`, 3개 호출 지점 배선, 신규 메일 종류(email 모듈·validators·actions).
5. **QA 게이트 9** — SKIP-aware, 토글 on 팩에서 PASS.
6. **문서** — FEATURES·VISION 갱신.

각 스텝은 독립 커밋. 스텝 1은 반드시 QA green을 확인한 뒤 다음으로.

## 완료 조건 (Stop condition)

- `features.waitlist=false` 쇼케이스 앱: `bun run qa` 8/8 + verify green(무회귀).
- `features.waitlist=true` 팩: 게이트 9 PASS(접수→알림 실증).
- `jeomwonLib.ts` 삭제, `engine/*` 3모듈 + `waitlist.ts` 존재. `agentTools.ts`가 엔진을 조합만.
- 문서 갱신 커밋. 보호 파일 무수정. main 직접 커밋 없음(작업 브랜치).
