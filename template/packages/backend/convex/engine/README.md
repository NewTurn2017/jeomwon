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
- Active-reservation collision checks apply to `confirmed`, `rescheduled`,
  `escalated`, and unexpired `held` reservations. An `escalated` interval stays
  occupied until the operator resolves it; `waitlisted`, `cancelled`, `expired`,
  and `denied` rows are not active collisions.
- Overlap reads use the additive `reservations.by_resource_status_end` index
  (`domainKey`, `resourceKey`, `status`, `endMs`). Each collision-active status
  is queried with `endMs > candidateStart`, then rows are filtered with
  `startMs < candidateEnd`. The read therefore remains correct when a persisted
  reservation is longer than the current service-duration configuration.
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
- Canonical lifecycle actions derive `requestedAtMs` from the server clock
  (`Date.now()`) immediately before the policy check. The deprecated
  `agentTools` adapters still accept their legacy field shape, but the value is
  ignored and cannot influence the decision.
- Cancellation of a `confirmed` or `rescheduled` reservation inside the window
  escalates instead of cancelling immediately: the shared customer lifecycle
  writes `reservation.escalated` audit history, schedules
  `reservation.escalated` mail, and returns `escalated: true`.
- Cancellation of an unexpired `held` reservation is always final, including
  inside the cancel window. It clears `holdExpiresAtMs`, releases the interval,
  and returns `escalated: false`.
- Rescheduling inside the same window is rejected with
  `reservation_not_actionable`.

Consuming points:

- `customerReservationLifecycle:cancelCustomerReservation` uses
  `isInsideCancelWindow` to choose
  `cancelled` versus `escalated`.
- `customerReservationLifecycle:rescheduleCustomerReservation` uses it to
  reject closed-window changes.
- `../../src/agent-contract.ts` retains `requestedAtMs` only in the deprecated
  adapter argument types; canonical customer arguments do not expose it.

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
  `expired` through `expireCustomerReservationHold`.
- `rescheduleReservation` only moves `confirmed` or `rescheduled` rows, rejects
  closed-window requests, and sets status to `rescheduled`.
- `cancelReservation` always moves an unexpired `held` row to `cancelled`;
  `confirmed` and `rescheduled` rows move to `cancelled` or `escalated` based on
  the strict cancel-window threshold. Each transition records the matching
  audit/mail event.
- Deprecated internal adapters can still resolve a raw legacy Convex id while
  preserving thread scope; canonical customer and admin surfaces never expose
  or require it. They expose a deterministic `LEGACY-` id containing a 128-bit
  uppercase-hex digest of the document id, not a raw id substring. Customer
  lifecycle actions resolve that same id only inside the authenticated
  customer's derived thread.
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
- `expireCustomerReservationHold`
- `isActiveReservation`
- `hasCollision`

There is no lock primitive. Concurrency relies on Convex mutation transaction
boundaries and read-before-write collision checks inside the mutations that write
reservation rows. `createHold` reads reservations for the resource, checks
`hasCollision`, and inserts the held row in one mutation. `rescheduleReservation`
reads the candidate resource reservations, excludes the current reservation id,
checks collision, and patches the row in one mutation.

`confirmReservation`, held cancellation, and `expireCustomerReservationHold` clear
`holdExpiresAtMs` when held rows leave the held state. `rescheduleReservation`
only moves `confirmed` or `rescheduled` rows, but also patches `holdExpiresAtMs`
to null on the updated row. A `cancelled` row frees its interval; an
`escalated` confirmed/rescheduled row remains collision-active until the
operator resolves it to cancellation or retention. Replayed hold-expiry jobs
are inert after final cancellation because `expireHold` accepts only `held`
rows.

### Schema evolution for overlap reads

`by_resource_status_end` is an additive index over fields already present on
every reservation row. Deploying this schema change asks Convex to build the
index; it does not add a field, rewrite a row, add a table, or require an
application data migration. Live schema deployment and index readiness remain
orchestrator-owned release work.

