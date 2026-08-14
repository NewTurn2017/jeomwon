# 강사용 진행 스크립트

## 1. 빈 폴더에서 예약 SaaS까지

오늘은 준비된 프로젝트를 여는 수업이 아닙니다. 빈 폴더를 만들고 Claude Code를 설치한 뒤, 가게 운영을 질문으로 구조화해 실제 앱과 DB까지 연결합니다. 기존 JSON은 사용하지 않습니다.

## 2. 완성 앱 먼저 보기

고객은 예약하고 운영자는 상태를 봅니다. 같은 시간에 두 고객이 접근하면 한 명만 성공해야 합니다. 이 장면을 보여 준 뒤 “이 규칙을 어떻게 질문과 코드로 만들 것인가”로 전환합니다. 라이브가 막히면 receipt와 검증 artifact만 보여 줍니다.

## 3. 강사 소개

오늘 강사의 역할은 코드를 대신 타이핑하는 사람이 아니라 운영자의 말을 데이터 구조와 검증 가능한 시스템으로 번역하는 과정을 안내하는 것입니다.

## 4. 화면보다 먼저 필요한 운영 규칙

예약은 폼이 아니라 상태 머신입니다. 자원, 시간, hold, collision, cancellation, ownership이 서버 mutation 안에서 함께 지켜져야 합니다.

## 5. Agentic이 다른 이유

일반 SaaS는 사용자가 정해진 옵션을 고릅니다. 오늘은 에이전트가 운영자에게 질문하고, 답을 schema v1 pack으로 만들고, generator가 코드와 검증물로 바꿉니다.

## 6. 생성 plane과 실행 plane

offline plane은 pack, scaffold, inject, typecheck, test, build까지입니다. live plane은 Convex, Google OAuth, setup, QA입니다. `[SKIP verify_qa]`는 이 두 plane을 정직하게 나눈 표지입니다.

## 7. 오늘의 clean-room 계약

기존 sample과 salon JSON을 보지 않습니다. workspace에는 새 pack이 생기고 target은 별도 absent child directory입니다. `확정` 전에는 둘 다 생성하지 않습니다.

## 8. 빈 workspace 만들기

화면을 같이 보며 `mkdir`, `cd`, `find`를 실행합니다. `find`가 아무것도 출력하지 않는 상태가 출발점입니다. target 폴더를 미리 만들지 않습니다.

## 9. Claude Code 설치와 로그인

Anthropic 공식 curl installer를 사용합니다. 새 터미널에서 `claude`를 실행해 브라우저 로그인을 마친 뒤 한 번 종료합니다. 인증은 에이전트가 대신할 수 없는 사람의 단계입니다.

## 10. Bun과 Jeomwon 한 줄 설치

Bun은 정확히 1.3.14입니다. Jeomwon installer는 v0.1.1을 Claude와 Codex 공용 canonical skill 경로에 설치합니다. `INSTALL PASS`가 없으면 다음 단계로 가지 않습니다.

## 11. Claude를 열고 시작 프롬프트 붙이기

PROMPT.md는 스킬의 질문 순서, 추측 금지, `확정` gate, pack과 target 경로를 동시에 고정합니다. launcher는 프롬프트를 복사하고 Claude를 열 뿐 JSON을 전달하지 않습니다.

## 12. Interview Order 10개 묶음

가게 identity, 자원, 서비스, 영업시간, blackout, 정책, 관리자 화면, 기능 토글, 이메일·구독, 고객 문구를 순서대로 답합니다. 서비스는 슬롯 단위와 총 소요시간을 반드시 구분합니다. 모든 요일과 파생 예약번호를 다시 읽게 합니다.

## 13. 확정 뒤 JSON·bootstrap

최종 readback이 맞을 때만 `확정`합니다. 에이전트는 schemaVersion 1 pack을 workspace에 쓰고, absent target에 preflight와 bootstrap을 실행합니다. `PREFLIGHT PASS`, `[SKIP verify_qa]`, `VERIFY PASS` 세 표지를 직접 읽습니다.

## 14. Convex 무료 서비스

Convex는 backend, database, Auth, 실시간 query를 함께 제공합니다. Free 플랜은 개인 프로젝트와 prototype용 월 $0이며 이 강의의 dev deployment에 충분합니다. 한도는 팀 단위이고 운영 전 현재 가격표를 다시 확인해야 합니다.

## 15. Convex 로그인과 Google OAuth

Convex 계정 로그인은 브라우저에서 사람이 완료합니다. Google Cloud에서는 project, consent screen, Web application client를 만듭니다. origin은 `http://localhost:3000`, redirect URI는 아직 추측하지 않습니다.

## 16. bun setup의 pause/resume

setup이 Convex dev deployment를 만들고 정확한 callback URI를 출력하면 멈춥니다. Google Console에 그대로 등록하고 돌아와 Enter를 누릅니다. client ID, secret, 운영자 이메일만 입력합니다. 첫 성공에서는 mock/capture/off를 유지합니다.

## 17. live QA와 두 프로필 smoke

`bun run qa`는 dev 데이터 경계 안에서 12게이트를 실행합니다. 실제 Google 운영자 성공은 별도입니다. 고객 A 예약, 고객 B 동일 슬롯 거절, allowlist 운영자 접근, 비허용 계정 거절, 새로고침 후 지속성을 확인합니다.

## 18. Codex로 바꾸는 법

Codex 공식 curl installer로 설치하고 같은 빈 workspace에서 `codex`를 실행합니다. Jeomwon installer는 canonical `.agents/skills`와 Claude link를 함께 준비하므로 프롬프트와 생성 절차는 같습니다.

## 19. 구독과 예약 결제의 경계

Polar는 Jeomwon 계정 구독입니다. 고객의 커트 예약 결제와 환불은 생성 뒤 별도 subsystem입니다. 오늘의 성공을 결제 완료로 과장하지 않습니다.

## 20. 혼자 다시 만드는 체크리스트

빈 폴더, host CLI, Bun, skill, interview, 확정, bootstrap, Convex, Google, setup, QA를 순서대로 말하게 합니다. 48–72시간 안에 다른 업종으로 다시 실행해야 학습이 끝납니다.
