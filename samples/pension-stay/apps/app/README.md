# Admin Operator Surface (`apps/app`)

## Overview

This app is the authenticated operator surface. Its dashboard shows live
reservations, the escalation queue, and the agent activity timeline from a single
authenticated Convex snapshot. It is Korean-first and ordered by action:
escalations first, then reservations, then the timeline.

This README documents the UI surface as it exists today, including the
`adminWidget` render branch. For how to change backend reservation
behavior safely, read `../../packages/backend/convex/engine/README.md` for the
engine primitives and the Code Extension Contract in the jeomwon skill
repository's `skill/REFERENCE.md` for the extension sequence and Session Rules.

## Rendered surface

- `./src/app/[locale]/(dashboard)/page.tsx` renders `Header` and the single
  `AdminDashboard` component. Widget-type branching happens inside the
  dashboard, not at this entry.
- `./src/app/[locale]/(dashboard)/_components/admin-dashboard.tsx` is the
  dashboard shell. `AdminDashboard` subscribes to `admin.dashboardSnapshot` and
  renders four sections in fixed order: `EscalationQueue`, `AdminWidgetBoard`,
  `ReservationsPanel`, `AgentTimeline`. It shows a skeleton while the snapshot
  loads.
- `./src/app/[locale]/(dashboard)/_components/admin-widget-board.tsx` renders
  the pack-selected widget from `snapshot.domain.adminWidget`.

## Component inventory

Source: `./src/app/[locale]/(dashboard)/_components/admin-dashboard.tsx` and
`./src/app/[locale]/(dashboard)/_components/admin-widget-board.tsx`.

| Component | Role |
|---|---|
| `AdminDashboard` | Entry component. Queries the snapshot and renders the four panels in order. |
| `EscalationQueue` | Cancellation escalations that need operator judgment. Calls the `resolveEscalation` mutation with `approveCancel` / `keepReservation`. Shows internal memo, risk signals, and recent audit history. |
| `AdminWidgetBoard` | Branches on `snapshot.domain.adminWidget`: `seatGrid` → `SeatGridWidget`, otherwise `CalendarWidget`. |
| `CalendarWidget` | Next 7 days (store timezone), each day listing slot-occupying reservations (held / confirmed / rescheduled / escalated) with time range, service, resource, and status pill. |
| `SeatGridWidget` | One card per `domain.resources` entry showing occupied ("이용 중" with the covering reservation), upcoming ("다음 예약" with the next start), or available state. |
| `ReservationsPanel` | Reservations sorted by start time, with held / confirmed / escalated / expired counters. |
| `ReservationRow` | One reservation row: status, display number, service, customer, time window, resource, updated time, hold expiry. |
| `ReservationMetric` | A single counter tile inside `ReservationsPanel`. |
| `AgentTimeline` | Recent chat and automation events (up to 24). |
| `StatusPill` | Localized status badge for a `ReservationStatus` (exported; also used by the widget board). |

## Data contract

- `AdminDashboard` reads `jeomwonConvex.admin.dashboardSnapshot`: resources,
  reservations (time-sorted), escalations, recent events, business hours, and
  policies. The query is gated by `ensureAdmin` (see "Who is an operator" below);
  an unauthenticated caller gets `admin_auth_required`.
- `EscalationQueue` writes through `jeomwonConvex.admin.resolveEscalation`
  (`approveCancel` → `cancelled`, `keepReservation` → `confirmed`). The mutation
  records audit history and schedules customer mail in the backend.
- Localized strings come from `./src/locales/*.ts` under the `dashboard` scope.

## Who is an operator: `JEOMWON_ADMIN_EMAILS`

Every query and mutation in `../../packages/backend/convex/admin.ts` runs behind
`ensureAdmin`. `JEOMWON_ADMIN_EMAILS` is the allowlist it checks: a
comma-separated list of operator emails, matched case-insensitively against the
signed-in account's email. It is a **Convex deployment env var**
(`npx convex env set JEOMWON_ADMIN_EMAILS ops@store.com,owner@store.com` from
`packages/backend`), never a Next `.env.local` value and never `NEXT_PUBLIC_` —
the browser must not see who the operators are. `bun setup` prompts for it. The
guard re-reads it on every call, so a `convex env set` takes effect on the next
request without a redeploy.

