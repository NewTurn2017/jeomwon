# START HERE — jeomwon 킷 디벨롭 킥오프

> 다음 Claude Code 세션을 **`~/dev/side/jeomwon`** 에서 시작할 때 아래 블록을 그대로 붙여넣어라.
> 목표·현재상태·로드맵 전체는 [VISION.md](./VISION.md) 참고.

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
검증 기대: template 변경 시 bun run qa(9게이트) 또는 verify 게이트로 확인.
```

---

## 참고 — 쇼케이스(별도 repo)
- `~/dev/side/jeomwon-showcase/06-webinar-live/` — 이번에 만든 웨비나 데모(팩 + PROMPT + 생성된 app/).
- 데모의 Convex dev 배포: `hardy-bulldog-667`(프로젝트 `ai-webinar`). RESEND 실 키 설정됨, AGENT_RUNTIME=openai(그래서 실 챗은 issue C로 죽음, QA는 mock으로 8/8 — gate 9 이전 생성물).
- 킷을 디벨롭할 땐 이 데모로 회귀 검증 가능(`cd app && bun run qa`).
