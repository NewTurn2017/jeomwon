# SETUP AND QA SCRIPTS GUIDE

## OVERVIEW

Safety-critical orchestration for first-time setup, live QA, evidence validation,
temporary Convex env changes, ports, browser contexts, and teardown.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Setup CLI | `setup/index.ts` | Driven by `../setup-config.json` |
| One-command QA | `qa-local.ts` | Verifies target, starts app, runs gates, tears down |
| Eleven scenarios | `qa.ts`, `qa-contract.ts` | Ordered gate and artifact contract |
| Deployment safety | `qa-runtime-contract.ts` | Requires named `dev:` target; strips override env |
| Temporary env | `qa-convex-env-lifecycle.ts` | Set/restore lifecycle |
| Port/process cleanup | `qa-port-lifecycle.ts` | Ownership and process-group teardown |
| Browser flow | `qa-browser.ts` | Two isolated identities and screenshots |
| Evidence validation | `qa-artifact-contract.ts`, `qa-browser-artifact-contract.ts` | Reject placeholders/incomplete runs |
| First-success metrics | `first-success-report.ts` | Thresholds in `../docs/first-success-validation.md` |

## CONVENTIONS

- `setup-config.json` is the declarative schema for projects, env files, steps, and variables; keep the CLI and config synchronized.
- Setup masks known secrets, redacts failures, and verifies ignored env files before writing.
- QA accepts only a verified named `dev:` Convex deployment and cross-checks the app URL against it.
- Child processes receive sanitized Convex env. Temporary deployment values are restored on success, failure, and signals.
- QA deliberately runs the mock agent, capture-mode email, short hold TTL, and isolated browser contexts.
- Gate identity/order and evidence filenames come from `qa-contract.ts`; only documented gates may SKIP.
- Tests for script contracts live beside the scripts and use `bun:test`.

## ANTI-PATTERNS

- Never print secret values, auth material, operator allowlists, or rejected override contents.
- Never permit production or unnamed Convex deployments as QA targets.
- Never leave temporary Convex env, app processes, ports, or browser state behind.
- Never replace exact readiness/state signals with sleeps or timing luck.
- Never accept TODO/TBD/placeholder evidence or silently renumber gates.
- Never send real reservation email during QA/demo capture runs.
- Do not set Convex built-in env variables from the setup wizard.

## CHECKS

```bash
cd ..
bun test scripts
bun run typecheck
bun run lint
bun run qa
```

`bun run qa` is a live maintainer gate, not part of offline generator
verification. Contract-only changes should run their focused `bun test` target
before the full repository checks.
