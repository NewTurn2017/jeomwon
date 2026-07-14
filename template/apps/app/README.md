# Customer and Admin Dashboard Surfaces (`apps/app`)

## Overview

This app routes authenticated customers to `CustomerReservationManager` on the
root dashboard and exposes the operator dashboard at `/admin`. The customer
surface uses the canonical `customerReservations` Convex module; the operator
surface shows live reservations, the escalation queue, and the agent activity
timeline from `admin.dashboardSnapshot`.

This README documents both authenticated surfaces as they exist today, including
the `adminWidget` render branch. For how to change backend reservation
behavior safely, read `../../packages/backend/convex/engine/README.md` for the
engine primitives and the Code Extension Contract in the jeomwon skill
repository's `skill/REFERENCE.md` for the extension sequence and Session Rules.

## Rendered surface

- `./src/app/[locale]/(dashboard)/(onboarded)/page.tsx` resolves the viewer role.
  Customers see `CustomerReservationManager`; operators see `AdminDashboard`.
- `./src/app/[locale]/(dashboard)/admin/page.tsx` is the dedicated operator
  route. It renders `AdminDashboard` only for an operator and returns not found
  for every other viewer.
- `./src/app/[locale]/(dashboard)/_components/customer-reservation-manager.tsx`
  owns the customer reservation UI and calls only the canonical
  `jeomwonConvex.customerReservations` query and mutations.
- `./src/app/[locale]/(dashboard)/_components/admin-dashboard.tsx` is the
  dashboard shell. `AdminDashboard` subscribes to `admin.dashboardSnapshot` and
  renders four sections in fixed order: `EscalationQueue`, `AdminWidgetBoard`,
  `ReservationsPanel`, `AgentTimeline`. It shows a skeleton while the snapshot
  loads.
- `./src/app/[locale]/(dashboard)/_components/admin-widget-board.tsx` renders
  the pack-selected widget from `snapshot.domain.adminWidget`.

## Component inventory

Source: `./src/app/[locale]/(dashboard)/_components/customer-reservation-manager.tsx`,
`./src/app/[locale]/(dashboard)/_components/admin-dashboard.tsx`, and
`./src/app/[locale]/(dashboard)/_components/admin-widget-board.tsx`.

| Component | Role |
|---|---|
| `CustomerReservationManager` | Customer entry component. Reads `customerReservations.snapshot` and owns availability, hold, confirm, reschedule, and cancel calls. |
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

- `CustomerReservationManager` reads
  `jeomwonConvex.customerReservations.snapshot` and writes through
  `jeomwonConvex.customerReservations.createHold`, `confirmReservation`,
  `rescheduleReservation`, and `cancelReservation`. Availability comes from
  `jeomwonConvex.customerReservations.availableSlots`.
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

The rule is always fail-closed and does not depend on `customerAccounts`:

| Identity / allowlist state | Result |
|---|---|
| Unauthenticated | `admin_auth_required` |
| Allowlist missing or empty | `admin_not_configured` |
| Anonymous, missing email, or normalized email not on the list | `admin_forbidden` |
| Non-anonymous normalized exact email match | Operator |

There is no signed-in-user fallback. The guard denies until you configure the
allowlist, and `bun setup` requires it for every feature configuration while
displaying configuration presence only.

An account with no email — the product anonymous provider from
`AUTH_ANONYMOUS_LOGIN` — can never be an operator, even if a synthetic matching
email is present. The provider is available only when customer accounts are on,
the Convex and app server flags are both exactly `1`, and the Convex deployment
has a non-empty operator allowlist. `bun setup` writes both flags together,
requires an exact production opt-in, and fails its postflight when the two sides
do not match. Guest browser identity is device-local, so the login screen warns
that losing browser sign-in data also loses access to earlier reservations.

`ensureCustomer(ctx)` is the customer guard exported from
`../../packages/backend/convex/customerReservations.ts`. That canonical module
owns the customer snapshot, availability, and reservation mutations. The guard
asserts a signed-in user and returns
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
