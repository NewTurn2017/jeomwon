#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd -P)"
AGENT="${1:-claude}"
WORKSPACE="${JEOMWON_WORKSPACE:-$HOME/Desktop/jeomwon-zero-test}"
INSTALLER_URL="${JEOMWON_INSTALLER_URL:-https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.3/install.sh}"
SKILL_ROOT="${JEOMWON_SKILL_DIR:-$HOME/.agents/skills/jeomwon}"

case "$AGENT" in
	claude|codex) ;;
	*)
		printf '사용법: %s [claude|codex]\n' "$0" >&2
		exit 2
		;;
esac

if [ -d "$WORKSPACE" ] && [ -n "$(find "$WORKSPACE" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
	printf 'ERROR: workspace가 비어 있지 않습니다: %s\n' "$WORKSPACE" >&2
	printf '새 경로를 쓰려면 JEOMWON_WORKSPACE 환경변수를 지정하세요.\n' >&2
	exit 1
fi
mkdir -p "$WORKSPACE"

if ! command -v bun >/dev/null 2>&1 || [ "$(bun --version 2>/dev/null || true)" != "1.3.14" ]; then
	printf '먼저 Bun 1.3.14를 설치하세요:\n'
	printf 'curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"\n'
	exit 1
fi

if ! command -v "$AGENT" >/dev/null 2>&1; then
	if [ "$AGENT" = "claude" ]; then
		printf '먼저 Claude Code를 설치하세요:\n'
		printf 'curl -fsSL https://claude.ai/install.sh | bash\n'
	else
		printf '먼저 Codex CLI를 설치하세요:\n'
		printf 'curl -fsSL https://chatgpt.com/codex/install.sh | sh\n'
	fi
	exit 1
fi

installer="$(mktemp "${TMPDIR:-/tmp}/jeomwon-install.XXXXXX")"
trap 'rm -f "$installer"' EXIT HUP INT TERM
curl -fsSL --proto '=https' --tlsv1.2 -o "$installer" "$INSTALLER_URL"
bash "$installer" --agent all
bun "$SKILL_ROOT/scripts/warm-cache.mjs" --lang ko

if command -v pbcopy >/dev/null 2>&1; then
	pbcopy < "$HERE/PROMPT.md"
	printf '시작 프롬프트를 클립보드에 복사했습니다.\n'
fi

printf '\nCLEAN ROOM READY\n'
printf 'workspace: %s\n' "$WORKSPACE"
printf 'agent: %s\n' "$AGENT"
printf 'Claude/Codex가 열리면 PROMPT.md의 text 블록을 붙여 넣으세요.\n\n'

cd "$WORKSPACE"
exec "$AGENT"
