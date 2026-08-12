# 첫 5분 + 48–72시간 재현 Runbook

## 배포 상태

공개 GitHub release/tag는 아직 없습니다(`release_missing`). 따라서 공개 배포 URL을
만들거나 `main`을 불변 릴리스처럼 사용하지 않습니다. 아래 절차는 **이미 받은 로컬
저장소 checkout에서만 쓰는 개발용 경로**입니다.

워크숍은 이 checkout의 skill에 포함된 불변 로컬 계약을 사용합니다.

- archive: `skill/assets/jeomwon-template-v0.1.0.tar.gz`
- archive SHA-256: `b9774b2d4a9f2233479d5dea4ff0b51f5b4486c841a83e29a83298771835062e`
- content SHA-256: `dfceb1884d671dbdb66e2c0053278a54658e62670345d2cfd30a782ac3fde170`

릴리스 배포 전제는 BLOCKED입니다. 외부 release가 생기기 전까지 이 로컬 checkout을
고객용 릴리스로 소개하지 않습니다.

## 준비와 설치

- macOS 또는 Linux
- Bun **1.3.14** (정확히 일치)
- 최초 cache warmup 때만 패키지를 받을 인터넷 연결
- 저장소 루트에서 실행

```bash
cd "$(git rev-parse --show-toplevel)"
test "$(bun --version)" = "1.3.14"
bunx --bun skills@1.5.22 add . --skill jeomwon --agent universal claude-code --global --yes
export CLAUDE_SKILL_DIR="${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/jeomwon}"
test -f "$CLAUDE_SKILL_DIR/jeomwon-skill.json"
```

빈 cache라면 preflight가 `cache_not_ready`와 복사 가능한 복구 argv 하나를
출력합니다. 네트워크가 허용된 준비 시간에 그 `warm-cache.mjs` 명령을 한 번
실행한 뒤 다시 preflight합니다. offline verify 중에는 네트워크를 사용하지 않습니다.

## 정확한 preflight와 bootstrap

새 target 이름을 정하고, 저장소에 체크인된 실제 pack을 사용합니다.

```bash
cd "$(git rev-parse --show-toplevel)"
export CLAUDE_SKILL_DIR="${CLAUDE_SKILL_DIR:-$HOME/.claude/skills/jeomwon}"
export PACK="$PWD/lectures/소상공인-agentic-saas-실습/assets/student/salon-domain-pack.json"
export TARGET="$PWD/../jeomwon-workshop-salon"

test ! -e "$TARGET"
bun "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs" \
  "$TARGET" "Workshop Salon" "$PACK"
bun "${CLAUDE_SKILL_DIR}/scripts/bootstrap.mjs" \
  "$TARGET" "Workshop Salon" "$PACK"
test -f "$TARGET/jeomwon-project.json"
```

preflight는 target을 만들지 않고 `PREFLIGHT PASS`로 끝납니다. bootstrap은 같은
preflight 뒤 scaffold/inject와 다음 오프라인 단계를 실행합니다.

`install → typecheck → lint → test → build_email → build_app → build_web`

마지막의 정확한 관찰 표지는 다음과 같습니다.

```text
[SKIP verify_qa] QA is opt-in; set JEOMWON_QA_BASE_URL=http://localhost:3000 after Convex and the authenticated app are running, or pass --qa.
VERIFY PASS
```

## 첫 5분 실제 UI 데모

강사는 시작 전에 별도로 준비된 **실제 앱**의 고객 화면과 운영자 화면을 엽니다.
고객 두 명이 같은 슬롯을 요청하고 한 요청만 성공하는 장면을 먼저 보여 줍니다.
이 데모에는 Convex dev deployment, Google OAuth 자격 증명, 인증된 고객/운영자
계정이 필요하며 bootstrap은 이를 만들지 않습니다.

현재 제공자 권한과 운영 앱 URL이 없는 환경에서는 이 live 부분만
`BLOCKED provider_authorization_absent`로 기록합니다. 슬라이드의 생성된 로컬 제품
지도는 계속 볼 수 있지만 실제 앱 성공으로 세지 않습니다.

## 사전 생성 fallback

강사는 수업 전 같은 bootstrap 명령으로 새 target을 준비하고 경로를 지정합니다.
현장 생성이 오래 걸리거나 cache/network 준비가 실패하면 실패 target을 재사용하지
말고 이 receipt와 생성 파일을 보여 줍니다.

```bash
export JEOMWON_WORKSHOP_FALLBACK=/absolute/path/to/pre-generated-target
test -f "$JEOMWON_WORKSHOP_FALLBACK/jeomwon-project.json"
test -f "$JEOMWON_WORKSHOP_FALLBACK/domain-pack.json"
test -f "$JEOMWON_WORKSHOP_FALLBACK/packages/backend/domain.config.ts"
```

fallback도 생성 결과와 오프라인 검증 증거일 뿐 setup, 인증, live QA, 배포 성공
증거가 아닙니다.

## offline / live 경계

bootstrap은 setup, provider 자격 증명 입력, 인증된 브라우저 QA, 배포를 실행하지
않습니다. 실제 앱을 준비한 뒤에만 생성 target에서 별도로 실행합니다.

```bash
cd "$TARGET"
bun x convex login
bun setup
JEOMWON_QA_BASE_URL=http://localhost:3000 bun run qa
```

## 재시도 규칙

실패한 target 위에 다시 실행하지 않습니다. 새 빈 target 이름을 사용하고 명령과
전체 오류 출력을 보관합니다.
