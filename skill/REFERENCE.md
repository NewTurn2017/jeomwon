# Jeomwon Reference

## Domain Pack Schema

The domain pack JSON maps 1:1 to `template/packages/backend/domain.config.ts`. Top-level keys are fixed; do not add app behavior outside these fields.

```ts
type ResourceKind = "person" | "seat" | "room" | "unit";
type SlotUnit = "minutes:30" | "hour" | "day";
type AdminWidget = "calendar" | "seatGrid";
type LocaleCode = "ko-KR" | "en-US";
type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type BusinessHoursWindow =
  | { open: "HH:MM"; close: "HH:MM" }
  | { closed: true };

type DomainResource = {
  key: string;
  label: string;
  kind: ResourceKind;
};

type DomainDayUnit = {
  checkInTime: "HH:MM";
  checkOutTime: "HH:MM";
  checkInLabel: string;
  checkOutLabel: string;
};

type DomainService = {
  key: string;
  label: string;
  durationMinutes?: number;
  slotUnit?: SlotUnit;
  dayUnit?: DomainDayUnit;
  price?: string;
  resourceKind: ResourceKind;
};

type DomainPack = {
  domainKey: string;
  storeName: string;
  storeTimezone: string;
  locale: LocaleCode;
  resources: DomainResource[];
  services: DomainService[];
  businessHours: Record<Weekday, BusinessHoursWindow>;
  blackouts: { startIso: string; endIso: string; reason?: string }[];
  policies: {
    cancelWindowHours: number;
    holdMinutes: number;
    confirmationRequired: true;
  };
  adminWidget: AdminWidget;
  notificationEmail: string;
  features: {
    email: boolean;
    polar: boolean;
    waitlist?: boolean;
    customerAccounts?: true;
    operatorCalendarCrud?: boolean;
  };
  copy: {
    chatTitle: string;
    chatGreeting: string;
    chatPlaceholder: string;
    relevanceRefusal: string;
    confirmationRequired: string;
    privacyRefusal: string;
    availabilityIntro: string;
    holdCreated: string;
    confirmed: string;
    rescheduled: string;
    cancelled: string;
    cancelEscalated: string;
    holdExpired: string;
    schemaError: string;
    guardrailBanner: string;
    nextStepAvailability: string;
    nextStepHold: string;
    nextStepConfirmed: string;
    policySummary: string;
  };
};
```

### Kit-core feature flags

`features.*` is a closed set owned by the kit: every flag's code ships in
`template/`. `waitlist` and `operatorCalendarCrud` are optional booleans that
default to `false`.

- `waitlist` — notify-only waitlist on freed slots (`convex/engine/waitlist.ts`).
- `customerAccounts` — compatibility literal for baseline customer login and
  self-service surfaces. Omission materializes `true`; explicit `true` is accepted.
  Explicit `false` fails with
  `features.customerAccounts=false is no longer supported; omit it or set true`.
  The admin allowlist is required and empty values deny admin access.
- `operatorCalendarCrud` — operator create/edit/cancel from the admin calendar.
  Requires `adminWidget: "calendar"`; `seatGrid` has no operator CRUD surface.

## Bootstrap Contract

`scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>` is the standard one-command deterministic path. It is a thin sequencer with no domain logic of its own: it resolves `scaffold.mjs`, `inject.mjs`, and `verify.mjs` as its own siblings (so it runs identically from a repo clone or a skill-only install) and invokes them in order with the current runtime. The repo form is `bun skill/scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>`; the installed-skill form is `bun scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>`.

- Arguments: the first is the target directory, the last is the domain-pack JSON, and everything in between is the scaffold project name (one quoted argument or several bare words). Target and pack are resolved against the invocation directory.
- Stages: `scaffold` → `inject` → `verify`. There is no separate install step; `verify.mjs` owns the offline install.
- Offline-only: bootstrap deletes an ambient `JEOMWON_QA_BASE_URL` from the verify step and never passes `--qa`, so its verify always reports `SKIP qa`. It never runs `bun setup` and never runs live QA.
- Failure: it stops at the first failing stage, names the stage and status, and prints exactly one `Recovery: bun <script> ...` line (using the public `bun` token) for that stage. It never deletes a target — after a scaffold failure a non-empty or partial target must be inspected and removed manually before the printed command is rerun.
- Success: it prints the resolved generated-project path and the next steps `cd <target>`, `bun setup`, then `bun run qa` as guidance only (it does not run them).

