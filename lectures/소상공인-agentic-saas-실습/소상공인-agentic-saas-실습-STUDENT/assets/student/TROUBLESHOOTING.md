# Jeomwon clean-room 문제 해결

## `bun: command not found` 또는 버전 불일치

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
```

새 터미널을 열고 확인합니다.

```bash
bun --version
```

정확히 `1.3.14`여야 합니다.

## `claude: command not found`

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

새 터미널에서 `claude`를 실행해 로그인합니다.

## `codex: command not found`

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

새 터미널에서 `codex`를 실행하고 `Sign in with ChatGPT`를 선택합니다.

## `INSTALL PASS`가 나오지 않음

release asset을 내려받지 못했거나 Bun/skills 설치가 실패한 것입니다. 빈 shell이 성공처럼 보이지 않도록 launcher는 installer를 임시 파일로 먼저 내려받습니다.

수동 재시도:

```bash
curl -fsSL --proto '=https' --tlsv1.2 \
  -o /tmp/jeomwon-install.sh \
  https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.1/install.sh
bash /tmp/jeomwon-install.sh --agent all
```

## `cache_not_ready`

네트워크를 사용할 수 있을 때 recovery argv를 그대로 실행합니다.

```bash
bun "${JEOMWON_SKILL_DIR:-${CLAUDE_SKILL_DIR:-$HOME/.agents/skills/jeomwon}}/scripts/warm-cache.mjs" --lang ko
```

그다음 preflight를 다시 실행합니다. bootstrap 도중 숨은 네트워크 사용으로 우회하지 않습니다.

## `target_not_empty`

`domain-pack.json`은 workspace에 두고 생성 target은 존재하지 않는 하위 폴더여야 합니다.

```text
jeomwon-zero-test/
├── domain-pack.json
└── generated/
    └── <domainKey>/   ← bootstrap 전에는 없어야 함
```

생성 target에 pack을 먼저 넣지 마세요.

## 인터뷰가 질문을 건너뜀

`PROMPT.md`를 다시 붙여 넣고 다음을 확인합니다.

- Interview Order 순서
- 모르는 값 추측 금지
- 일주일 전체 영업시간
- 서비스별 슬롯 단위와 총 소요시간
- `확정` 전 JSON 저장 금지

## `PREFLIGHT PASS` 뒤 bootstrap 실패

출력된 recovery argv 하나만 실행합니다. target이 publication 전에 실패했다면 새 target을 사용하고, 이미 생성된 target의 verify 단계만 실패했다면 출력된 `verify.mjs <existing-target>` recovery를 사용합니다.

## Google Redirect URI 오류

`bun setup --lang ko`가 출력한 값을 추측하거나 수정하지 말고 Google Cloud의 Authorized redirect URI에 그대로 등록합니다.

Authorized JavaScript origin:

```text
http://localhost:3000
```

## `bun run qa` 경고

- QA는 `dev:` Convex deployment만 허용합니다.
- 현재 domain의 예약·채팅 데이터를 초기화할 수 있습니다.
- Google 운영자 성공 로그인은 별도 수동 smoke입니다.
