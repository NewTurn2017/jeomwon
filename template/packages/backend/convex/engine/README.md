# Reservation Engine Primitives

## Overview

This directory documents the reservation primitives that already exist in the
Convex backend. M3 is a document-only boundary: it does not promote these files
to a package, introduce registry mechanics, introduce generated-app machinery,
document the widget-kit surface, or change source code.

Use this reference for what the engine currently provides. Use the M2 Code
Extension Contract in the jeomwon skill repository's `skill/REFERENCE.md` for
how extension agents may extend a generated app safely. The two documents are
complementary: this file names the available primitives, invariants, consumers,
and safe consumption paths; the contract defines the extension sequence, Session
Rules, named hook rules, off-default toggles, QA shape, and Must NOT
constraints.

## Availability engine

Source: `./availability.ts`.

Export symbols:

- `buildSlot(service, resource, startMs)`: builds a `PublicSlot` with service
  and resource labels, `startMs`, `endMs`, and `timeWindow`.
- `isSlotAllowed(startMs, endMs, service?)`: rejects unavailable windows.
- `hasCollision(reservations, resourceKey, startMs, endMs, excludeReservationId?)`:
  rejects overlaps against active reservations for the same resource.
- `slotStepMs(service)`: returns a 30-minute step for non-day services and a
  one-day step for day services.
- `firstSearchStart(preferredStartMs, service?)`: starts at the preferred time
  only when it is later than now plus 30 minutes, then aligns to the service
  slot.
- `alignToSlot(timestampMs, service?)`: aligns day services to their check-in
  time and all other services to a 30-minute boundary.
- `serviceEndMs(service, startMs)`: applies `getServiceDurationMinutes`.
- `calendarParts(timestampMs)`: reads weekday, date key, and minutes since
  midnight in the store timezone.

Invariants:

- Blackout windows reject overlapping slots before business-hour checks.
- `calendarParts` uses `domainConfig.storeTimezone`; reservation time logic must
  not depend on the runtime local clock.
- Non-day slots must start and end on the same store-timezone date.
- Non-day slots must stay inside the weekday business hours window.
- Day slots must match configured check-in and check-out times and both endpoints
  must be inside business hours.
- `hasCollision` ignores other resources, an explicitly excluded reservation id,
  and rows that are not active according to `isActiveReservation`.
- Active-reservation collision checks apply to `confirmed`, `rescheduled`, and
  unexpired `held` reservations; `waitlisted`, `cancelled`, `expired`, `denied`,
  and `escalated` rows are not active collisions.
- Availability search scans up to 21 days from the aligned start in
  `agentTools:searchAvailability`.

Consuming points:

- `agentTools:searchAvailability` calls `findAvailableSlots`, which uses
  `firstSearchStart`, `slotStepMs`, `alignToSlot`, `serviceEndMs`,
  `isSlotAllowed`, `hasCollision`, and `buildSlot`.
- `agentTools:createHold` rechecks `serviceEndMs`, `isSlotAllowed`, and
  `hasCollision` immediately before inserting a held reservation.
- `agentTools:rescheduleReservation` rechecks `serviceEndMs`, `isSlotAllowed`,
  and `hasCollision` before moving a confirmed or rescheduled reservation.
- `../../src/convex-refs.ts` exposes typed public references
  to these consuming functions, not to the primitive helpers directly.

Extension-agent consumption method:

- Read this section before changing reservation behavior so the existing
  availability invariants remain inherited.
- Prefer named hooks at concrete mutation boundaries instead of changing core
  availability helpers for one feature.
- Keep extension toggles off by default in generated-app extension config.
- If a spec explicitly authorizes a new availability behavior, prove it through
  the Code Extension Contract's typecheck, lint, build, and QA sequence.

## Policy engine

Source: `./policy.ts`.

Export symbols:

- `isInsideCancelWindow(startMs, requestedAtMs)`: compares `startMs` with the
  request time using `domainConfig.policies.cancelWindowHours`.

Invariants:

- The only current policy key used by this primitive is `cancelWindowHours`.
- `requestedAtMs` is supplied by the caller, which lets tests and QA anchor the
  decision to a controlled request time.
- Cancellation inside the window escalates instead of cancelling immediately:
  `agentTools:cancelReservation` writes `reservation.escalated` audit history,
  schedules `reservation.escalated` mail, and returns `escalated: true`.
- Rescheduling inside the same window is rejected with
  `reschedule_window_closed`.

Consuming points:

- `agentTools:cancelReservation` uses `isInsideCancelWindow` to choose
  `cancelled` versus `escalated`.
- `agentTools:rescheduleReservation` uses it to reject closed-window changes.
- `../../src/agent-contract.ts` defines `CancelArgs` and
  `RescheduleArgs` with the `requestedAtMs` field consumed by these mutations.

Extension-agent consumption method:

- Do not invent additional policy keys for an extension. Use the current
  `cancelWindowHours` behavior unless an accepted spec changes the domain model.
- Keep cancellation escalation and reschedule rejection separate in any
  downstream docs or UI copy.

## Reservation lifecycle

Sources:

- `./lifecycle.ts`
- `../schema.ts`
- `../../src/agent-contract.ts`

Reservation statuses:

- `draft`
- `eligible`
- `held`
- `confirmed`
- `rescheduled`
- `waitlisted`
- `cancelled`
- `expired`
- `denied`
- `escalated`

Export symbols:

- `publicDomainSnapshot()`: publishes the domain config fields used by public
  chat and widget state.
- `defaultGuardrailStatus()`: initializes relevance, confirmation, and privacy
  guardrail states.
- `defaultPublicContext(status = "draft")`: initializes public reservation
  context.
- `publicContextFromReservation(reservation)`: converts a reservation row into
  customer-visible context.
