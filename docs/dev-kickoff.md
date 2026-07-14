# 킷 디벨롭 킥오프 (메인테이너 내부 노트)

> **이 문서는 킷 사용자용이 아닙니다.** 킷을 쓰려면 루트 [README.md](../README.md)의 빠른 시작을 보세요.
> 이 노트는 메인테이너의 개발 세션 킥오프용이며, 아래 "현재 상태" 블록은 2026-07-07 시점 스냅샷입니다
> (당시 미해결이던 issue C는 이후 M0.2에서 해결됨 — [VISION.md](../VISION.md) 2.3 참고).
> 목표·현재상태·로드맵 전체는 [VISION.md](../VISION.md) 참고.

---

## 복붙용 시작 프롬프트

```
나는 ~/dev/side/jeomwon 예약 SaaS 킷을 "핵심 기능이 라이브러리 수준으로 pre-built,
모듈식 조립, 조금만 바꾸면 바로 쓰는" 킷으로 디벨롭하려 한다. 북극성·현재상태·갭·로드맵은
VISION.md 에 있다. 먼저 VISION.md 와 skill/SKILL.md, skill/REFERENCE.md 를 읽어라.

이번 세션 시작 전에 함께 확정할 것 (VISION.md "열린 결정" 6개) — 먼저 나에게 물어서 정하자:
1) 에이전트: 실 LLM 추론을 실제로 물릴지 / 결정론 확정 / 하이브리드
2) 모듈 시스템: 팩 토글 / 코드 플러그인 / 둘 다
3) 모노레포 구조(기능당 packages 분리 여부)
4) 스킬 suite 입도
5) 타깃(내부/오픈소스/상용)
6) 폴더·네이밍 정리

현재 상태 (2026-07-07 세션 인계):
- 커밋 대기 변경 4개가 template/ 에 있다(아직 main, uncommitted):
  · scripts/setup/index.ts  — setup CLI 오버홀 + CONVEX_SITE_URL 빌트인 가드
  · scripts/qa-local.ts      — bun run qa 원커맨드 오케스트레이터(신규)
  · package.json             — qa→오케스트레이터, qa:run→원본 러너
  · packages/backend/convex/email/reservationActions.ts — QA 중 이메일 capture 강제
  → 이걸 먼저 리뷰하고 커밋할지 결정해줘 (main이라 브랜치부터).
- 미해결 issue C: @openai/agents@0.12(peer zod^4) ↔ 고정 zod 3.25.76 비호환 →
  "openai" 런타임 SDK import 크래시 → 실 키 챗 500. (VISION "열린 결정 1"과 직결)
- 관측: runAgentTurn은 mock/openai 둘 다 같은 결정론 엔진, openai는 import 게이트뿐(실 추론 미배선).
- QA 하니스가 business-hours-aware 아님(좁은 시간대 팩에서 QA-2 flaky) — 백로그.

가드레일:
- upstream/ 와 docs/upstream-report.md 는 수정 금지.
- 킷 버그는 생성물(app/)이 아니라 skill/·template/ 에서 고치고 이 repo에 커밋.
- 비밀키는 팩 밖, setup 에만.

첫 액션: 위 "열린 결정"을 나와 문답으로 확정 → 확정 내용을 VISION.md 에 반영 →
M0(기반 안정화: 커밋 정리 + issue C 결단) 착수 계획을 세워줘.
검증 기대: template 변경 시 bun run qa(11게이트) 또는 verify 게이트로 확인.
```

---

## M4.2 — 부트스트랩 원커맨드 (현행 검증 기준)

- 생성물 착수의 결정론 구간은 `bun skill/scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>` 한 줄로 묶여 있다(scaffold → inject → 오프라인 verify). 표준 검증은 **빈 임시 타깃에 Pension Stay 팩으로 bootstrap 하여 `VERIFY PASS`를 확인**하는 것이다(예: `mktemp -d` 아래 타깃 + `skill/EXAMPLES.md`의 Pension Stay 팩). bootstrap은 오프라인 전용이라 라이브 QA·`bun setup`을 실행하지 않고, 커밋된 비어있지 않은 `samples/pension-stay`는 타깃으로 거부한다.
- template 라이브 회귀(`cd template && bun run qa` 11게이트 + `bun run typecheck` + `bun run lint`)는 **오케스트레이터 소유 게이트**다 — 이 문서를 붙여넣는 구현 세션이 임의로 돌리지 말고 오케스트레이터의 그린 리시트로 확인한다.
- 단일 `scaffold.mjs`·`inject.mjs`·`verify.mjs` 커맨드는 재실행·부분 실행·디버깅용으로 남아 있다. 정확한 인자와 계약은 [skill/REFERENCE.md](../skill/REFERENCE.md)의 Bootstrap Contract / Verification Gates 참고.

---

## 참고 — 쇼케이스(별도 repo)
- `~/dev/side/jeomwon-showcase/06-webinar-live/` — 이번에 만든 웨비나 데모(팩 + PROMPT + 생성된 app/).
- 데모의 Convex dev 배포: `hardy-bulldog-667`(프로젝트 `ai-webinar`). RESEND 실 키 설정됨, AGENT_RUNTIME=openai(그래서 실 챗은 issue C로 죽음, QA는 mock으로 8/8 — gate 9 이전 생성물).
- 킷을 디벨롭할 땐 이 데모로 회귀 검증 가능(`cd app && bun run qa`).