Each resource/status overlap lookup takes at most 257 rows: a fixed 256-row
candidate budget plus one truncation sentinel. Rows remain ordered by `endMs`,
so persisted intervals longer than the current service configuration are still
considered, and `endMs > candidateStart` preserves half-open interval edges.
If the sentinel is present, the result is intentionally fail-closed: customer
availability omits that resource, create/reschedule returns `slot_conflict`
before writes, and slot release skips waitlist notification while allowing the
valid enclosing lifecycle change to complete. Operationally, more than 256
active end-index candidates for one resource/status make that resource
temporarily unavailable until stale or anomalous future rows are reconciled;
the fixed budget prevents unbounded Convex reads without adding schema state.

Extension-agent consumption method:

- Treat hold behavior as reservation lifecycle behavior.
- Add feature behavior through named hooks at mutation boundaries when possible.
- Preserve Convex mutation transaction boundaries and read-before-write collision
  checks for any spec-authorized change that writes reservation rows.
- Do not describe or create an external locking API.

## Canonical customer reservation surface

Public boundary: `../customerReservations.ts`. Deep write implementation:
`./customerReservationLifecycle.ts`. Availability read helper:
`./customerAvailability.ts`.

The canonical customer surface owns six operations:

- `snapshot()`
- `availableSlots({ serviceKey, resourceKey, preferredStartMs, count })`
- `createHold({ serviceKey, resourceKey, startMs })`
- `confirmReservation({ reservationId })`
- `cancelReservation({ reservationId })`
- `rescheduleReservation({ reservationId, serviceKey, resourceKey, startMs })`

Every operation first requires `features.customerAccounts`, then authenticates the
customer and derives `customerThreadId(userId)`. Client args never accept a thread,
end time, request time, display name, role, or origin. The server derives those
values and projects only customer-safe reservation fields. A reservation outside
the derived thread is reported as `reservation_not_found`.

Customer snapshot and legacy-id thread reads take at most 257 rows: a fixed
256-row lifetime budget plus one truncation sentinel. Snapshot overflow fails
closed with `customer_snapshot_limit_exceeded` rather than returning an
incomplete active/history list. Legacy-id lookup overflow remains
`reservation_not_found`, so it cannot reveal whether another row or an
over-capacity thread exists. Normal threads keep the same complete active and
history list.

The admin projection uses the identical public-id helper, so a no-number row
keeps one stable id through customer cancellation/escalation and operator
approval, retention, reschedule, or deletion. Because legacy rows have no stored
digest field, admin fallback lookup uses `by_domain_reservation_number` to scan
at most 257 no-number rows in the domain (256 plus a sentinel) and returns
`reservation_not_found` on truncation or a digest collision. This is
deliberately fail-closed; it never chooses from a partial or ambiguous result
set and never falls back to exposing the raw Convex id.

Authenticated chat and direct customer UI use the same
`jeomwonConvex.customerReservations.*` references. The `agentTools` reservation
writers remain deprecated adapters only for the `customerAccounts=false` legacy
web lane until PR4 removes that lane.

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
- Waitlisted rows are not active collisions. `Escalated` rows remain
  collision-active until the operator resolves them.
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
- `expireCustomerReservationHold` calls `onSlotFreed` after a held slot expires.

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
- Reservation numbers come from
  `customerReservationLifecycle:generateUniqueReservationNumber`, so
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
- After `ensureAdmin`, both admin customer actions call
  `customerReservationLifecycle` directly with the target thread and explicit
  `actor: "operator"`. The shared helper writes the lifecycle audit entry, chat
  event, reservation mail, thread context, and waitlist hook. There is no public
  customer-wrapper impersonation and no second operator audit entry.
- `policies.cancelWindowHours` stays owned by the shared helper. An operator cancel
  inside the window escalates (`escalated: true`) instead of cancelling, and the
  operator finishes through `admin:resolveEscalation`. A reschedule inside the
  window is rejected with `reservation_not_actionable`. The board does not get to
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
- Do not add a customer-facing mutation to `admin.ts`. Customer reads and writes
  belong to `customerReservations.ts`; chat and direct UI share those references.
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
