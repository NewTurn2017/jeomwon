# AUTHENTICATED APP GUIDE

## OVERVIEW

Next.js 16 App Router surface for authenticated customers and operators. This is
a presentation/orchestration layer; Convex mutations own reservation invariants.
Read `README.md` for the complete rendered-surface and data contract.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Auth, i18n, route policy | `src/proxy.ts` | `/api` excluded except `/api/auth`; non-operator `/admin` is a real 404 |
| App providers | `src/app/[locale]/layout.tsx` | Convex auth, theme, i18n |
| Customer flow | `src/app/[locale]/(dashboard)/_components/customer-reservation-*` | Headless state machine plus manager/view |
| Operator surface | `src/app/[locale]/(dashboard)/_components/admin-dashboard.tsx` | Snapshot, escalation, activity |
| Pack-driven widget | `src/app/[locale]/(dashboard)/_components/admin-widget-board.tsx` | `calendar` vs `seatGrid` |
| Chat HTTP seam | `src/app/api/chat/route.ts` | Token auth; delegates to `@jeomwon/agents` |
| Copy | `src/locales/ko.ts`, `src/locales/en.ts` | Keep locale keys paired |

## CONVENTIONS

- Access Convex through typed `@jeomwon/backend` references; keep domain logic out of React and route handlers.
- Customer reservation behavior lives in the headless flow/gateway seam and uses `useSyncExternalStore`; preserve browser-free unit testability.
- Use `snapshot.generatedAtMs` or injected `nowMs`, never the browser clock, for state comparisons.
- Format times with `Intl.DateTimeFormat` and the store timezone.
- All user-facing labels belong in both locale files.
- Component/flow tests stay colocated and run with `bun test`.

## ANTI-PATTERNS

- Never authorize an operator or customer by `threadId`.
- Never expose `JEOMWON_ADMIN_EMAILS` through `NEXT_PUBLIC_*` or a browser env.
- Never move collision, hold, cancellation-window, ownership, or status-transition checks into this app.
- Never expose audit history, internal reservation context, or operator-only notes to customer components.
- Do not remove the config -> snapshot -> `AdminWidgetBoard` `adminWidget` branch.
- Do not let middleware redirect API failures; route handlers must return their real JSON status.

## CHECKS

```bash
bun --cwd ../.. run typecheck
bun --cwd ../.. test
bun --cwd ../.. run build
```
