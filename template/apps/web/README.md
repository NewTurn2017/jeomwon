# Customer Web Surface (`apps/web`)

## Overview

This app is the public, static marketing surface. It renders store guidance from
`domain.config` and links customers directly to the authenticated app login. It
does not connect to Convex or own reservation runtime behavior.

This README documents the UI surface as it exists today, so you can find which
component owns which behavior before extending. For how to change backend
reservation behavior safely, read
`../../packages/backend/convex/engine/README.md` for the engine primitives and
the Code Extension Contract in the jeomwon skill repository's `skill/REFERENCE.md`
for the extension sequence and Session Rules.

## Rendered surfaces

- `./src/app/layout.tsx` renders `Header`, the page `children`, and `Footer`.
  Page metadata (title, Open Graph, language) is derived from
  `domainConfig.storeName` and `domainConfig.locale`.
- `./src/app/page.tsx` is the landing page. It renders services, business hours,
  hold minutes, and the cancel-window policy directly from `domainConfig`.
- Reservation calls to action are plain links to
  `NEXT_PUBLIC_APP_URL/login`. `NEXT_PUBLIC_APP_URL` is required at build time
  and must use HTTP or HTTPS.

## Component inventory

Source: `./src/components/`.

| Component | Source | Role |
|---|---|---|
| `Header` | `header.tsx` | Public page header with a direct app-login CTA. |
| `Footer` | `footer.tsx` | Public page footer. |

## Data contract

- `domain.config` is the only reservation-domain input read by this surface.
- `NEXT_PUBLIC_APP_URL` is the only cross-surface runtime address.
- The authenticated app owns chat, customer state, and reservation mutations.

## Extension-agent consumption method

- Keep the service, policy, and business-hour guide derived from `domain.config`.
- Add reservation actions to `apps/app`, not this public surface.
- Keep every reservation CTA as a normal anchor to the app login.

## Must NOT

- Do not add Convex, agent, chat API, browser storage, or event-bus runtime here.
- Do not add an in-page fallback when the app URL is invalid or missing; builds
  must fail closed.
