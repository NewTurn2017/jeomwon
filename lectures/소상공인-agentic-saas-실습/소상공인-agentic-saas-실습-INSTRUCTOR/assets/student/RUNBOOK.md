# Jeomwon 완전 처음부터 실습 매뉴얼

이 실습은 기존 JSON, sample, 생성 target을 사용하지 않습니다.

```text
빈 폴더
→ Claude Code
→ Jeomwon 인터뷰
→ 새 domain-pack.json
→ 확정
→ bootstrap
→ Convex dev
→ Google OAuth
→ bun setup
→ QA와 수동 smoke
```

오늘의 기본 host는 Claude Code입니다. Codex도 같은 스킬과 프롬프트를 사용할 수 있습니다.

## 준비물

- macOS 13+ 또는 Linux/WSL2
- 인터넷 연결
- Anthropic 계정 또는 ChatGPT 계정
- Convex 계정
- Google 계정과 Google Cloud Console 접근
- 운영자로 사용할 실제 Google 이메일

처음에는 OpenAI API, Resend, Polar를 연결하지 않습니다.

## Claude Code 설치와 로그인

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

새 터미널을 열고 실행합니다.

```bash
claude
```

브라우저 로그인 또는 표시된 인증 흐름을 완료한 뒤 `exit`로 나옵니다.

## Codex를 사용할 경우

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

```bash
codex
```

`Sign in with ChatGPT`를 선택합니다.

## Bun 1.3.14 설치

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
```

새 터미널에서 확인합니다.

```bash
bun --version
```

출력은 정확히 `1.3.14`여야 합니다.

## Jeomwon 스킬 한 줄 설치

Claude Code와 Codex 둘 다 사용할 수 있게 설치합니다.

```bash
curl -fsSL https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.1/install.sh | bash -s -- --agent all
```

성공 표지:

```text
INSTALL PASS jeomwon v0.1.1
```

Claude만 쓰려면 `--agent claude`, Codex만 쓰려면 `--agent codex`를 사용할 수 있습니다.

## 빈 workspace 만들기

```bash
mkdir -p "$HOME/Desktop/jeomwon-zero-test"
cd "$HOME/Desktop/jeomwon-zero-test"
```

빈 폴더인지 확인합니다.

```bash
find . -mindepth 1 -maxdepth 1 -print
```

아무것도 출력되지 않아야 합니다.

## 오프라인 cache 준비

bootstrap은 preflight 이후 네트워크를 사용하지 않습니다. 인터넷을 사용할 수 있을 때 미리 cache를 준비합니다.

```bash
bun "${JEOMWON_SKILL_DIR:-${CLAUDE_SKILL_DIR:-$HOME/.agents/skills/jeomwon}}/scripts/warm-cache.mjs" --lang ko
```

## Claude Code 시작

```bash
claude
```

`PROMPT.md`의 text 블록 전체를 붙여 넣습니다.

Codex를 선택했다면 같은 폴더에서 `codex`를 실행하고 같은 프롬프트를 붙여 넣습니다.

## 인터뷰에서 확인할 10개 묶음

1. 가게 이름, 시간대, 언어, domainKey
2. 디자이너·좌석·객실 같은 예약 자원
3. 서비스별 가격, 슬롯 단위, 총 소요시간
4. 월요일부터 일요일까지 영업시간
5. 임시 휴무와 blackout
6. 취소 가능 시간과 hold 시간
7. 관리자 화면 형태
8. waitlist, 운영자 CRUD, no-show
9. 이메일과 운영 알림 주소, Polar 계정 구독
10. 고객에게 보일 모든 안내 문구

스킬이 파생값을 모두 읽어 준 뒤에만 답합니다.

```text
확정
```

## workspace와 target 분리

정상 구조:

```text
jeomwon-zero-test/
├── domain-pack.json
└── generated/
    └── <domainKey>/
```

`domain-pack.json`은 workspace에 있습니다. `generated/<domainKey>`는 bootstrap 전에는 존재하지 않아야 합니다.

## 생성 성공 표지

```text
PREFLIGHT PASS
[SKIP verify_qa]
VERIFY PASS
```

이 시점까지는 Convex 계정, Google OAuth, 실제 DB가 연결되지 않았습니다.

## Convex는 무엇인가

Convex는 이 프로젝트의 실시간 backend와 database입니다. Free 플랜은 개인 프로젝트와 prototype을 위한 월 $0 플랜이며 Auth, 파일 저장, 검색, cron, Node.js action, dashboard와 preview deployment를 포함합니다.

이 강의에서는 유료 업그레이드 없이 개발용 deployment 하나를 사용합니다. Free 한도는 팀 단위이므로 실서비스 전에는 현재 가격표와 한도를 다시 확인하세요.

## Convex 로그인

생성 target으로 이동합니다.

```bash
cd "$HOME/Desktop/jeomwon-zero-test/generated/<domainKey>"
bunx convex login
```

브라우저에서 Convex 계정 로그인을 완료합니다.

## Google OAuth 준비

Google Cloud Console에서:

1. 프로젝트를 생성합니다.
2. OAuth consent screen을 설정합니다.
3. OAuth Client를 `Web application`으로 만듭니다.
4. Authorized JavaScript origin에 `http://localhost:3000`을 등록합니다.
5. redirect URI는 setup이 출력할 때까지 기다립니다.

## 실제 DB setup

```bash
bun setup --lang ko
```

setup이 Convex dev deployment를 생성한 뒤 정확한 redirect URI를 출력하고 멈춥니다.

```text
https://<deployment>.convex.site/api/auth/callback/google
```

이 값을 Google Cloud의 Authorized redirect URI에 그대로 등록하고 저장한 다음 터미널로 돌아와 Enter를 누릅니다.

이어서 입력합니다.

- Google OAuth client ID
- Google OAuth client secret
- allowlist에 넣을 운영자 Google 이메일

첫 실행에서는 optional provider를 건너뜁니다.

```text
Agent runtime = mock
Reservation email = capture
Polar = off
```

## 실제 Convex QA

QA용 Chromium을 한 번 설치합니다.

```bash
bunx playwright install chromium
```

개발 deployment에서 실행합니다.

```bash
bun run qa
```

QA는 현재 domain의 개발 데이터를 초기화할 수 있으며 production deployment에서는 실행하면 안 됩니다.

## 실제 사용자 smoke

```bash
bun dev
```

접속:

```text
고객·운영자 앱  http://localhost:3000
공개 웹          http://localhost:3001
운영자 화면      http://localhost:3000/admin
```

확인:

1. 고객 A가 예약합니다.
2. 별도 브라우저 프로필의 고객 B가 같은 슬롯을 시도해 충돌 차단을 확인합니다.
3. allowlist Google 운영자가 `/admin`에 로그인합니다.
4. allowlist 밖 Google 계정이 거절되는지 확인합니다.
5. 새로고침 뒤에도 Convex 데이터가 남는지 확인합니다.

## launcher는 무엇을 하는가

`RUN-WORKSHOP-Mac.command`는 수동 순서를 대체하지 않는 편의 도구입니다.

```text
빈 workspace 확인
→ skill 설치
→ cache 준비
→ 프롬프트 클립보드 복사
→ Claude 또는 Codex 실행
```

기존 JSON을 전달하거나 bootstrap을 선실행하지 않습니다.

Claude:

```bash
./RUN-WORKSHOP-Mac.command claude
```

Codex:

```bash
./RUN-WORKSHOP-Mac.command codex
```
