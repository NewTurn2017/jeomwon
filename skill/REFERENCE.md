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

## Injection Contract

`scripts/inject.mjs <target-dir> <domain-pack.json>` validates and writes only generated domain artifacts:

- `packages/backend/domain.config.ts`: typed config and duration helpers.
- `packages/backend/convex/jeomwonSeed.ts`: deterministic resource seed mutation driven by `domainConfig.resources`.

Validation gates:

- All required top-level keys are present; unknown top-level keys fail.
- `domainKey`, resource keys, and service keys are slug-like and unique.
- Every service `resourceKind` has at least one matching resource.
- Every weekday is present and each open/close time is `HH:MM`.
- `slotUnit: "day"` requires `dayUnit.checkInTime`, `dayUnit.checkOutTime`, `dayUnit.checkInLabel`, and `dayUnit.checkOutLabel`.
- `durationMinutes` is positive when present; day services normally omit it.
- `confirmationRequired` must be `true`.
- `notificationEmail` must be an email-like string.
- `features.waitlist` is optional for backward compatibility and defaults to
  `false`; when present it must be boolean.
- Every copy field is a non-empty string.

## Verification Gates

Run these gates in order:

1. Template regression: in `template/`, run `bun install --frozen-lockfile --offline`, `bun run typecheck`, `bun run lint`, and `bun run build`.
2. Scaffold: `bun skill/scripts/scaffold.mjs samples/pension-stay "Pension Stay"`.
3. Inject: `bun skill/scripts/inject.mjs samples/pension-stay <pension-domain-pack.json>`.
4. Generated verification: `bun skill/scripts/verify.mjs samples/pension-stay`.
5. Convex/web QA: run `bun setup`, start Convex and web, then rerun verify with `JEOMWON_QA_BASE_URL=http://localhost:3001` so `bun run qa` executes.

`verify.mjs` never fetches provider secrets. It uses Bun offline install, builds the email package normally, builds the Next app/web surfaces with `next build --webpack` for sandbox compatibility, and skips QA unless a running web surface is explicitly supplied.

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
because `inject.mjs` writes only `domain.config.ts`, the resource seed, and email
samples through paths such as `writeProjectFile` and `renderDomainConfig`. It
keeps the pack schema strict and adds no new machinery.

Rejected: an inject preservation block. It would add generator complexity and
turn a full-file generated artifact into a partially hand-owned file.

Rejected: adding toggles to the pack schema or a `features.noShow` key. Current
top-level and feature exact-key validation rejects unknown pack keys unless the
generator/schema changes, and it would make a generated-app extension depend on
pack regeneration. `domain.config.ts` and `domain-pack.json` are not extension
toggle surfaces because `inject.mjs` overwrites generated domain config and the
pack validator enforces exact-key inputs.

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
  arbitrary pack `features.*` keys.

### Reference implementation: M1 waitlist

The M1 waitlist pilot is the reference pattern, not a registry. The feature owns
`template/packages/backend/convex/engine/waitlist.ts`; core code calls named
hooks such as `onSlotFreed` from concrete mutation boundaries in
`template/packages/backend/convex/agentTools.ts`; the dedupe audit marker is
`waitlist.notified`; and `template/scripts/qa.ts` gate 9 demonstrates the
off-toggle SKIP and on-toggle PASS shape.
