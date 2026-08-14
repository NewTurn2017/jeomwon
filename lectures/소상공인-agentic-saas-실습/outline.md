# 60분 강의 아웃라인

| 슬라이드 | 시간 | 제목 | 수강생 행동 |
|---:|---:|---|---|
| 1 | 1분 | 빈 폴더에서 예약 SaaS까지 | 오늘의 종료 상태를 본다 |
| 2 | 3분 | 완성 앱 먼저 보기 | 고객·운영자 경계를 본다 |
| 3 | 1분 | 강사 소개 | 강의 범위를 확인한다 |
| 4 | 3분 | 화면보다 먼저 필요한 운영 규칙 | 예약 SaaS의 숨은 상태를 본다 |
| 5 | 3분 | Agentic이 다른 이유 | 질문→규칙→코드 연결을 이해한다 |
| 6 | 3분 | 생성 plane과 실행 plane | offline과 live를 분리한다 |
| 7 | 2분 | 오늘의 clean-room 계약 | 기존 JSON 금지와 경로 규칙을 확인한다 |
| 8 | 2분 | 빈 workspace 만들기 | 실제 폴더를 만든다 |
| 9 | 3분 | Claude Code 설치와 로그인 | 공식 curl 설치 후 인증한다 |
| 10 | 3분 | Bun과 Jeomwon 한 줄 설치 | 정확한 버전과 INSTALL PASS를 확인한다 |
| 11 | 3분 | Claude를 열고 시작 프롬프트 붙이기 | 에이전트 인터뷰를 시작한다 |
| 12 | 8분 | Interview Order 10개 묶음 | 운영 사실을 답한다 |
| 13 | 7분 | 확정 뒤 JSON·bootstrap | schema v1과 세 성공 표지를 확인한다 |
| 14 | 3분 | Convex 무료 서비스 | 무료 dev backend의 역할과 한도를 이해한다 |
| 15 | 5분 | Convex 로그인과 Google OAuth | 사람이 만드는 계정·client를 준비한다 |
| 16 | 4분 | bun setup의 pause/resume | callback URI를 등록하고 env를 연결한다 |
| 17 | 3분 | live QA와 두 프로필 smoke | DB·충돌·권한·지속성을 확인한다 |
| 18 | 2분 | Codex로 바꾸는 법 | 같은 스킬과 프롬프트를 재사용한다 |
| 19 | 2분 | 구독과 예약 결제의 경계 | Polar 비범위를 확인한다 |
| 20 | 2분 | 혼자 다시 만드는 체크리스트 | 전체 순서를 회상한다 |

합계: 60분

## 강의 중 실제 명령

```bash
curl -fsSL https://claude.ai/install.sh | bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
curl -fsSL https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.1/install.sh | bash -s -- --agent all
mkdir -p "$HOME/Desktop/jeomwon-zero-test"
cd "$HOME/Desktop/jeomwon-zero-test"
claude
```

생성 뒤:

```bash
cd "$HOME/Desktop/jeomwon-zero-test/generated/<domainKey>"
bun x convex login
bun setup --lang ko
bunx playwright install chromium
bun run qa
bun dev
```
