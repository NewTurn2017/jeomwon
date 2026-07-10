# M4.2 — 부트스트랩 원커맨드

날짜: 2026-07-10 · 브랜치: `m4-2-one-command` · 상태: 설계 확정 (사용자 승인, senior-mode)

## 1. 배경 — 여정의 결정론 구간만 묶는다

새 업종 착수 여정(인터뷰 → domain-pack → scaffold → inject → install → setup → verify → qa)에서 scaffold/inject/verify/qa만 개별 원커맨드이고 상위 묶음이 없다(2026-07-10 Codex 인벤토리). setup은 대화형 9단계이며 `--non-interactive`가 있어도 Convex CLI 인증 갭으로 새 머신 완전 무인은 불가능하다.

브레인스토밍 확정(2026-07-10, 4안건):

1. **묶음 범위** — 결정론 구간(scaffold → inject → install → verify)만 부트스트랩 묶음으로. setup(시크릿·대화형)·qa(라이브)는 기존 원커맨드 유지, 묶음 밖.
2. **소재지** — `skill/scripts/`. scaffold 이전에 실행되는 커맨드라 생성물 밖에 있어야 하고, 소비자(코딩 에이전트)의 기존 진입점과 일치.
3. **setup과의 관계** — 묶음 끝에 "다음 단계: setup → qa" 안내 출력만. 플래그 통과·체인 실행 없음.
4. **기계장치 경계** — 얇은 시퀀서만. 새 설정 포맷·상태 파일·레지스트리·훅 일체 금지(VISION 확정 결정 2와 정합).

## 2. 산출물

### 2.1 `skill/scripts/bootstrap.mjs` 신설

- 얇은 시퀀서: 기존 스크립트(scaffold → inject → install → verify)를 순차 호출만 하고 자체 도메인 로직 없음.
- 인자: 기존 scaffold 계약(팩 경로·타깃 디렉토리)을 그대로 전달. 새 인터페이스 발명 금지.
- 실패 처리: 첫 실패에서 중단, **실패한 단계 이름 + 그 단계부터 수동 재실행할 정확한 커맨드**를 출력. 상태 파일 없음 — 재개는 개별 커맨드 안내로 해결.
- 종료 메시지: 생성물 경로 + 다음 단계(`bun setup` → `bun run qa`) 안내.

### 2.2 스킬 문서 시퀀스 갱신

- `skill/SKILL.md`: 에이전트 여정의 표준 경로를 bootstrap 원커맨드로 갱신. 개별 커맨드(scaffold/inject/verify)는 재실행·부분 실행용으로 존치.
- `skill/REFERENCE.md`: 커맨드 레퍼런스에 bootstrap 추가, 여정 서술 동기화.

### 2.3 여정 서술 문서 동기화

- `README.md` / `README.ko.md` / `START-HERE.md` 등 착수 절차를 서술하는 문서에서 개별 4커맨드 나열을 bootstrap 기준으로 갱신(개별 커맨드 존치 사실 유지).
- `VISION.md` 로드맵 M4.2 완료 표기(구현 완료 시).

### 2.4 구현 시 확인 항목 (플랜 단계에서 실물 확인)

- `verify.mjs`가 이미 offline install을 포함하면(FEATURES 10절 서술) bootstrap의 별도 install 단계를 생략하고 **scaffold → inject → verify** 3단계로 축소.
- scaffold가 기존 타깃 디렉토리에서 어떻게 동작하는지(거부/덮어쓰기) 확인해 재실행 안내 문구에 반영.

## 3. 검증 게이트

| 대상 | 게이트 |
|---|---|
| 신규 경로 | bootstrap 원커맨드로 샘플 팩(예: `samples/pension-stay`) 생성 → verify 오프라인 게이트 그린 |
| 회귀 | `cd template && bun run qa` 9게이트 그린 + typecheck·lint ("did not confirm reservation" 플레이크 시 재실행 1회 먼저) |
| 후방 호환 | scaffold/inject/verify 단독 실행 경로 불변 |
| 스코프 감사 | `git diff --name-only` = 2.1~2.3 승인 파일 집합만 |

## 4. 하드 요구 · 비목표

- **비목표**: setup 무인화(Convex CLI 인증 갭은 킷이 못 고침 — 범위 밖) · qa 묶음 포함 · 엔진/앱/UI 코드 변경 · 새 기계장치(상태 파일·레지스트리·훅·새 설정 포맷).
- `upstream/`, `docs/upstream-report.md` 수정 금지. main 직접 커밋 금지(본 브랜치 사용).
- 이름: 커맨드/파일명은 `bootstrap` (사용자 승인).

## 5. 완료 조건

1. 2절 산출물 작성 완료
2. 3절 게이트 전부 그린 (라이브 QA는 오케스트레이터 실행·관측)
3. 브랜치 커밋 완료 (머지·push는 사용자 결정)
