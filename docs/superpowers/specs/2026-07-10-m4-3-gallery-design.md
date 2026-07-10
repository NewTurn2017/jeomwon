# M4.3 — 기능 모듈 갤러리·예제 (문서 카탈로그)

날짜: 2026-07-10 · 브랜치: `m4-3-gallery` · 상태: 설계 확정 (사용자 승인, senior-mode)

## 1. 배경 — 갤러리의 실체를 문서 카탈로그로

VISION 로드맵 M4.3("확장 패턴 갤러리와 예제 도메인 팩 확충")의 마지막 서브 마일스톤. 현재 갤러리 산출물 0, 소재는 확보됨: `skill/EXAMPLES.md` 팩 5종, showcase 6팩(별도 repo `~/dev/side/jeomwon-showcase`), noShow blind proof 생성물(showcase `_runs/m2-salon-no-show-20260709-000938`), waitlist 참조 구현(M1, `template/packages/backend/convex/engine/waitlist.ts`).

브레인스토밍 확정(2026-07-10, 4안건):

1. **실체** — 문서 카탈로그. 실행물은 기존 showcase·samples를 링크·재사용, 웹 갤러리·킷 내 실행 예제 세트는 만들지 않음.
2. **소재지** — 기존 문서 확장만: 확장 패턴 갤러리는 `skill/REFERENCE.md` 섹션, 예제 팩 카탈로그는 `skill/EXAMPLES.md`. 새 파일 0.
3. **Code Extension Contract와의 경계** — 갤러리는 waitlist·noShow를 **사례(case study)로 문서화**만. 패턴 일반화·프레임워크화 금지(VISION 확정 결정 2 "패턴 3회+ 반복 전 유보" 유지).
4. **팩 확충 범위** — showcase 승격 위주: showcase 6팩 중 EXAMPLES 미수록 도메인을 이식·승격, 리소스4×slot3×위젯2 매트릭스에 실제 구멍이 있을 때만 신규 1개 이내.

## 2. 산출물

### 2.1 `skill/REFERENCE.md` — 확장 패턴 갤러리 섹션 신설

- Code Extension Contract 인접에 섹션 추가. 사례 2건:
  - **waitlist** (킷 내 M1 참조구현): `features.waitlist` 팩 토글, `engine/waitlist.ts` `onSlotFreed` 단일 훅, notify-only 경계, `isActiveReservation` 비활성 취급, SKIP-aware QA 게이트 9 — 실물 경로 인용.
  - **noShow** (M2 blind proof): 규약 텍스트만으로 fresh agent가 완주한 사례. 생성물은 킷 밖(showcase `_runs/`)이므로 경로·판정 기록을 링크로 기술, 코드 이식 금지.
- 각 사례는 규약 5요소(불변식 상속·기능 소유 모듈·명명된 훅·off-default 토글·SKIP-aware QA 게이트)를 어떻게 지켰는지 서술.
- 일반화 금지: 공통 추상·패턴 템플릿·registry 서술을 만들지 않는다.

### 2.2 `skill/EXAMPLES.md` — 예제 팩 카탈로그 확충

- showcase 6팩(01-salon-hair ~ 06-webinar-live) 중 EXAMPLES 미수록 도메인의 팩 JSON을 승격(이식). 정확한 승격 목록은 플랜 단계 인벤토리로 확정(2.4).
- 리소스 4종 × slot 3종 × 위젯 2종 매트릭스 커버리지 표 추가 — 각 팩이 커버하는 조합 명시.
- 매트릭스에 실제 구멍이 있을 때만 신규 팩 1개 이내 추가.
- showcase repo 존재·경로를 카탈로그 항목으로 명시(실행 예제는 그쪽).

### 2.3 `VISION.md` 갱신

- 로드맵 M4.3 완료 표기(구현·게이트 완료 시, M4.1·M4.2와 동일 방식).

### 2.4 구현 시 확인 항목 (플랜 단계에서 실물 확인)

- showcase 6팩 vs EXAMPLES 5팩의 도메인·매트릭스 겹침 인벤토리 → 승격 대상 목록 확정.
- 매트릭스 갭 유무 → 신규 팩 필요 여부(1개 이내) 판정.
- noShow proof 생성물의 안정 참조 방법(외부 경로 서술 규칙 — 생성물 상대경로 규칙과 충돌하지 않게).

## 3. 검증 게이트

| 대상 | 게이트 |
|---|---|
| 승격·신규 팩 | 각 팩을 **M4.2 bootstrap 원커맨드**로 임시 타깃에 생성 → verify 오프라인 게이트 그린 (팩-킷 현행 호환 실증) |
| 문서 정확성 | 사실검증 패스: 갤러리·카탈로그의 모든 경로·심볼·서술 주장을 실물과 대조, 불일치 0 |
| 회귀 | `cd template && bun run qa` 9게이트 그린 + typecheck·lint (오케스트레이터 실행, 플레이크 시 재실행 1회 먼저) |
| 스코프 감사 | `git diff --name-only` = 승인 파일 집합만 |

## 4. 하드 요구 · 비목표

- **비목표**: 새 문서 파일 · 웹 갤러리 · 킷 내 실행 예제 앱 · 패턴 일반화/프레임워크/registry · 엔진·앱·스킬 스크립트 코드 변경(팩 JSON과 문서 확장만) · showcase repo 수정.
- `upstream/`, `docs/upstream-report.md` 수정 금지. main 직접 커밋 금지(본 브랜치 사용).
- 예상 변경 파일: `skill/REFERENCE.md`, `skill/EXAMPLES.md`, `VISION.md` (+ 필요 시 README 계열 한 줄 링크 — 플랜에서 확정).

## 5. 완료 조건

1. 2절 산출물 작성 완료
2. 3절 게이트 전부 그린 (라이브 QA는 오케스트레이터 실행·관측)
3. 브랜치 커밋 완료 (머지·push는 사용자 결정)
