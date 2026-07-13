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

## Operator calendar CRUD

Source: `./adminBooking.ts`. Mutation boundary: `../admin.ts`. Toggle:
`domainConfig.features.operatorCalendarCrud`.

Lets an operator create, edit, and cancel rows directly on the admin calendar. It
adds no table and no engine rule: an operator session is a `reservations` row with
`origin: "operator"`, `displayName` carrying the session title, and status
`confirmed` from the moment it is inserted. Every write composes the availability,
lifecycle, policy, and waitlist primitives above.

Export symbols:

- `assertOperatorCalendarCrudEnabled()`: throws `operator_calendar_crud_disabled`
  when the feature is off. Called first in every mutation, so a pack with the flag
  off behaves exactly as it did before this file existed.
- `isOperatorSession(reservation)`: `reservation.origin === "operator"`. The only
  ownership signal.
- `createOperatorSession(ctx, input)`, `updateOperatorSession(ctx, reservation,
  input)`, `cancelOperatorSession(ctx, reservation)`: return the written row.
- `resolveSlot(ctx, input, excludeReservationId)`: validates service, resource,
  resource kind, wall clock, business hours, blackouts, and collisions, and
  returns `{ service, resource, startMs, endMs }`.
- `wallClockToMs(dateKey, startTime)`: store-timezone `YYYY-MM-DD` + `HH:MM` to an
  instant. The inverse of `calendarParts`, which it reuses.

Invariants:

- **Ownership is `origin`, never `threadId`.** `origin` is server-set inside the
  mutation that inserts the row and is never read from client args. `threadId` is
  a client-supplied string on public, unauthenticated chat mutations — anyone can
  mint one with any prefix — so it is a routing key only. An operator row's
  `threadId` (`operator:<reservationNumber>`) exists to group its audit events and
  must never gate an authorization decision.
- Rows without `origin` (every row written before the column, and every chat row)
  read as customer rows. The operator-session path is opt-in, not a default.
- Time is converted **server-side** against `domainConfig.storeTimezone`. The UI
  sends a date key and a wall clock, never a timestamp off the operator's browser.
  A wall time a DST jump skipped has no instant and is rejected with
  `invalid_slot_time`.
- Reservation numbers come from `agentTools:generateUniqueReservationNumber`, so
  an operator session carries the same domain-derived prefix as a customer
  booking. Features do not mint their own prefixes.
- `resolveSlot` rejects a resource whose `kind` does not match the service's
  `resourceKind`; otherwise the board would show a booking that every later
  availability search disagrees with.
- `updateOperatorSession` refuses any row that is not `confirmed` or
  `rescheduled` (`session_not_editable`), so a cancelled row cannot be resurrected
  into a window it already freed. `cancelOperatorSession` refuses an already
  cancelled row (`session_already_cancelled`), so a second delete cannot re-audit
  or re-run the waitlist hook.
- "Delete" is a `cancelled` status transition, never a row deletion: audit history
  survives and `onSlotFreed` fires for the freed window.
- Operator sessions are silent. There is no customer on the other end, so no mail
  is scheduled and no `publicMessage` copy is invented.
- No copy is hardcoded. Customer-facing strings come from `domainConfig.copy`;
  audit summaries are operator-facing and domain-neutral; operator chat events
  carry the row's own configured labels.

Admin edits of a **customer** row:

- `admin:updateSession` carries a `title` and is therefore restricted to operator
  sessions. `admin:rescheduleCustomerReservation` has a deliberately different
  shape with **no `title` field**: on a customer row `displayName` is the
  customer's name, and patching a session title over it would destroy their PII.
- A change to a customer row rides the existing chat notification path rather than
  reimplementing it: `admin:rescheduleCustomerReservation` delegates to
  `agentTools:rescheduleReservation` and `admin:deleteSession` delegates to
  `agentTools:cancelReservation`, which already write the chat event, schedule the
  reservation mail, and resync `chatThreads.publicContext`. The admin mutation
  appends one extra audit entry recording that the operator, not the customer,
  pulled the lever.
- `policies.cancelWindowHours` stays owned by those mutations. An operator cancel
  inside the window escalates (`escalated: true`) instead of cancelling, and the
  operator finishes through `admin:resolveEscalation`. A reschedule inside the
  window is rejected with `reschedule_window_closed`. The board does not get to
  bypass the invariant.

Consuming points:

- `admin:createSession`, `admin:updateSession`,
  `admin:rescheduleCustomerReservation`, `admin:deleteSession` — all behind
  `ensureAdmin` and the feature flag.
- `admin:dashboardSnapshot` exposes `reservation.origin` and `domain.features` so
  the board can decide which affordances to show without inspecting `threadId`.
- `../../src/convex-refs.ts` exposes typed references to the four mutations.

Extension-agent consumption method:

- Reuse `resolveSlot` for any new operator-side write instead of re-deriving
  business-hour or collision checks.
- Do not add a customer-facing mutation here. The customer calendar is read-only;
  customers create, cancel, and reschedule through the chat agent path.
- `seatGrid` packs do not get operator CRUD; the injector rejects
  `operatorCalendarCrud: true` unless `adminWidget` is `calendar`.

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
