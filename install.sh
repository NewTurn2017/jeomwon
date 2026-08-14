#!/usr/bin/env bash
set -euo pipefail

readonly INSTALLER_VERSION="0.1.1"
readonly REQUIRED_BUN_VERSION="1.3.14"
readonly SKILLS_CLI_VERSION="1.5.22"
readonly JEOMWON_TAG="v${INSTALLER_VERSION}"

usage() {
	cat <<'EOF'
Jeomwon skill installer

Usage:
  install.sh [--agent claude|codex|all]

Options:
  --agent    Skill host to configure. Default: all.
  --help     Show this help.
  --version  Print the installer version.
EOF
}

fail() {
	printf 'ERROR: %s\n' "$1" >&2
	exit 2
}

agent="all"

while [ "$#" -gt 0 ]; do
	case "$1" in
		--agent)
			[ "$#" -ge 2 ] || fail "--agent requires claude | codex | all"
			agent="$2"
			shift 2
			;;
		--help|-h)
			usage
			exit 0
			;;
		--version)
			printf 'jeomwon-installer %s\n' "$INSTALLER_VERSION"
			exit 0
			;;
		*)
			fail "unknown option: $1"
			;;
	esac
done

case "$agent" in
	claude|claude-code)
		agent_targets=(universal claude-code)
		;;
	codex)
		agent_targets=(universal codex)
		;;
	all)
		agent_targets=(universal claude-code codex)
		;;
	*)
		fail "--agent must be claude | codex | all"
		;;
esac

command -v bun >/dev/null 2>&1 || fail \
	"Bun ${REQUIRED_BUN_VERSION} is required. Run: curl -fsSL https://bun.sh/install | bash -s \"bun-v${REQUIRED_BUN_VERSION}\""

actual_bun_version="$(bun --version)"
[ "$actual_bun_version" = "$REQUIRED_BUN_VERSION" ] || fail \
	"Bun ${REQUIRED_BUN_VERSION} is required, found ${actual_bun_version}. Run: curl -fsSL https://bun.sh/install | bash -s \"bun-v${REQUIRED_BUN_VERSION}\""

skill_source="https://github.com/NewTurn2017/jeomwon/tree/${JEOMWON_TAG}/skill"

printf 'Jeomwon %s → %s\n' "$JEOMWON_TAG" "${agent_targets[*]}"
DISABLE_TELEMETRY=1 bun x "skills@${SKILLS_CLI_VERSION}" add \
	"$skill_source" \
	--skill jeomwon \
	--agent "${agent_targets[@]}" \
	--global \
	--yes

printf 'INSTALL PASS jeomwon %s\n' "$JEOMWON_TAG"
