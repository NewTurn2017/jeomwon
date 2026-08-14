# 강사용 진행 스크립트

## 1. 빈 폴더에서 예약 서비스까지

오늘은 빈 폴더에서 시작해 가게 운영 방식을 차근차근 이야기하고, 그 답을 바탕으로 나만의 예약 서비스를 만드는 과정을 함께 따라갑니다. 기술 용어보다 실제 가게에서 쓰는 말로 진행합니다.

## 2. 완성 앱 먼저 보기

먼저 완성된 예약 서비스를 보여 줍니다. 고객은 원하는 시간을 예약하고, 같은 시간의 중복 예약은 자동으로 막힙니다. 사장님은 관리 화면에서 예약 현황을 확인합니다. 이 단계에서는 기술 설명보다 실제 가게에서 어떻게 쓰이는지에 집중합니다.

## 3. 화면보다 먼저 필요한 운영 규칙

예약은 폼이 아니라 상태 머신입니다. 자원, 시간, hold, collision, cancellation, ownership이 서버 mutation 안에서 함께 지켜져야 합니다.

## 4. Agentic이 다른 이유

일반 SaaS는 사용자가 정해진 옵션을 고릅니다. 오늘은 에이전트가 운영자에게 질문하고, 답을 schema v1 pack으로 만들고, generator가 코드와 검증물로 바꿉니다.

## 5. 생성 plane과 실행 plane

offline plane은 pack, scaffold, inject, typecheck, test, build까지입니다. live plane은 Convex, Google OAuth, setup, QA입니다. `[SKIP verify_qa]`는 이 두 plane을 정직하게 나눈 표지입니다.

## 6. 오늘의 clean-room 계약

기존 sample과 salon JSON을 보지 않습니다. workspace에는 새 pack이 생기고 target은 별도 absent child directory입니다. `확정` 전에는 둘 다 생성하지 않습니다.

## 7. 빈 workspace 만들기

화면을 같이 보며 `mkdir`, `cd`, `find`를 실행합니다. `find`가 아무것도 출력하지 않는 상태가 출발점입니다. target 폴더를 미리 만들지 않습니다.

## 8. Claude Code 설치와 로그인

Anthropic 공식 curl installer를 사용합니다. 새 터미널에서 `claude`를 실행해 브라우저 로그인을 마친 뒤 한 번 종료합니다. 인증은 에이전트가 대신할 수 없는 사람의 단계입니다.

## 9. Bun과 Jeomwon 한 줄 설치

Bun은 정확히 1.3.14입니다. Jeomwon installer는 v0.1.3을 Claude와 Codex 공용 canonical skill 경로에 설치합니다. `INSTALL PASS`가 없으면 다음 단계로 가지 않습니다.

## 10. Claude를 열고 `/jeomwon` 입력하기

별도의 `warm-cache` 명령이나 긴 시작 프롬프트는 사용하지 않습니다. 빈 작업 폴더에서 `claude`를 실행한 뒤 `/jeomwon`만 입력합니다. 설치된 Jeomwon 스킬이 가게 운영 방식을 순서대로 질문하고, 최종 내용을 다시 읽어 준 뒤 `확정`을 기다립니다.

## 11. Interview Order 10개 묶음

가게 identity, 자원, 서비스, 영업시간, blackout, 정책, 관리자 화면, 기능 토글, 이메일·구독, 고객 문구를 순서대로 답합니다. 서비스는 슬롯 단위와 총 소요시간을 반드시 구분합니다. 모든 요일과 파생 예약번호를 다시 읽게 합니다.

## 12. 확정 뒤 JSON·bootstrap

최종 readback이 맞을 때만 `확정`합니다. 에이전트는 schemaVersion 1 pack을 workspace에 쓰고, absent target에 preflight와 bootstrap을 실행합니다. `PREFLIGHT PASS`, `[SKIP verify_qa]`, `VERIFY PASS` 세 표지를 직접 읽습니다.

## 13. Convex 무료 서비스

Convex는 backend, database, Auth, 실시간 query를 함께 제공합니다. Free 플랜은 개인 프로젝트와 prototype용 월 $0이며 이 강의의 dev deployment에 충분합니다. 한도는 팀 단위이고 운영 전 현재 가격표를 다시 확인해야 합니다.

## 14. Convex 로그인과 Google OAuth

Convex 계정 로그인은 브라우저에서 사람이 완료합니다. Google Cloud에서는 project, consent screen, Web application client를 만듭니다. origin은 `http://localhost:3000`, redirect URI는 아직 추측하지 않습니다.

## 15. bun setup의 pause/resume

setup이 Convex dev deployment를 만들고 정확한 callback URI를 출력하면 멈춥니다. Google Console에 그대로 등록하고 돌아와 Enter를 누릅니다. client ID, secret, 운영자 이메일만 입력합니다. 첫 성공에서는 mock/capture/off를 유지합니다.

## 16. live QA와 두 프로필 smoke

`bun run qa`는 dev 데이터 경계 안에서 12게이트를 실행합니다. 실제 Google 운영자 성공은 별도입니다. 고객 A 예약, 고객 B 동일 슬롯 거절, allowlist 운영자 접근, 비허용 계정 거절, 새로고침 후 지속성을 확인합니다.

## 17. Codex로 바꾸는 법

Codex 공식 curl installer로 설치하고 같은 빈 workspace에서 `codex`를 실행합니다. Jeomwon installer는 canonical `.agents/skills`와 Claude link를 함께 준비하므로 프롬프트와 생성 절차는 같습니다.

## 18. 구독과 예약 결제의 경계

Polar는 Jeomwon 계정 구독입니다. 고객의 커트 예약 결제와 환불은 생성 뒤 별도 subsystem입니다. 오늘의 성공을 결제 완료로 과장하지 않습니다.

## 19. 혼자 다시 만드는 체크리스트

빈 폴더, host CLI, Bun, skill, interview, 확정, bootstrap, Convex, Google, setup, QA를 순서대로 말하게 합니다. 48–72시간 안에 다른 업종으로 다시 실행해야 학습이 끝납니다.
