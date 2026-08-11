# 48–72시간 재현 Runbook

## 완료 기준

- 새 빈 target에서 bootstrap을 실행한다.
- 마지막 출력에서 install, typecheck, lint, build 통과를 확인한다.
- `OFFLINE VERIFIED`와 `QA SKIP`을 캡처한다.
- 사용한 commit, domain pack, 명령, 출력을 함께 보관한다.

이 기준은 setup, 인증된 live QA, Vercel 배포 성공을 의미하지 않습니다.

## 준비

- macOS 또는 Linux
- Bun 1.3.14 (정확히 일치해야 함)
- 최초 cache warmup 때만 패키지를 받을 인터넷 연결
- 최소 20분. 의존성 캐시가 비어 있으면 더 걸릴 수 있음

```bash
git clone https://github.com/NewTurn2017/jeomwon.git
cd jeomwon
bunx --bun skills@1.5.22 add . --skill jeomwon --agent universal claude-code --global
```

빈 cache라면 preflight가 `cache_not_ready`와 복사 가능한 복구 argv 하나만 출력합니다. 그 `warm-cache.mjs` 명령을 네트워크가 허용된 때 실행하고 다시 확인합니다. offline verify는 네트워크를 사용하지 않습니다.

## 실행

저장소 루트에서 실행합니다. target은 존재하지 않거나 비어 있어야 합니다.

```bash
bun "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs" \
  ../my-salon-saas \
  "My Salon SaaS" \
  /ABSOLUTE/PATH/salon-domain-pack.json

bun "${CLAUDE_SKILL_DIR}/scripts/bootstrap.mjs" \
  ../my-salon-saas \
  "My Salon SaaS" \
  /ABSOLUTE/PATH/salon-domain-pack.json
```

첫 명령은 `PREFLIGHT PASS`를 출력하며 target을 생성하지 않습니다. 두 번째 명령도 같은 preflight를 먼저 실행한 뒤에만 scaffold를 시작합니다.

다른 업종은 `skill/EXAMPLES.md`의 검증된 예제를 복사한 뒤 인터뷰 결과로
값을 수정합니다. 지원 필드 자체를 추가하지 않습니다.

## 결과 확인

```bash
test -f ../my-salon-saas/packages/backend/domain.config.ts
cd ../my-salon-saas
bun run typecheck
bun run lint
bun run build
```

## 다음 단계

다음 단계에는 Convex 계정과 Google OAuth 자격 증명이 필요합니다.

```bash
bun x convex login
bun setup
bun run qa
```

그 뒤 `apps/web`, `apps/app`을 각각 Vercel 프로젝트에 연결하고 별도
Convex deployment의 URL, deploy key, 환경 변수를 확인합니다.

## 재시도 규칙

실패한 target 위에 다시 실행하지 않습니다. 새 빈 target 이름을 사용하고,
명령과 전체 오류 출력을 보관합니다.
