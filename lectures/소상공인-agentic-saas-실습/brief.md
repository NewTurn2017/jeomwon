# 강의 브리프

## 제목

빈 폴더에서 시작하는 소상공인 Agentic SaaS

## 한 문장 약속

기존 JSON과 sample 없이 Claude Code가 가게 운영자를 인터뷰해 `domain-pack.json`을 새로 만들고, Jeomwon이 예약 SaaS를 생성·검증한 뒤 무료 Convex dev DB와 Google 운영자 로그인을 연결하는 전 과정을 60분 안에 재현한다.

## 수강생

- 터미널과 코딩 에이전트를 처음 써 보는 소상공인·기획자·초급 개발자
- 완성된 앱보다 “내 업종을 질문으로 구조화해 다시 만들 수 있는 절차”가 필요한 사람
- Claude Code를 기본으로 사용하되 Codex로도 같은 스킬을 실행하고 싶은 사람

## 학습 목표

수강생은 슬라이드와 `RUNBOOK.md`만 보고 다음을 수행할 수 있어야 한다.

1. 빈 workspace를 만든다.
2. Claude Code 또는 Codex CLI와 Bun 1.3.14를 설치한다.
3. curl 한 줄로 Jeomwon v0.1.1 스킬을 설치한다.
4. 기존 JSON 없이 Interview Order를 끝까지 진행한다.
5. 파생값을 확인하고 `확정`한 뒤 schema v1 pack을 쓴다.
6. pack과 absent target을 분리해 preflight·bootstrap을 통과한다.
7. 무료 Convex dev deployment와 Google OAuth를 `bun setup`으로 연결한다.
8. `bun run qa`와 두 브라우저 프로필로 충돌·권한·지속성을 확인한다.

## 핵심 경계

- workspace의 `domain-pack.json`과 생성 target은 서로 다른 경로다.
- `확정` 전에는 JSON과 target을 만들지 않는다.
- `VERIFY PASS`는 오프라인 생성 검증이며 DB 연결 성공이 아니다.
- Convex 계정과 Google OAuth client 생성은 사람이 한다.
- `bun setup`은 deployment·env·JWT·callback handoff를 자동화한다.
- `bun run qa`는 dev 데이터 경계를 가진 자동 검증이며 실제 Google 운영자 성공 로그인은 별도 smoke다.
- Polar는 Jeomwon 계정 구독이며 예약 결제가 아니다.

## 진행 원칙

- 오늘의 기본 host: Claude Code
- Codex: 동일 installer·prompt·skill root를 사용하는 호환 lane
- 기존 `salon-domain-pack.json`: 사용·배포하지 않음
- launcher: JSON을 주입하는 생성 도구가 아니라 빈 폴더·설치·cache·host 실행 보조
- 첫 성공에서는 OpenAI·Resend·Polar를 끄고 mock/capture/off로 시작

## 60분 배분

- 결과와 핵심 개념: 12분
- 빈 환경·CLI·skill 준비: 12분
- 인터뷰·JSON 승인·bootstrap: 16분
- Convex·Google OAuth·setup: 11분
- QA·Codex 호환·경계·복습: 9분

## 검증 가능한 성공 표지

```text
INSTALL PASS jeomwon v0.1.1
PREFLIGHT PASS
[SKIP verify_qa]
VERIFY PASS
```

이후 `bun setup --lang ko`, `bun run qa`, 수동 Google 운영자 smoke까지 별도로 확인한다.
