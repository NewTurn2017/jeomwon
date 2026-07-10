# Admin Operator Surface (`apps/app`)

## Overview

This app is the authenticated operator surface. Its dashboard shows live
reservations, the escalation queue, and the agent activity timeline from a single
authenticated Convex snapshot. It is Korean-first and ordered by action:
escalations first, then reservations, then the timeline.

This README documents the UI surface as it exists today, including the current
limit of the `adminWidget` config field. For how to change backend reservation
behavior safely, read `../../packages/backend/convex/engine/README.md` for the
engine primitives and the Code Extension Contract in the jeomwon skill
repository's `skill/REFERENCE.md` for the extension sequence and Session Rules.

## Rendered surface

- `./src/app/[locale]/(dashboard)/page.tsx` renders `Header` and the single
  `AdminDashboard` component. There is no widget-type routing at this entry.
- `./src/app/[locale]/(dashboard)/_components/admin-dashboard.tsx` is the whole
  dashboard. `AdminDashboard` subscribes to `admin.dashboardSnapshot` and renders
  three sections in fixed order: `EscalationQueue`, `ReservationsPanel`,
  `AgentTimeline`. It shows a skeleton while the snapshot loads.

## Component inventory

Source: `./src/app/[locale]/(dashboard)/_components/admin-dashboard.tsx`.

| Component | Role |
|---|---|
| `AdminDashboard` | Entry component. Queries the snapshot and renders the three panels in order. |
| `EscalationQueue` | Cancellation escalations that need operator judgment. Calls the `resolveEscalation` mutation with `approveCancel` / `keepReservation`. Shows internal memo, risk signals, and recent audit history. |
| `ReservationsPanel` | Reservations sorted by start time, with held / confirmed / escalated / expired counters. |
| `ReservationRow` | One reservation row: status, display number, service, customer, time window, resource, updated time, hold expiry. |
| `ReservationMetric` | A single counter tile inside `ReservationsPanel`. |
| `AgentTimeline` | Recent chat and automation events (up to 24). |
| `StatusPill` | Localized status badge for a `ReservationStatus`. |

## Data contract

- `AdminDashboard` reads `jeomwonConvex.admin.dashboardSnapshot`: resources,
  reservations (time-sorted), escalations, recent events, business hours, and
  policies. The query is gated by `ensureAdmin`; an unauthenticated caller gets
  `admin_auth_required`.
- `EscalationQueue` writes through `jeomwonConvex.admin.resolveEscalation`
  (`approveCancel` → `cancelled`, `keepReservation` → `confirmed`). The mutation
  records audit history and schedules customer mail in the backend.
- Localized strings come from `./src/locales/*.ts` under the `dashboard` scope.

## `adminWidget`: config field, not a rendered widget

`domain.config` carries `adminWidget: "calendar" | "seatGrid"`, but the value
flows through a data path only — no component renders based on it:

- `../../packages/backend/domain.config.ts` declares the field. In the kit it is
  generated and validated against `"calendar" | "seatGrid"` by `inject.mjs`.
- `../../packages/backend/convex/admin.ts` includes `adminWidget` in the
  `dashboardSnapshot.domain` object, and
  `../../packages/backend/convex/engine/lifecycle.ts` includes it in
  `publicDomainSnapshot()`.

No component reads `adminWidget`. `AdminDashboard` renders one fixed layout
regardless of the value; there is no `CalendarWidget` or `SeatGridWidget`, and no
widget-type branch anywhere in this app. The `dashboard` locale strings
`calendarTitle`, `seatGridTitle`, `seatGridDescription`, and `seatAvailable` (see
`./src/locales/ko.ts`) are likewise defined but consumed by no component.

Rendering a calendar or seat-grid view is deferred and will be decided together
with the UI redesign direction. Until then, treat `adminWidget` as a data-path
field, not a UI switch.

## Extension-agent consumption method

- Keep internal reservation context (operator memo, risk signals, private
  decision, cost basis) on this authenticated surface only; never leak it to the
  customer web app.
- If a spec authorizes an actual widget render, drive it from the existing
  `adminWidget` snapshot field and add the render branch here. Do not add a new
  pack key — the pack validator rejects unknown keys.
- Change dashboard copy through the domain pack and locale files, not by
  hardcoding strings in components.

## Must NOT

- Do not remove or repurpose the `adminWidget` data path (config → inject
  validation → snapshot). This README records its current limit; it does not
  authorize deleting it.
- Do not implement `calendar` / `seatGrid` widgets as part of documentation work.
- Do not expose internal reservation context on any public surface.