- `nextStepForStatus(status)`: maps lifecycle status to customer next-step copy.
- `serviceByKey`, `resourceByKey`, `resourcesForService`: resolve configured or
  seeded services and resources.
- `timeWindowLabel(startMs, endMs, service?)`: formats store-timezone customer
  labels.
- `isActiveReservation(reservation)`: defines collision-active rows.
- `auditEvent(type, actor, summary, publicMessage)` and `appendAudit(existing,
  event)`: maintain reservation audit history.

Invariants and state transitions:

- `schema.ts` and `agent-contract.ts` define the same ten status literals.
- `createHold` inserts `held` rows only after duration, business-hour, blackout,
  and collision checks.
- `confirmReservation` only confirms `held` rows; expired held rows transition to
  `expired` through `expireReservation`.
- `rescheduleReservation` only moves `confirmed` or `rescheduled` rows, rejects
  closed-window requests, and sets status to `rescheduled`.
- `cancelReservation` sets status to `cancelled` or `escalated` and records the
  matching audit/mail event.
- `lookupReservation` resolves public reservation numbers or legacy Convex ids
  while preserving the thread scope.
- `../admin.ts` uses `toAdminReservation` to expose admin reservation rows with
  `holdExpiresAtMs`, audit history, internal context, and risk signals.
- `../chat.ts` uses lifecycle defaults and snapshots for public state when a thread
  does not exist yet.

### Hold & concurrency

Hold is lifecycle state, not a separate primitive. It is distributed across:

- `reservations.status: "held"`
- `holdExpiresAtMs`
- `agentTools:createHold`
- `agentTools:confirmReservation`
- `agentTools:expireHold`
- `expireReservation`
- `isActiveReservation`
- `hasCollision`

There is no lock primitive. Concurrency relies on Convex mutation transaction
boundaries and read-before-write collision checks inside the mutations that write
reservation rows. `createHold` reads reservations for the resource, checks
`hasCollision`, and inserts the held row in one mutation. `rescheduleReservation`
reads the candidate resource reservations, excludes the current reservation id,
checks collision, and patches the row in one mutation.

`confirmReservation` and `expireReservation` clear `holdExpiresAtMs` when held
rows leave the held state. `rescheduleReservation` only moves `confirmed` or
`rescheduled` rows, but also patches `holdExpiresAtMs` to null on the updated
row. `cancelReservation` patches the status to `cancelled` or `escalated` and
does not patch `holdExpiresAtMs`; the inactive status removes the row from
`isActiveReservation`, so this is documented as the current implementation fact
and is not a code-change task for M3.

Extension-agent consumption method:

- Treat hold behavior as reservation lifecycle behavior.
- Add feature behavior through named hooks at mutation boundaries when possible.
- Preserve Convex mutation transaction boundaries and read-before-write collision
  checks for any spec-authorized change that writes reservation rows.
- Do not describe or create an external locking API.

## Waitlist

Source: `./waitlist.ts`.

Export symbols:

- `onSlotFreed(ctx, slot)`: notify-only reference implementation for M1
  waitlist behavior.

Invariants:

- When `domainConfig.features.waitlist` is off, `onSlotFreed` returns without
  side effects.
- Waitlisted rows are stored as `reservations.status: "waitlisted"` with
  `holdExpiresAtMs: null`.
- Waitlisted rows are not active collisions because `isActiveReservation` returns
  false for every non-`held`, non-`confirmed`, non-`rescheduled` status.
- `onSlotFreed` finds the first overlapping waitlisted row for the freed slot
  that has not already recorded `waitlist.notified`.
- Notification writes a `waitlist.slotOpened` chat event, schedules
  `reservation.waitlist_opened` mail, and appends a `waitlist.notified` audit
  entry for dedupe.
- The implementation is notify-only. It does not create an automatic hold,
  automatic upgrade, or customer email collection path.

Consuming points:

- `agentTools:joinWaitlist` returns an existing waitlisted row for the same
  thread, service, and resource when present; otherwise, when the waitlist
  feature is enabled and no availability exists, it inserts a waitlisted row.
- `agentTools:cancelReservation` calls `onSlotFreed` when an active slot is freed.
- `agentTools:rescheduleReservation` calls `onSlotFreed` for the old slot after a
  successful reschedule.
- `expireReservation` calls `onSlotFreed` after a held slot expires.

Extension-agent consumption method:

- Treat waitlist as the reference implementation for a feature-owned engine file
  plus named hook calls at concrete mutation boundaries.
- Delegate extension mechanics to the Code Extension Contract in the jeomwon
  skill repository's `skill/REFERENCE.md`.
- Keep dedupe at the feature boundary and keep generated-app feature toggles
  off by default.

## Extension agents

Before changing reservation behavior:

1. Read this README for what primitives already exist.
2. Read the Code Extension Contract in the jeomwon skill repository's
   `skill/REFERENCE.md` for how to extend.
3. Inherit all Session Rules, especially mutation-owned collision, hold expiry,
   state transition, cancellation policy, store-timezone time evaluation, and
   PublicContext/InternalContext separation.
4. Use named hook boundaries such as `onSlotFreed` when a feature reacts to a
   concrete lifecycle event.
5. Keep feature toggles off by default in generated-app extension config.
6. Run the contract's verification sequence for any accepted source change.

Must NOT:

- Do not promote this directory into a package as part of M3.
- Do not introduce registries, event buses, or plug-in machinery for one feature.
- Do not document widget-kit primitives in M3.
- Do not change core reservation lifecycle rules for one extension.
- Do not add tables before proving existing `reservations`, `chatThreads`, and
  `chatEvents` reuse is insufficient.
- Do not broaden public payloads with internal context or customer PII.
