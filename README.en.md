[한국어](README.md) · [English](README.en.md)

# jeomwon (점원)

[![CI](https://github.com/NewTurn2017/jeomwon/actions/workflows/ci.yml/badge.svg)](https://github.com/NewTurn2017/jeomwon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Jeomwon** — Korean for "shop clerk" — is an agent kit that turns **one domain interview into a working reservation SaaS** for small business owners: marketing page, Google sign-in, customer-facing CS AI chat, admin dashboard, and lifecycle emails, on Convex + Next.js 16 + bun.

Official site: **[jeomwon.codewithgenie.com](https://jeomwon.codewithgenie.com)**

An AI clerk guards the front desk: customers book, reschedule, and cancel through chat; invariants (slot conflicts, holds, cancel windows) are enforced inside Convex mutations; owners watch everything land in a realtime dashboard.

| Customer — KakaoTalk-style booking chat | Owner — operator dashboard |
|---|---|
| ![Customer booking chat widget](docs/assets/customer-chat.png) | ![Operator dashboard](docs/assets/operator-dashboard.png) |

The generated UI is production-ready out of the box: a light, domain-aware landing page (services, hours, and policies rendered from `domain.config`), a KakaoTalk-style chat widget (side-aligned bubbles, Korean status labels, IME-safe input — no raw enums or API errors shown to customers), and a Korean-first operator dashboard ordered by action: escalation queue with approve/keep buttons, then reservations, then the agent activity timeline.

## Why jeomwon

- **Cal.com is a booking *app*** — one calendar product you configure. Jeomwon **generates the reservation SaaS itself** from a domain interview (a hair salon, a PC café, and a pension each come out as a different app).
- **v0 and boilerplates give you *screens*** — jeomwon ships the screens plus the **domain logic enforced inside Convex mutations**: slot conflicts, hold TTLs, cancel windows.
- **It ships as a Claude Code and Codex skill** — a coding agent interviews you, scaffolds the project, and runs offline verification. QA contract v2's 12 live gates run separately after setup.

## Quick start

**Prerequisites**: exactly [bun](https://bun.sh) **1.3.14** · a free [Convex](https://convex.dev) account with `bunx convex login` completed before setup · a **required Google OAuth Web application client** for Google sign-in · optional [Resend](https://resend.com) / [OpenAI](https://platform.openai.com) keys (without them, email capture and the `mock` agent runtime remain available)

### From an empty folder with Claude Code (recommended)

```bash
curl -fsSL https://claude.ai/install.sh | bash
curl -fsSL https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.5/install.sh | bash -s -- --agent all
mkdir -p "$HOME/Desktop/jeomwon-zero-test" && cd "$HOME/Desktop/jeomwon-zero-test"
claude
```

Describe the domain without reusing an example JSON. The skill follows its Interview Order and waits for `APPROVE` before writing a fresh workspace `domain-pack.json`. The generated target must be a separate absent child directory. Bootstrap is offline-only — it never runs live QA or `bun setup`.

When bootstrap finishes it prints the generated path and the next steps to run yourself: `bunx convex login`, `bun setup` (Google OAuth values and an operator allowlist email), then `bun run qa` (QA contract v2, 12 live gates).

Bootstrap runs preflight before touching the target. To check readiness separately, run `bun "${JEOMWON_SKILL_DIR:-${CLAUDE_SKILL_DIR:-$HOME/.agents/skills/jeomwon}}/scripts/preflight.mjs" <target-dir> <project-name> <domain-pack.json>`. The installed command resolves the agent-neutral canonical directory, Claude Code link, manual symlinks, `JEOMWON_SKILL_DIR`, and the compatibility `CLAUDE_SKILL_DIR` consistently, then verifies the checked-in immutable archive and both SHA-256 contracts. On `cache_not_ready`, copy the single printed `warm-cache.mjs` recovery argv and run it only when network access is allowed.

For Codex, install the official CLI and use the same interview prompt in the same empty workspace:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex
```

### Without Claude Code

The generated project (and `template/` itself) ships a self-contained setup wizard:

```bash
cd template
bun install --frozen-lockfile
bunx convex login
bun setup        # Convex/JWT, Google OAuth, operator allowlist, then Resend/OpenAI/Polar
bun dev          # web + app + backend, in parallel
```

Setup schema 2 validates the already-authenticated Convex CLI, creates or reuses a dev deployment, pauses for the user to register its exact redirect URI on an existing Google OAuth client, and writes the supplied client ID/secret plus operator allowlist to Convex env. Setup does not perform an end-user Convex or Google login, and does not provision provider accounts, DNS, or an OAuth client. It then walks Resend, OpenAI, and Polar in order and skips only the providers you decline (`--minimal` stops after Convex and Google). Output defaults to Korean; pass `--lang en` for English. The real Google operator identity remains separate from anonymous local customer QA.

## What's in the box

| Path | What it is |
|---|---|
| `template/` | The project source, fully rebranded to jeomwon (originally derived from get-convex/v1; pin recorded in `docs/upstream-report.md`): `domain.config.ts`-driven agents (triage + 4), KakaoTalk-style chat widget, operator dashboard, React Email × 4, `bun setup` wizard |
| `skill/` | The Claude Code skill: `SKILL.md` fast path, `REFERENCE.md` methodology, `EXAMPLES.md` 10 domain packs (salon, PC café, library, pension, study café, futsal, webinar, equipment rental, pilates, generic), `scripts/{bootstrap,scaffold,inject,verify}.mjs` |
| `samples/pension-stay/` | Self-proof: a pension (day-unit stay) project generated by the kit. Regenerated from the template periodically, so it may lag the latest template revision |
| `docs/plan.md` | The living plan — architecture decisions, phase log, backlog |
| `upstream/` | Read-only reference clone of get-convex/v1 (gitignored; pin recorded in `docs/upstream-report.md`) |

## QA gates

Each tree ships QA contract v2's 12 ordered gates (the prior 11 plus the no-show transition boundary). `bun run qa` handles Convex prep, authenticated app startup, all twelve gates, and teardown. An off-toggle SKIP is not success evidence; enabled setup failures are FAIL. Gate 10 proves unauthenticated/non-operator denial, while successful real Google-operator CRUD remains a separate BLOCKED maintainer smoke.

```bash
cd template
bun run qa
```

- The web server starts on port `3999` by default (override with `JEOMWON_QA_PORT`). Do **not** run QA for two projects at once — teardown kills whatever process holds that port.
- The hold-expiry gate's wait is controlled by `JEOMWON_TEST_HOLD_MS` (default `1500`).
- Safety guard: QA refuses to run against a non-`dev:` deployment, because it resets that domain's reservation and chat data.
- Gate 9 SKIPs when `features.waitlist` is off; gate 10's CRUD subcase SKIPs when `features.operatorCalendarCrud` is off; gate 12 SKIPs without mutation when `features.noShow` is off.

To run only the gates against a server you already have up, use `bun run qa:run` and set `JEOMWON_QA_BASE_URL` yourself. Next dev must be reached via `localhost` (not `127.0.0.1`).

## Configuration

`bun setup` generates `.env.local` files interactively (they are gitignored — no secrets live in this repo). Key names are documented in each package's `.env.example`:

- `apps/web/.env.example` — `NEXT_PUBLIC_CONVEX_URL`, `AGENT_RUNTIME` (`mock` | OpenAI), `OPENAI_API_KEY`
- `apps/app/.env.example` — dashboard app env
- `packages/backend/.env.example` — Convex deployment, `SITE_URL`, optional Polar account-subscription keys and the deposit product id (only when `domain.config.features.polar` is on)

Polar covers two separate capabilities. The account subscription is for an authenticated account's SaaS plan. Reservation deposits are a backend seam: a one-time product named by `POLAR_DEPOSIT_PRODUCT_ID`, whose order webhook writes the deposit onto the reservation. Deposit UI, booking charges, and a reservation payment ledger are absent, and service `price` is display copy. The capability manifest currently declares ten implemented/QA-proven capabilities, while examples derive coverage of 9/24 resource × slot × widget cells.

Canonical generated projects use domain-pack schema v1 and receipt schema v3. Only a schemaVersion-less exact legacy v0 pack shape migrates purely to v1. Offline bootstrap `VERIFY PASS` proves install/typecheck/lint/tests/build, not live QA, deployment, provider success, or an unmeasured first-success time.

## Architecture conventions

The ten invariants that survived real debugging are written down in `docs/plan.md` section 3 — highlights: invariants live inside Convex mutations, timezone math uses store-timezone calendar parts, no SSE (Convex `useQuery` reactivity), `PublicContext` exposes exactly 8 fields, `thread_id` is a conversation key, never authentication.

## Status

Roadmap phases 0–7 are complete, plus a full UI redesign (starter branding removed end to end; the full live QA suite and browser walkthroughs of both apps verified after the redesign). The repo is public and skill-only installs (the scaffold's GitHub tarball fallback) work. `samples/pension-stay` is freshly regenerated from the current template via bootstrap.

## Contributing

A new vertical's domain pack is the best first contribution — the empty cells of the resource × slot × widget matrix are tracked in the Coverage Catalog inside [skill/EXAMPLES.md](skill/EXAMPLES.md#coverage-catalog). See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

## License

[MIT](LICENSE). The vendored `template/` and `samples/` trees keep the upstream (get-convex/v1) copyright notice in `template/LICENSE.md`.
