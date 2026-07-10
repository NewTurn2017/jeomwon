---
name: jeomwon
description: Build a Jeomwon reservation SaaS project from a domain interview. Use when creating, scaffolding, injecting, or verifying a jeomwon project from a domain pack JSON, especially for reservation desks, services, seats, rooms, day-unit stays, customer support chat, Convex setup, or admin widgets.
---

# Jeomwon

Use this skill to turn one operational reservation domain into a generated Jeomwon project: an AI 점원이 가게 프런트를 지키는 agentic CS SaaS kit. Keep the conversation narrow: ask only for facts that affect routing, policy, availability, widget choice, feature toggles, or customer-facing copy.

## Fast Path

1. Interview for a single domain pack JSON and save it to a file.
2. Bootstrap the deterministic pipeline (scaffold → inject → offline verify) with one command:
   - Repo clone: `bun skill/scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>` from the kit repo; it uses local `template/`.
   - Skill-only install: `bun scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>` from the installed skill; when local `template/` is absent scaffold downloads the GitHub tarball (`JEOMWON_TEMPLATE_REF`, default `main`; `JEOMWON_TEMPLATE_ARCHIVE` for offline tarballs).
   Bootstrap is offline-only: it strips an ambient `JEOMWON_QA_BASE_URL` from its verify step so it never runs live QA, and it never runs `bun setup`. On success it prints the generated path and the next steps below; on the first stage failure it stops and prints that stage's exact rerun command.
3. Tell the user to run `bun setup` inside the generated project for Convex, Google OAuth, Resend, OpenAI, and optional Polar. This is a separate interactive step — bootstrap does not run it.
4. Tell the user to run `bun run qa` (live 9-gate) after Convex/web are running. This is also separate from bootstrap.

Use the individual `scaffold.mjs`, `inject.mjs`, and `verify.mjs` commands (Script Contract below) for retries, partial reruns, and debugging after a bootstrap failure.

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

- `bootstrap.mjs <target-dir> <project-name> <domain-pack.json>` is the standard one-command deterministic path — a thin sequencer that runs `scaffold.mjs`, then `inject.mjs`, then `verify.mjs`, resolving them as its own siblings so it works from a repo clone or an installed skill. The first argument is the target, the last is the pack, and the words between are the project name. It is offline-only: it deletes an ambient `JEOMWON_QA_BASE_URL` from the verify step and never runs live QA, and it never runs `bun setup`. On the first stage failure it stops, names the stage, and prints one `Recovery: bun <script> ...` line for that stage; it never deletes a target, so a non-empty or partial target must be inspected and removed manually before rerunning. On success it prints the generated path and the `bun setup` → `bun run qa` next steps as guidance only (it does not run them).
- `scaffold.mjs` copies `template/` into a target directory, excludes dependency/build/env artifacts, replaces `@jeomwon/` with the project npm scope, and prints the next commands.
- `inject.mjs` validates the domain pack JSON, writes `packages/backend/domain.config.ts`, and regenerates the resource seed mutation.
- `verify.mjs` runs offline install, typecheck, lint, build, and optionally QA when `JEOMWON_QA_BASE_URL` points at a running generated web app.
- The individual `scaffold.mjs`, `inject.mjs`, and `verify.mjs` commands stay the retry, partial-execution, and debugging entrypoints — run them directly to rerun a single stage after a bootstrap failure.

## Guardrails

- Never edit `upstream/v1/` or `docs/` while using this skill.
- Never hardcode domain proper nouns outside the domain pack JSON or files generated from it.
- Keep secrets out of the domain pack. Setup credentials belong in `bun setup` only.
- Treat `thread_id` as an anonymous conversation key, not authentication.
- For `slotUnit: "day"`, collect check-in/check-out times and labels in `service.dayUnit`.
