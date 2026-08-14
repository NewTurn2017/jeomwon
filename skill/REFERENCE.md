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
  schemaVersion: 1;
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
    noShow?: boolean;
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
    noShow?: string;
  };
};
```

### Kit-core feature flags

Canonical packs declare `schemaVersion: 1`. The reader also accepts only an exact schemaVersion-less legacy v0 shape and purely migrates it to v1; an explicit unsupported version fails closed.

`features.*` is a closed set owned by the kit: every flag's code ships in
`template/`. `waitlist`, `operatorCalendarCrud`, and `noShow` are optional booleans that default to `false`.

- `waitlist` — notify-only waitlist on freed slots (`convex/engine/waitlist.ts`).
- `customerAccounts` — compatibility literal for baseline customer login and
  self-service surfaces. Omission materializes `true`; explicit `true` is accepted.
  Explicit `false` fails with
  `features.customerAccounts=false is no longer supported; omit it or set true`.
  The admin allowlist is required and empty values deny admin access.
- `operatorCalendarCrud` — operator create/edit/cancel from the admin calendar.
  Requires `adminWidget: "calendar"`; `seatGrid` has no operator CRUD surface.
  Server-side allowlist, origin, time, and reservation identity remain authoritative;
  QA gate 10 proves denial boundaries, not successful Google-operator CRUD.
- `noShow` — authenticated operator transition of past confirmed/rescheduled rows
  to the eleventh status, `no_show`. It is off by default and requires non-empty
  `copy.noShow` only when enabled.

## Bootstrap Contract

`scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>` is the standard one-command deterministic path. It is a thin sequencer with no domain logic of its own: it resolves `scaffold.mjs`, `inject.mjs`, and `verify.mjs` as its own siblings (so it runs identically from a repo clone or a skill-only install) and invokes them in order with the current runtime. The repo form is `bun skill/scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>`; the installed-skill form is `bun scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>`.

- Arguments: the first is the target directory, the last is the domain-pack JSON, and everything in between is the scaffold project name (one quoted argument or several bare words). Target and pack are resolved against the invocation directory. Every script accepts `--help` and `--lang ko|en|auto`.
- Locale: explicit `--lang` wins, followed by `JEOMWON_CLI_LANG`, `LC_ALL`, `LC_MESSAGES`, `LANG`, then English. `auto` resumes that environment chain. Bootstrap passes the resolved language to all children.
- Stages: ASCII codes `stage_scaffold` → `stage_inject` → `stage_verify`. There is no separate install step; `verify.mjs` owns install, typecheck, lint, tests, and builds in that order.
- Terminal: any presence of `NO_COLOR`, including an empty value, disables ANSI. ANSI is stripped before measuring text; Korean/CJK code points occupy two columns.
- Offline-only: bootstrap deletes an ambient `JEOMWON_QA_BASE_URL` only from the verify child and never passes `--qa`, so its verify reports a QA skip. It never runs `bun setup` and never runs live QA.
- Failure: it stops at the first failing stage, preserves child exit codes and maps SIGINT to 130, and prints exactly one `[RECOVERY recovery]` JSON argv block beginning with the public `bun` token. It never deletes a target.
- Success: standalone scaffold prints one next-step block; bootstrap suppresses that block and prints exactly one `[NEXT next_steps]` block containing `cd <target>`, `bunx convex login`, `bun setup`, then `bun run qa` as guidance only.

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
- Canonical input has `schemaVersion: 1`; schemaVersion-less legacy v0 input is
  migrated without side effects, while explicit unsupported versions fail.
- `features.waitlist`, `features.operatorCalendarCrud`, and `features.noShow` are
  optional and default to `false`; when present each must be boolean.
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
3. Convex/authenticated-app QA (one command): after `bun setup` provisions the dev Convex deployment (and `bunx playwright install chromium` prepares the local browser once), run `bun run qa` in the generated project (or in `template/`). `scripts/qa-local.ts` requires the app Convex URL to exactly match the verified backend `dev:` deployment, injects that canonical URL into every child, temporarily enables anonymous customer auth with a nonmatching reserved `.invalid` admin allowlist, boots `apps/app` in mock runtime, signs in isolated browser identities A/B, runs QA contract v2's exact 12 gates in order, and restores the app/browser/env lifecycle. Gates 9, 10's CRUD subcase, and 12 SKIP only for their named off-toggle; enabled setup failures are FAIL. Deterministic gate 10 proves that the authenticated customer identity is denied operator-only routes and mutations. Successful Google operator CRUD is a separate maintainer-owned live smoke and remains BLOCKED until explicitly authorized; it never requires operator email/storage-state inputs for the exact 12-gate command. The runner forces email capture, so no real mail is sent.

`verify.mjs` (bootstrap's third stage) is the offline gate and never fetches provider secrets. It runs exact `bun install --frozen-lockfile --offline`, then typecheck, lint, and `bun test` before building the email package and the Next app/web surfaces with `next build --webpack`. It prints `VERIFY PASS` only after every selected gate succeeds and skips QA unless a running authenticated app surface is explicitly supplied through `JEOMWON_QA_BASE_URL`. That PASS is not live QA, deployment, or provider proof. CI uses Bun 1.3.14 and exact `bun install --frozen-lockfile` (network may be available), then typecheck/lint/tests and all three builds. The live authenticated-app 12-gate QA remains the maintainer-owned dev-deployment path.

### Recovery / partial execution

Bootstrap composes three lower-level commands; run them directly to rerun a single stage after a failure or to execute the pipeline partially:

- Scaffold: `bun skill/scripts/scaffold.mjs <target-dir> "Pension Stay"`.
- Inject: `bun skill/scripts/inject.mjs <target-dir> <pension-domain-pack.json>`.
- Generated verification: `bun skill/scripts/verify.mjs <target-dir>`.

## Machine-checked commands

<!-- doc-contract:commands:start -->
| Script ID | Help usage |
|---|---|
| preflight | `bun preflight.mjs <target-dir> <project-name> <domain-pack.json> [--lang ko\|en\|auto]` |
| bootstrap | `bun bootstrap.mjs <target-dir> <project-name> <domain-pack.json> [--lang ko\|en\|auto]` |
| scaffold | `bun scaffold.mjs <target-dir> <project-name> <domain-pack.json> [--lang ko\|en\|auto]` |
| inject | `bun inject.mjs <target-dir> <domain-pack.json> [--lang ko\|en\|auto]` |
| verify | `bun verify.mjs <target-dir> [--qa] [--lang ko\|en\|auto]` |
| warm-cache | `bun warm-cache.mjs [--lang ko\|en\|auto]` |
<!-- doc-contract:commands:end -->

Canonical template install is `bun install --frozen-lockfile`; offline verify uses `bun install --frozen-lockfile --offline`. Both use the project pin `bun@1.3.14`.

<!-- doc-contract:execution:start -->
| Context | Command |
|---|---|
| CI / Install dependencies | bun install --frozen-lockfile |
| CI / Run typecheck | bun run typecheck |
| CI / Run linter | bun run lint |
| CI / Run tests | bun test |
| CI / Build email | bun run build:email |
| CI / Build app | bun run build:app |
| CI / Build web | bun run build:web |
| offline verify / install | bun install --frozen-lockfile --offline |
<!-- doc-contract:execution:end -->

## Release Identity

The project manifest carries template schema 1/API 1 and compatibility identities domainPackWriter 0, capabilitySchema 1, setupSchema 2, and qaContract 2. Canonical packs are schema v1. Successful publication writes receipt v3 last, binding project/template source, release contract hashes, canonical pack, and managed outputs. This checksum contract detects local drift but is not cryptographic authenticity against coordinated source-and-receipt replacement.

The static capability manifest declares ten implemented or QA-proven capabilities. Accounts, account deletion, and reservation-email delivery ledger/capture are core. Polar covers two separate integrations: `billing.accountSubscription.polar` for an account's SaaS subscription and `payment.reservationDeposit` for one-time deposit orders, both `implemented` with test-level evidence and no provider round trip. Per-reservation charges, partial-refund accounting, and a payment ledger remain absent. Capability maturity never upgrades from a prose claim.

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

Every scaffold and bundled archive contains
`packages/backend/extension.config.ts`. It is project-owned source: scaffold
copies it once, while `inject.mjs` never rewrites it, hashes it as a managed
output, or restores it from a pack. Its schema is closed at version 1 and starts
with `features: {}`, so every generated-app extension is off by default.

Before importing an extension module or running its QA gate, validate the config
through its real module boundary:

```sh
bun -e 'import "./packages/backend/extension.config.ts"'
```

Unsupported schema versions fail with `extension_schema_unsupported`; unknown
feature keys fail with `extension_feature_unsupported`. To add a generated-app
feature, replace the closed empty `ExtensionFeatures` shape with one explicit
readonly optional key, default that key to `false`, and extend the direct
validation branch for that same key. The feature module and its QA gate import
the named setting directly. They must not enumerate settings or dispatch from
them.

Rejected: an inject preservation block. It would turn a generated artifact into
a partially hand-owned file. Rejected: pack-driven extension toggles. Both
`domain.config.ts` and `domain-pack.json` are injector-owned, while extension
source must survive v0 and v1 reinjection byte-for-byte.

### Extension toggles vs kit-core feature flags

`extension.config.ts` is only for code added to one generated app. Code shipped
by the kit uses the closed pack `features.*` contract instead. In particular,
no-show is kit core and remains `domainConfig.features.noShow`; it must not move
into extension config. Waitlist and operator calendar CRUD follow the same
kit-owned rule, while customer accounts remain a literal-true baseline field.

The distinction is where the code lives:

- Generated-app-only code: one explicit `extension.config.ts` key, readonly and
  off by default; never change the pack schema.
- Code in `template/`: one explicit pack schema change with injector validation,
  emitted `DomainConfig`, capability metadata, and the template default moving
  together.

Moving extension code into `template/` merely to obtain a pack flag is not a
promotion path; kit inclusion still requires independent proof.

### Reservation deposits (Polar one-time orders)

`packages/backend/convex/deposits.ts` is kit-owned and deliberately separate
from the account subscription in `subscriptions.ts`. It is reachable only when
the pack sets `features.polar` and the Convex deployment has
`POLAR_DEPOSIT_PRODUCT_ID` pointing at a one-time product.

- `startDepositCheckout` validates the return origin and success URL against
  `JEOMWON_APP_ORIGINS`, has `claimDepositCheckout` prove the caller owns a
  still-payable reservation, and puts the reservation document id on checkout
  metadata server-side.
- `order.created` and `order.refunded` arrive on the existing `/polar/events`
  route and reach `recordDepositOrder`, which writes `reservations.deposit` plus
  one audit event. A repeat delivery of the same order and state is a no-op, and
  an order without this domain's metadata is ignored.
- `depositSnapshot` is the read seam for a customer surface.

Extending it: keep the charged amount in the Polar product, never in the pack;
read state through `depositSnapshot` instead of the reservation document; and
treat a missing `deposit` field as "no deposit taken", not "unpaid". A
per-reservation amount, partial-refund accounting, and an operator refund action
are absent on purpose — add them as feature-owned modules with their own toggle
and QA gate rather than by widening the webhook handler.

### Feature-owned modules and direct commands/hooks

Keep each implementation in `convex/engine/<feature>.ts`. Export a concrete
named command for an operator action (`markReservationNoShow`,
`createOperatorSession`) or a named `on<ConcreteDomainEvent>` hook for a core
boundary (`onSlotFreed`). The authenticating mutation/action imports that symbol
directly and passes `ctx` plus the narrowest payload. The server derives request
time, slot endings, ownership/origin, recipients, public context, and provider
intent; clients never supply authoritative versions of those values.

Existing examples are deliberately different and stay feature-owned:

- `waitlist.ts` exports `onSlotFreed` and dedupes `waitlist.notified` before its
  chat and mail intents.
- `noShow.ts` exports `markReservationNoShow` and owns one terminal audit/state
  transition with no email, waitlist, payment, or chat side effect.
- `adminBooking.ts` exports direct create/update/cancel commands, stamps operator
  ownership server-side, and calls `onSlotFreed` only from concrete freed-slot
  boundaries.

### Audit, dedupe, and provider intent

Check the feature-specific audit marker before writes or side effects, append one
audit event in the authoritative mutation, and schedule each provider effect as
a narrow named intent only after state succeeds. Email uses a specific mail kind
and reservation identifier so the server-side scheduler derives the recipient;
never pass a client-owned address or raw provider payload. Apply the same rule to
future providers and preserve the PublicContext/InternalContext split.

### Forbidden registry mechanics

Do not add a runtime plugin loader, feature registry, event bus, hook array,
string-based dispatch, dynamic import, filesystem/module scanner, or generated
extension boilerplate. Capability metadata and extension config are validation
inputs, never runtime discovery sources.

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

The shipped feature-owned modules below are concrete boundary examples, not a
reusable pattern, registry, or framework. Their settings remain kit-core pack
flags; generated-app extensions follow the same direct-call discipline but use
the project-owned extension config.

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

### Case study: no-show (kit-core direct command)

No-show now ships in `template/packages/backend/convex/engine/noShow.ts`. The
admin mutation imports `markReservationNoShow` directly; there is no dispatch
layer. The command accepts the server-loaded reservation, rejects disabled,
future, repeated, and ineligible transitions, writes one terminal audit/state
change, and refreshes the existing thread's public context. It deliberately
creates no email, waitlist, payment, scheduler, or chat side effect.

Its off-default switch is `domainConfig.features.noShow`, because the module is
kit core. `extension.config.ts` remains empty in the canonical template and must
never acquire a no-show key. QA evidence contract v2 appends stable gate 12 and
keeps v1 artifact bundles validator-compatible. Gate 12 writes
`12-no-show.json`: off is the exact no-mutation reason `features.noShow=false`;
on drives a past confirmed fixture through the authenticated app bridge and the
deployed lifecycle, rejects future/repeat/ineligible writes, and proves email,
waitlist, and chat-event counts unchanged. Because Polar component internals are
not part of the app DataModel, the nearest shipped authoritative durable account-
billing boundary is observed instead: redacted counts of
`accountDeletionJobs.phase` plus `subscriptionCompleted`, before and after.
Real Google-operator success remains separate maintainer-owned operational smoke.
