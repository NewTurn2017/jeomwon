# BACKEND KNOWLEDGE BASE

## OVERVIEW

Convex reservation backend split into public boundary functions, reusable engine
primitives, shared TypeScript contracts, tests, and generated domain config.
Read `convex/engine/README.md` before changing reservation behavior.

## STRUCTURE

```text
packages/backend/
├── domain.config.ts       # Injected domain source
├── convex/*.ts            # Auth/validation and public/internal Convex functions
├── convex/engine/*.ts     # Availability, policy, identity and write lifecycle
├── convex/email/          # Capture/send reservation email actions
├── src/                   # DTOs, typed references, JSON boundary, QA contract
└── tests/                 # Bun tests and in-memory Convex harness
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Tables/indexes/statuses | `convex/schema.ts` | Five app tables plus auth tables |
| Canonical customer writes | `convex/customerReservations.ts` | Thin authenticated surface |
| Hold/confirm/cancel/reschedule | `convex/engine/customerReservationLifecycle.ts` | Transactional write path |
| Collision/time rules | `convex/engine/availability.ts`, `convex/engine/lifecycle.ts` | Store timezone and bounded reads |
| Identity/authorization | `convex/engine/identity.ts` | Re-derive customer thread from user |
| Operator calendar | `convex/admin.ts`, `convex/engine/adminBooking.ts` | Ownership is server-set `origin` |
| Shared public contracts | `src/agent-contract.ts`, `src/convex-refs.ts` | App/agent seam |
| Test harness | `tests/customer-reservations-test-harness.ts` | Fake DB, scheduler, query tracing |

## CONVENTIONS

- Public `convex/*.ts` files authenticate and validate; reusable booking rules belong in `convex/engine/`.
- Threads are derived from the authenticated user. `threadId` remains a routing key; `origin` is the ownership signal for operator sessions.
- Convex mutations own read-before-write collision checks, holds, status transitions, audit events, and side-effect scheduling.
- Time conversion uses `domainConfig.storeTimezone`; client args do not own `endMs`, origin, role, display name, or request time.
- Overlap and thread scans use 256-row caps plus a `cap + 1` sentinel and fail closed on truncation.
- Public serializers must preserve the typed separation from audit/internal context.
- Optional features gate at mutation/use time. QA/demo email mode captures instead of sending.
- Backend tests import real Convex modules and invoke registered handlers through the fake DB/scheduler harness.

## ANTI-PATTERNS

- Do not add a lock API; Convex transaction boundaries plus collision reads are the concurrency model.
- Do not use `threadId` for authorization or operator/customer ownership.
- Do not delete reservation rows; cancellation is an audited status transition.
- Do not accept browser-computed slot endings or wall-clock timestamps for operator/customer writes.
- Do not leak raw Convex ids as public reservation ids.
- Do not relax bounded-read truncation into partial results.
- For extensions, do not alter core lifecycle rules, add tables, or create registries before named hooks and existing tables are proven insufficient.
- Never set QA reset or development anonymous-auth flags in production.

## TESTS AND CHECKS

```bash
cd ../..
bun test
bun run typecheck
bun run lint
bun run qa
```

Keep tests deterministic: assert persisted state and exactly-once audit/chat/email/
scheduler effects. Use event/state signals rather than sleeps. Preserve
`MANUAL_QA_*` machine-readable evidence where an existing contract consumes it.