For retries, partial reruns, and debugging, run the individual `scaffold.mjs`, `inject.mjs`, and `verify.mjs` commands directly (see the Injection Contract and Verification Gates below).

## Injection Contract

`scripts/inject.mjs <target-dir> <domain-pack.json>` validates and writes only generated domain artifacts:

- `packages/backend/domain.config.ts`: typed config and duration helpers.
- `packages/email/src/reservation-sample.ts`: email sample when that scaffold path exists.

`packages/backend/convex/jeomwonSeed.ts` is template-owned and remains byte-identical
through injection. `demoReset.ts` imports its `seedDomainResources` export directly.

Validation gates:

- All required top-level keys are present; unknown top-level keys fail.
- `domainKey`, resource keys, and service keys are slug-like and unique.
- Every service `resourceKind` has at least one matching resource.
- Every weekday is present and each open/close time is `HH:MM`.
- `slotUnit: "day"` requires `dayUnit.checkInTime`, `dayUnit.checkOutTime`, `dayUnit.checkInLabel`, and `dayUnit.checkOutLabel`.
- `durationMinutes` is positive when present; day services normally omit it.
- `confirmationRequired` must be `true`.
- `notificationEmail` must be an email-like string.
- `features.waitlist` and `features.operatorCalendarCrud` are optional and default
  to `false`; when present each must be boolean.
- `features.customerAccounts` may be omitted or literal `true`. Omission
  materializes `true`; explicit `false` returns the exact compatibility error
  above; other values fail validation. Emitted `DomainConfig` declares it as
  literal `true`.
- `features.operatorCalendarCrud: true` requires `adminWidget: "calendar"`. A
  `seatGrid` pack that asks for it fails with
  `operatorCalendarCrud requires adminWidget: "calendar"`.
- Every copy field is a non-empty string.

## Verification Gates

Run these gates in order:

1. Template regression: in `template/`, run `bun install --frozen-lockfile --offline`, `bun run typecheck`, `bun run lint`, and `bun run build`.
2. Sample bootstrap (standard journey): into a fresh, empty target directory, run `bun skill/scripts/bootstrap.mjs <fresh-target> "Pension Stay" <pension-domain-pack.json>`. This runs scaffold → inject → offline verify in one command and ends with `VERIFY PASS`. Bootstrap's verify owns the offline install and never runs live QA — it strips an ambient `JEOMWON_QA_BASE_URL` and reports `SKIP qa`. Bootstrap refuses a non-empty target, so do not point it at the committed `samples/pension-stay`; use a throwaway directory.
3. Convex/authenticated-app QA (one command): after `bun setup` provisions the dev Convex deployment (and `bunx playwright install chromium` prepares the local browser once), run `bun run qa` in the generated project (or in `template/`). `scripts/qa-local.ts` requires the app Convex URL to exactly match the verified backend `dev:` deployment, injects that canonical URL into every child, temporarily enables anonymous customer auth with a nonmatching reserved `.invalid` admin allowlist, boots `apps/app` in mock runtime, signs in isolated browser identities A/B, runs the exact 11-gate suite, and restores the app/browser/env lifecycle. Deterministic gate 10 proves that the authenticated customer identity is denied operator-only routes and mutations. Successful Google operator CRUD is a separate maintainer-owned live smoke and remains BLOCKED until explicitly authorized; it never requires operator email/storage-state inputs for the exact 11-gate command. The runner forces email capture, so no real mail is sent.

