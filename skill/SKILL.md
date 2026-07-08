---
name: jeomwon
description: Build a Jeomwon reservation SaaS project from a domain interview. Use when creating, scaffolding, injecting, or verifying a jeomwon project from a domain pack JSON, especially for reservation desks, services, seats, rooms, day-unit stays, customer support chat, Convex setup, or admin widgets.
---

# Jeomwon

Use this skill to turn one operational reservation domain into a generated Jeomwon project: an AI 점원이 가게 프런트를 지키는 agentic CS SaaS kit. Keep the conversation narrow: ask only for facts that affect routing, policy, availability, widget choice, feature toggles, or customer-facing copy.

## Fast Path

1. Interview for a single domain pack JSON.
2. Scaffold from one of two starts:
   - Repo clone: run `bun skill/scripts/scaffold.mjs <target-dir> <project-name>` from the kit repo; it uses local `template/`.
   - Skill-only install: run the installed `scripts/scaffold.mjs`; when local `template/` is absent it downloads the GitHub tarball (`JEOMWON_TEMPLATE_REF`, default `main`; `JEOMWON_TEMPLATE_ARCHIVE` for offline tarballs).
3. Save the domain pack JSON and run `bun skill/scripts/inject.mjs <target-dir> <domain-pack.json>`.
4. Tell the user to run `bun setup` inside the generated project for Convex, Google OAuth, Resend, OpenAI, and optional Polar.
5. Run `bun skill/scripts/verify.mjs <target-dir>` when local dependencies are cached or install is allowed. Run with `JEOMWON_QA_BASE_URL=http://localhost:3001` only after Convex/web are running.

## Interview Order

Ask in this order and stop as soon as the domain pack can be formed:

1. **Domain**: service boundary, store name, timezone, locale, customer goal, staff responsibility.
2. **Resources/Services**: resources, resource kind, services, service labels, slot unit, duration, price, capacity assumptions.
3. **Policies**: cancellation window, hold duration, confirmation rule, blackout dates, escalation condition.
4. **Widget**: choose `calendar` for time/date booking or `seatGrid` for seat/space maps.
5. **Features**: `email`, `polar`, and `notificationEmail`.
6. **Copy**: short Korean customer-facing text for greeting, refusal, confirmation, cancellation, hold expiry, next steps, and policy summary.

## Output Contract

The Fast Path interview must converge to exactly one domain pack JSON object. Its shape is defined in [REFERENCE.md](REFERENCE.md) and examples live in [EXAMPLES.md](EXAMPLES.md). During Fast Path pack/inject generation, do not generate domain-specific code outside that pack; `inject.mjs` is the only path that writes domain-specific names into the project.

For a follow-up request to extend code in a generated project or harden a template seam, first use the [REFERENCE.md](REFERENCE.md) `Code Extension Contract`. Keep `inject.mjs` for domain-pack regeneration only.

## Script Contract

- `scaffold.mjs` copies `template/` into a target directory, excludes dependency/build/env artifacts, replaces `@jeomwon/` with the project npm scope, and prints the next commands.
- `inject.mjs` validates the domain pack JSON, writes `packages/backend/domain.config.ts`, and regenerates the resource seed mutation.
- `verify.mjs` runs offline install, typecheck, lint, build, and optionally QA when `JEOMWON_QA_BASE_URL` points at a running generated web app.

## Guardrails

- Never edit `upstream/v1/` or `docs/` while using this skill.
- Never hardcode domain proper nouns outside the domain pack JSON or files generated from it.
- Keep secrets out of the domain pack. Setup credentials belong in `bun setup` only.
- Treat `thread_id` as an anonymous conversation key, not authentication.
- For `slotUnit: "day"`, collect check-in/check-out times and labels in `service.dayUnit`.
