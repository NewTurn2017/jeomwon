# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-08
**Commit:** cd8d222
**Branch:** main

## OVERVIEW

Jeomwon is an agent kit that turns a domain interview into a reservation SaaS.
The repository root is not runnable: `skill/` generates projects from the
canonical Bun/Turbo/Next.js/Convex workspace in `template/`.

## STRUCTURE

```text
.
├── skill/                 # Interview, domain-pack, scaffold/inject/verify contracts
├── template/              # Canonical runnable and generated-project source
├── samples/pension-stay/  # Generated reference; may lag template
├── site/                  # Separate static marketing site
├── docs/                  # Plan, decisions, upstream audit
└── upstream/v1/           # Gitignored pinned comparison clone; read-only
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Understand current behavior | `FEATURES.md` | Fact-of-record capability map |
| Understand roadmap/decisions | `VISION.md`, `docs/plan.md` | `docs/plan.md` section 3 owns invariants |
| Change generation behavior | `skill/SKILL.md`, `skill/REFERENCE.md`, `skill/scripts/` | Pipeline: scaffold -> inject -> verify |
| Change generated application | `template/` | Source of truth; see nested guide |
| Inspect a generated result | `samples/pension-stay/` | Do not use as the implementation source |
| Change public project site | `site/DESIGN.md`, `site/README.md` | No-build static site; design brief is authoritative |
| Compare original starter | `docs/upstream-report.md`, `upstream/v1/` | Reference only; never patch either during normal work |

## CODE MAP

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| `domainConfig` | configuration | `template/packages/backend/domain.config.ts:108` | 100+ | Generated domain source consumed across engine, admin, email |
| `createCustomerReservationHold` | function | `template/packages/backend/convex/engine/customerReservationLifecycle.ts:57` | engine callers | Transactional hold lifecycle |
| `CustomerReservationManager` | component | `template/apps/app/src/app/[locale]/(dashboard)/_components/customer-reservation-manager.tsx:14` | dashboard | Authenticated customer reservation entry |
| `AdminDashboard` | component | `template/apps/app/src/app/[locale]/(dashboard)/_components/admin-dashboard.tsx:50` | admin route | Operator overview and escalation UI |
| `main` | function | `template/scripts/setup/index.ts:187` | CLI entry | Setup/provisioning orchestrator |
| `bootstrap.mjs` | script | `skill/scripts/bootstrap.mjs` | skill fast path | Offline scaffold -> inject -> verify sequencer |

## CONVENTIONS

- Fix kit behavior in `template/` and/or `skill/`; never patch a generated sample as the origin fix.
- `skill/scripts/inject.mjs` is the only writer of domain-specific values. Keep proper nouns out of generic template code.
- Domain invariants live inside Convex mutations. Clients and Next route handlers orchestrate; they do not enforce collisions, holds, cancellation windows, or ownership.
- Store-timezone calendar parts drive booking time. Do not substitute browser/local `getHours()` logic.
- `threadId` is routing context, never identity or authorization. Public and internal context shapes stay separated.
- Bun is the package manager. Biome is the sole formatter/linter; tests use `bun:test`.
- `skill/assets/jeomwon-template-v0.1.0.tar.gz` is the immutable installed-skill source derived from canonical `template/`. Every included template change must rebuild it with `bun skill/scripts/build-template-archive.mjs`, update both hashes in `skill/jeomwon-skill.json`, and pass `bun skill/scripts/build-template-archive.mjs --check`. The builder excludes only `.DS_Store`, `.env.local`, `.next`, `.react-email`, `.turbo`, `node_modules`, and `qa-artifacts` by basename.

## ANTI-PATTERNS (THIS PROJECT)

- Never edit `upstream/v1/` or `docs/upstream-report.md` in ordinary work. The clone is gitignored, so corruption would be invisible to the parent diff.
- Never commit secrets or operator emails. Credentials belong in the `bun setup` flow and ignored env files.
- Do not add registries, event buses, packages, or new tables for a one-off extension before exhausting named hooks and existing tables.
- Do not expose audit history, operator notes, internal context, or customer PII through public payloads.
- Do not treat `samples/pension-stay/`, `qa-artifacts/`, `.next/`, `node_modules/`, Convex `_generated/`, or local agent state as source.

## COMMANDS

```bash
cd template
bun install
bun run typecheck
bun run lint
bun test
bun run build
bun setup        # interactive credentials/provisioning
bun run qa       # live dev-deployment QA; maintainer gate
```

Generator contract from the repository root:

```bash
bun test skill/scripts/generator-contract.test.ts
bun skill/scripts/build-template-archive.mjs --check
bun skill/scripts/bootstrap.mjs <fresh-target> <project-name> <domain-pack.json>
```

## NOTES

- Bootstrap verification is offline and deliberately strips `JEOMWON_QA_BASE_URL`; it does not replace live QA.
- `apps/app` runs on 3000, `apps/web` on 3001, React Email preview on 3003.
- The checked-in sample is intentionally allowed to lag the current template.
- Existing local or user changes are shared workspace state; do not revert them while following this guide.
