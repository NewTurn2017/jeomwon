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
  policies. The query is gated by `ensureAdmin`; an unauthenticated caller gets
  `admin_auth_required`.
- `EscalationQueue` writes through `jeomwonConvex.admin.resolveEscalation`
  (`approveCancel` → `cancelled`, `keepReservation` → `confirmed`). The mutation
  records audit history and schedules customer mail in the backend.
- Localized strings come from `./src/locales/*.ts` under the `dashboard` scope.

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