`verify.mjs` (bootstrap's third stage) is the offline gate and never fetches provider secrets. It uses Bun offline install, builds the email package normally, builds the Next app/web surfaces with `next build --webpack` for sandbox compatibility, and skips QA unless a running authenticated app surface is explicitly supplied through `JEOMWON_QA_BASE_URL`. CI runs the template regression plus the fresh generator contract; the live authenticated-app 11-gate QA in gate 3 remains the maintainer-owned dev-deployment path.

### Recovery / partial execution

Bootstrap composes three lower-level commands; run them directly to rerun a single stage after a failure or to execute the pipeline partially:

- Scaffold: `bun skill/scripts/scaffold.mjs <target-dir> "Pension Stay"`.
- Inject: `bun skill/scripts/inject.mjs <target-dir> <pension-domain-pack.json>`.
- Generated verification: `bun skill/scripts/verify.mjs <target-dir>`.

## Session Rules

1. Convex mutations enforce invariants: collision, hold expiry, state transitions, and cancellation policy.
2. Time is evaluated by store timezone calendar parts, not runtime-local `getHours()`.
3. Node and Convex boundaries accept only normalized JSON values.
4. Convex reactive queries are preferred over custom SSE relays.
5. Hold expiry uses scheduler plus `JEOMWON_TEST_HOLD_MS` for short local QA.
6. PublicContext and InternalContext stay separate; public surfaces must grep clean for internal keys.
7. `thread_id` is continuity only, not identity or authorization.
8. Network/provider gates are recorded honestly when sandboxed; leave exact local commands.
9. Briefs must include Goal, Scope, Must-NOT, gates, stop condition, and completion marker.
10. Agent roster is triage plus availability, reservation, policy, and escalation specialists; irreversible writes require confirmation.

## Code Extension Contract

### Applies to generated-app and template code extensions

Pack generation still goes through `domain-pack.json` and `inject.mjs`. The
positive code extension path is only for follow-up changes after scaffold/inject,
or for template seam hardening after proof shows the seam belongs in the kit.
Keep domain-pack regeneration and generated-app code extensions separate.
Before changing reservation behavior, extension agents must read `template/packages/backend/convex/engine/README.md` for the current engine primitive boundaries.

### Session Rules are inherited

Every extension inherits all Session Rules. In particular, Convex mutations keep
owning collision, hold expiry, state transition, and cancellation-policy
invariants; time is evaluated with store-timezone calendar parts; public
payloads use PublicContext while InternalContext stays internal; and `thread_id`
is continuity only, not identity or authorization.

### Required Sequence

1. Put the feature-owned implementation in `convex/engine/<feature>.ts`.
2. Contact core reservation logic only through named hooks.
3. Add an off-default inject-safe toggle.
4. Record an audit event, add dedupe, and register a mail kind if mail is added.
5. Add a SKIP-aware QA gate.
6. Run typecheck -> lint -> build -> `bun run qa`.

### Inject-Safe Extension Toggles

Use generated-app `packages/backend/extension.config.ts` for extension settings.
The file is owned by extension code, and feature flags must default off, for
example `extensionConfig.features.<featureKey> = false`. Extension modules and
extension QA gates import this file rather than reading generated domain config.

Chosen: a separate generated-app extension setting file. It survives reinject
because `inject.mjs` writes only `domain.config.ts` and the email sample through
paths such as `writeProjectFile` and `renderDomainConfig`. It
keeps the pack schema strict and adds no new machinery.

Rejected: an inject preservation block. It would add generator complexity and
turn a full-file generated artifact into a partially hand-owned file.

Rejected: adding toggles to the pack schema or a `features.noShow` key. Current
top-level and feature exact-key validation rejects unknown pack keys unless the
generator/schema changes, and it would make a generated-app extension depend on
pack regeneration. `domain.config.ts` and `domain-pack.json` are not extension
toggle surfaces because `inject.mjs` overwrites generated domain config and the
pack validator enforces exact-key inputs.

### Extension toggles vs kit-core feature flags

The rule above governs **extension** toggles — code that lives in the generated
app, like the M2 no-show case study, which is switched by
`extension.config.ts`. It does not govern **kit-core** feature flags, whose code
ships in `template/` and therefore exists in every generated project before any
extension is written. A kit-core capability has nowhere else to be switched on
per project, so its flag belongs in pack `features.*`. `features.waitlist` and
`features.operatorCalendarCrud` are optional switches; `features.customerAccounts`
is retained only as a literal-true compatibility field for the baseline surface.

The distinction is where the code lives, not who wants a toggle:

- Code in the generated app → `extension.config.ts`, default off. Never touch the
  pack schema.
- Code in `template/` → a kit-core `features.*` flag, and adding one is a kit
  change: `inject.mjs` validation, the emitted `DomainConfig` type, and
  `template/packages/backend/domain.config.ts` move together. Optional
  capabilities default off; baseline capabilities use a compatibility literal
  such as `customerAccounts: true`.

An extension may not promote itself into `features.*` by moving its own code into
`template/`; template seam hardening still requires proof that the seam belongs in
the kit.

### Named Hook Rules

Prefer existing hooks. If a new hook is unavoidable, name it
`on<ConcreteDomainEvent>`, export it from the feature module or
`convex/engine/<feature>.ts`, import it at the concrete mutation/action boundary
only, and pass `ctx` plus a narrow payload. Do not introduce a generic event bus,
generic registry, or plugin framework.

### Audit and mail extension points

Audit entries must be deduped at the feature boundary before side effects. Mail
extensions must register a specific mail kind, keep recipient data within the
existing notification model unless a proof shows otherwise, and preserve the
PublicContext/InternalContext split. Do not expand customer PII to make an
extension easier.

### SKIP-Aware QA Gate Rules

Use the next integer after the generated app's last `QaResult` id, add
`results.push(await qa<Feature>Gate())` after adjacent gates, and write a JSON
artifact in the runner artifact directory whenever the toggle is on. When the
toggle is off, return deterministic `SKIP` before side effects. When the toggle
is on, run real assertions; missing env or broken setup is `FAIL`, not `SKIP`.
A deterministic physical impossibility may be `SKIP` only with a specific
reason, following the cancel-window precedent.

### Must NOT

- Do not edit core engine modules such as `availability`, `policy`, or
  `lifecycle` directly for a feature extension.
- Do not change core state-transition rules to make one feature easier.
- Do not add tables before proving existing table reuse is insufficient.
- Do not expand customer PII or leak internal keys to public payloads.
- Do not use `thread_id` as auth.
- Do not create `extend.mjs`, registries, boilerplate generator paths, or a
  plugin framework for a single extension.
- Do not add extension toggles to `domain.config.ts`, `domain-pack.json`, or
  arbitrary pack `features.*` keys. Extension toggles live in
  `extension.config.ts`. Kit-core flags whose code ships in `template/` — the
  `features.waitlist` precedent — are not extension toggles and are added through
  the kit's own schema change.

### Reference implementation: M1 waitlist

The M1 waitlist pilot is the reference pattern, not a registry. The feature owns
`template/packages/backend/convex/engine/waitlist.ts`; core code calls named
hooks such as `onSlotFreed` from concrete mutation boundaries in
`template/packages/backend/convex/agentTools.ts`; the dedupe audit marker is
`waitlist.notified`; and `template/scripts/qa.ts` gate 9 demonstrates the
off-toggle SKIP and on-toggle PASS shape.

## Extension Pattern Gallery

Two extensions have followed the Code Extension Contract end to end. This gallery
documents them as case studies — showing that the contract's five required fields
work in practice — not as a reusable pattern, registry, or framework. Each case
below records how those five fields were satisfied.

### Case study: M1 waitlist (kit reference implementation)

Waitlist is the in-kit reference. Its files ship in `template/`, so every path and
symbol below resolves against this repository.

- **Invariant inheritance** — the feature inherits the Session Rules rather than
  overriding them: `onSlotFreed` never rewrites the core state-transition rules,
  and it leans on `isActiveReservation` from
  `template/packages/backend/convex/engine/lifecycle.ts`, which returns `false` for
  a `waitlisted` row. `waitlist.ts` itself neither imports nor calls that function;
  the collision engine
  (`template/packages/backend/convex/engine/availability.ts`) is what treats a
  waitlisted row as inactive rather than as a booking collision, and the cancel
  boundary in `template/packages/backend/convex/agentTools.ts` uses the same
  function to decide whether a freed slot was active.
- **Feature-owned module** — the entire feature lives in
  `template/packages/backend/convex/engine/waitlist.ts`; core modules gain no
  waitlist branches of their own.
- **Named hook** — core code reaches the feature through the single named
  `onSlotFreed(ctx, slot)` hook, imported into
  `template/packages/backend/convex/agentTools.ts` and called from its three
  concrete mutation boundaries: `cancelReservation` (only when the cancelled
  reservation freed an active slot, per `isActiveReservation`), plus
  `rescheduleReservation` and `expireReservation`, which each call it
  unconditionally with the freed slot. No generic event bus or dispatch layer is
  introduced.
- **Off-default toggle** — `features.waitlist` in
  `template/packages/backend/domain.config.ts` defaults to `false`, and
  `onSlotFreed` returns immediately when it is off, so the behavior is opt-in.
- **SKIP-aware QA gate** — `template/scripts/qa.ts` gate 9 returns a deterministic
  `SKIP` when the toggle is off and, when on, runs real saturation and notify
  assertions, writes `09-waitlist.json`, and returns `PASS`; a missing Convex URL
  throws (`FAIL`), never `SKIP`.

The behavior is deliberately notify-only: the hook inserts a `waitlist.slotOpened`
chat event, schedules one `reservation.waitlist_opened` mail, and dedupes on the
`waitlist.notified` audit marker — it never confirms or holds a slot. This is a
documented case study, not a registry, framework, or reusable extension generator.

### Case study: M2 no-show (external blind proof)

No-show was built by a fresh agent working from the Code Extension Contract text
alone, in a separate showcase run. Its generated files are
**not shipped in this repository**; they live in the showcase run at
`$JEOMWON_SHOWCASE_ROOT/_runs/m2-salon-no-show-20260709-000938` (locally observed
as `~/dev/side/jeomwon-showcase/_runs/m2-salon-no-show-20260709-000938`). The
paths below are relative to that run root and are quoted as code, never linked.

- **Invariant inheritance** — the feature inherits the Session Rules:
  `markReservationNoShow` in `packages/backend/convex/engine/noShow.ts` marks only
  a `confirmed` reservation, checks start-time passage by store-timezone calendar
  parts (not runtime `getHours`), dedupes on prior audit, and adds no fees,
  sanctions, or customer PII.
- **Feature-owned module** — the implementation is contained in
  `packages/backend/convex/engine/noShow.ts`; the admin surface only calls into it.
- **Named hook** — the concrete `packages/backend/convex/admin.ts` boundary calls
  the named `markReservationNoShow` and `noShowActionState` functions directly,
  with no event bus or generic dispatch.
- **Off-default toggle** — `extensionConfig.features.noShow` in
  `packages/backend/extension.config.ts` is enabled only when
  `JEOMWON_EXTENSION_NO_SHOW === "1"`, so it defaults off.
- **SKIP-aware QA gate** — `scripts/qa.ts` adds gate 10 (the next id after
  waitlist's 9): a deterministic `SKIP` when the toggle is off, and real
  mark/duplicate/future assertions with a `10-no-show.json` artifact when on;
  a toggle-on setup gap throws (`FAIL`), never `SKIP`.

Two kinds of evidence back this case and must not be conflated. Source-only review:
`.omo/evidence/m2-salon-no-show-code-review.md` records an APPROVE from source
inspection with no git and no live QA. Runtime proof: the QA manifest
`qa-artifacts/jeomwon-2026-07-08T15-39-28-778Z/manifest.json` shows gate 9 `SKIP`
and gate 10 `PASS`. Because the run is external, this stays a documented case
study, not a registry or framework, and no showcase code is copied into the kit.