The rule is **conditionally fail-closed**, because "no allowlist" means two
different things depending on who can sign in:

| `JEOMWON_ADMIN_EMAILS` | `features.customerAccounts` | Result |
|---|---|---|
| Set | either | Email on the list → operator. Otherwise `admin_forbidden`. |
| Empty | `false` | Any signed-in user is an operator. |
| Empty | `true` | Every call throws `admin_not_configured`. |

- **Empty + `customerAccounts: false`** is the historical behavior, kept exactly.
  Only operators can sign in to such a deployment, so being signed in is itself
  proof of role, and existing projects do not lock their operators out when they
  upgrade. Setting the allowlist is still the safer choice.
- **Empty + `customerAccounts: true`** is refused. Customers can sign in to that
  deployment, so treating any signed-in user as an operator would hand every
  customer the dashboard, internal memos and risk signals included. There is no
  safe default, so the guard denies until you configure one — `bun setup` makes
  the allowlist required whenever the pack turns customer accounts on.

An account with no email — the dev anonymous provider from `AUTH_DEV_ANONYMOUS` —
can never match a non-empty allowlist. Local QA that signs in anonymously must
leave `JEOMWON_ADMIN_EMAILS` unset.

`ensureCustomer(ctx)` is the counterpart guard, exported from the same module for
customer-scoped queries. It asserts a signed-in user and returns
`{ userId, user }` — it does **not** consult the allowlist. Customer-scoped reads
authorize by scoping to that `userId`; the ownership check is the authorization
and it belongs to the caller. Never authorize a customer by `threadId`: a thread
id is a routing key anyone can hold, not proof of who is asking.

## `adminWidget`: pack-driven render branch

`domain.config` carries `adminWidget: "calendar" | "seatGrid"`, and the value
now drives a render branch in addition to its data path:

- `../../packages/backend/domain.config.ts` declares the field. In the kit it is
  generated and validated against `"calendar" | "seatGrid"` by `inject.mjs`.
- `../../packages/backend/convex/admin.ts` includes `adminWidget` in the
  `dashboardSnapshot.domain` object, and
  `../../packages/backend/convex/engine/lifecycle.ts` includes it in
  `publicDomainSnapshot()`.
- `AdminWidgetBoard` reads `snapshot.domain.adminWidget` and renders
  `CalendarWidget` or `SeatGridWidget` between the escalation queue and the
  reservations panel.

Widget behavior notes:

- Only slot-occupying statuses (held / confirmed / rescheduled / escalated)
  appear on the board; cancelled, expired, denied, and notify-only waitlist rows
  do not.
- All "now" comparisons use `snapshot.generatedAtMs`, not a local clock — the
  board updates when the snapshot does, so seat states can lag until the next
  snapshot recomputation.
- Day and time labels format with `snapshot.domain.locale` and
  `snapshot.domain.storeTimezone`; the section titles and state words come from
  the `dashboard` locale strings (`calendarTitle`, `calendarDescription`,
  `calendarDayEmpty`, `seatGridTitle`, `seatGridDescription`, `seatAvailable`,
  `seatOccupied`, `seatNextAt` in `./src/locales/*.ts`).

## Extension-agent consumption method

- Keep internal reservation context (operator memo, risk signals, private
  decision, cost basis) on this authenticated surface only; never leak it to the
  customer web app.
- Extend widget behavior from the existing `adminWidget` snapshot field and the
  `AdminWidgetBoard` branch. Do not add a new pack key — the pack validator
  rejects unknown keys.
- Change dashboard copy through the domain pack and locale files, not by
  hardcoding strings in components.

## Must NOT

- Do not remove or repurpose the `adminWidget` data path (config → inject
  validation → snapshot → `AdminWidgetBoard`).
- Do not expose internal reservation context on any public surface.
- Do not weaken `ensureAdmin` into a presence check when `customerAccounts` is
  true, and do not move `JEOMWON_ADMIN_EMAILS` into a `.env.local` or a
  `NEXT_PUBLIC_` var. Authorization is a server decision.
- Do not authorize any caller — operator or customer — by `threadId`.
