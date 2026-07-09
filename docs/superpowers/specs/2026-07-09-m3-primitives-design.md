# M3 — 라이브러리 primitive 문서화 (engine/README.md)

날짜: 2026-07-09 · 브랜치: `m3-primitives` · 상태: 설계 확정 (브레인스토밍 ①~④ 사용자 확정, LazyCodex 파이프라인 위임 승인)

## 1. 목표

availability engine · policy engine · reservation lifecycle(+hold/lock 의미론)을 **재사용 라이브러리 수준으로 문서화**한다. 결정 ③(VISION.md:75)에 따라 코드 이동·패키지 승격 없이 **문서 경계만** 세운다. M2 Code Extension Contract가 "어떻게 안전하게 확장하나(how)"를 다루므로, M3 문서는 "primitive가 무엇이고 어떤 API·불변식을 제공하나(what)"를 채우고 둘을 상호참조한다.

## 2. 확정 결정 (2026-07-09 브레인스토밍)

- **④ 독자**: 확장 에이전트 1차 + 킷 기여자 2차 — **공용 단일 문서**. M2 규약과 상호참조 필수.
- **① 소재지**: `template/packages/backend/convex/engine/README.md` — 폴더 경계에 배치. scaffold 시 생성물로 복사되어 확장 에이전트가 킷 repo 없이도 접근하고, 코드와 문서가 버전 잠금된다. `skill/REFERENCE.md`·`FEATURES.md`에는 포인터 한 줄씩만.
- **② widget kit**: M3 **제외**, M4로 이월. 근거: barrel export 없는 앱 내부 React 컴포넌트가 두 앱(`apps/web` 고객 챗 위젯, `apps/app` 관리자 위젯)에 분산 — 지금 문서화하면 존재하지 않는 경계를 발명하게 됨. VISION 로드맵에 이월을 명기한다.
- **③ hold/lock 소재** (Codex 조사 `task-20260709053932-14ewrw` 판정): 별도 모듈·테이블 **아님**. hold = `reservations.status: "held"` + `holdExpiresAtMs` + `agentTools.ts` 뮤테이션(`createHold`/`expireHold` 등), active 판정은 `engine/lifecycle.ts`(isActiveReservation), 충돌 검사는 `engine/availability.ts`(hasCollision)에 분산. lock primitive는 부재 — 동시성은 Convex 뮤테이션 트랜잭션 경계 안의 read-before-write에 의존. → lifecycle 섹션 하위 **"Hold & concurrency"**로 문서화하고 소재 분산과 트랜잭션 의존 사실을 숨기지 않는다.

## 3. 산출물 (킷 커밋물 — 문서 4파일만)

1. **`template/packages/backend/convex/engine/README.md` 신설** (영어 — 확장 에이전트 소비, REFERENCE 규약과 정합). 섹션 구성:
   - **Availability engine** (`availability.ts`) — 역할 / export 표면 / 불변식(영업시간·블랙아웃·store-timezone calendarParts·충돌) / 소비 지점
   - **Policy engine** (`policy.ts`) — `isInsideCancelWindow` / `domain.config.ts` 정책 키와의 관계 / 소비 지점(취소=에스컬레이션, 변경=거부)
   - **Reservation lifecycle** (`lifecycle.ts`) — 상태 10종·전이 규칙·active 판정 + 하위 섹션 **Hold & concurrency**(2절 ③ 판정 그대로)
   - **Waitlist** (`waitlist.ts`) — 확장 참조 구현임을 한 줄로 표시하고 M2 Code Extension Contract로 위임
   - 각 primitive 섹션에 확장 에이전트용 **소비 방법**(명명된 훅, Must-NOT 상호참조) 포함
2. **`skill/REFERENCE.md`** — Code Extension Contract에서 engine/README를 가리키는 포인터 한 줄.
3. **`FEATURES.md`** — 포인터 한 줄.
4. **`VISION.md`** — 로드맵 M3 갱신: 완료 표기 + widget kit → M4 이월 명기.

## 4. 내용 근거 (조사 완료분 — 플랜·실행 단계에서 코드 재대조)

Codex 인벤토리(`task-20260709053932-14ewrw`)가 확보한 사실: `availability.ts:22-133` exports(`buildSlot`·`isSlotAllowed`·`hasCollision`·`slotStepMs`·`firstSearchStart`·`alignToSlot`·`serviceEndMs`·`calendarParts`), `policy.ts:1-7`(`isInsideCancelWindow`), `lifecycle.ts:187-202`(`isActiveReservation`), 소비 표면(`agentTools.ts` 뮤테이션, `convex-refs.ts`, `agent-contract.ts` 타입), 관련 테이블·인덱스(`reservations.by_resource_time` 등). 관찰된 비일관성 1건: `cancelReservation`이 held 취소 시 `holdExpiresAtMs`를 null 처리하지 않음(다른 경로는 처리) — **버그 아님**(status로 inactive 처리됨), 문서에 사실만 기록.

## 5. 검증 게이트

| 대상 | 게이트 |
|---|---|
| 문서 정확성 | **fresh Codex 사실 대조 패스**(read-only): README의 모든 경로·심볼·불변식 주장을 코드와 대조, 불일치 0까지 수정. M2 blind proof의 문서판 경량 버전. |
| 회귀 | `cd template && bun run qa` 9게이트 그린 (오케스트레이터가 샌드박스 밖에서, 실 Convex `dev:adamant-mole-272`). 코드 무변경이라 형식적 확인. |

## 6. 하드 요구 · 비목표

- **코드 무변경** — 엔진·앱·스크립트 일체. 산출물은 3절의 문서 4파일만.
- `upstream/`, `docs/upstream-report.md` 수정 금지. main 직접 커밋 금지(본 브랜치 사용).
- widget kit 문서화(M4), 패키지 승격, registry/플러그인 프레임워크(결정 ②③ 유보) 금지.
- 4절의 `holdExpiresAtMs` 비일관성 코드 수정 금지 — 스코프 밖(원하면 후속 이슈).

## 7. 완료 조건

1. 3절 산출물 4파일 작성
2. 사실 대조 패스 불일치 0 + template 회귀 QA 그린
3. 브랜치 커밋 완료 (머지·push는 사용자 결정)
