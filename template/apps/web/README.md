# Customer Web Surface (`apps/web`)

## Overview

This app is the customer-facing reservation surface: a public marketing landing
page plus a floating chat widget that runs the whole reservation conversation.
It renders from `domain.config` and the public Convex chat state; it never reads
admin or internal reservation data.

This README documents the UI surface as it exists today, so you can find which
component owns which behavior before extending. For how to change backend
reservation behavior safely, read
`../../packages/backend/convex/engine/README.md` for the engine primitives and
the Code Extension Contract in the jeomwon skill repository's `skill/REFERENCE.md`
for the extension sequence and Session Rules.

## Rendered surfaces

- `./src/app/layout.tsx` wraps every page in `ConvexClientProvider` and renders
  `Header`, the page `children`, and `Footer`. Page metadata (title, Open Graph,
  language) is derived from `domainConfig.storeName` and `domainConfig.locale`.
- `./src/app/convex-client-provider.tsx` provides the Convex React client and
  also mounts `CustomerChatWidget` globally, so the chat widget is present on
  every route.
- `./src/app/page.tsx` is the landing page. It renders services, business hours,
  hold minutes, and the cancel-window policy directly from `domainConfig`, plus a
  `ChatCtaButton`.

## Component inventory

Source: `./src/components/`.

| Component | Source | Role |
|---|---|---|
| `CustomerChatWidget` | `customer-chat-widget.tsx` | Floating chat surface (no props). Owns the reservation conversation: subscribes to public state, sends turns, and renders messages and the reservation card. |
| `ChatCtaButton` | `chat-cta-button.tsx` | Call-to-action button. On click it dispatches the `jeomwon:open-chat` window event instead of calling a handler prop. |
| `AnimatedText` | `animated-text.tsx` | Self-contained text-scramble presentational component. Available in the codebase but not currently mounted by any route. |
| `Header` | `header.tsx` | Public page header; embeds a `ChatCtaButton`. |
| `Footer` | `footer.tsx` | Public page footer. |
| `ConvexClientProvider` | `../app/convex-client-provider.tsx` | Convex React client provider; also the mount point for `CustomerChatWidget`. |

`CustomerChatWidget` renders these internal presentational components (defined in
the same file, not exported): `StoreAvatar`, `UserBubble`, `AssistantBubble`,
`SystemNotice`, and `ReservationCard`.

## Data contract

- `CustomerChatWidget` subscribes to reservation state with
  `useQuery(jeomwonConvex.chat.publicState, threadId ? { threadId } : "skip")` —
  a reactive Convex query, not a custom SSE or polling relay.
- It sends each customer turn with `POST /api/chat` (`{ thread_id, message }`).
  The widget relies on the reactive query for state, so it does not read the
  route's `GET` handler.
- `./src/app/api/chat/route.ts` runs on the Node.js runtime. `POST` validates the
  body through the backend boundary (HTTP 422 `invalid_chat_request` on malformed
  input) and runs one agent turn via `runAgentTurn`. `GET` returns `publicState`
  as JSON for non-reactive callers.
- `thread_id` is persisted in `localStorage` under `jeomwon_thread_id`. It is a
  continuity key only, never identity or authorization.

## Extension-agent consumption method

- The widget reads only the `PublicContext` fields exposed by `chat.publicState`.
  Keep public surfaces grep-clean of internal keys; never widen the widget to
  render `internalContext`, operator memos, risk signals, or raw Convex ids.
- Customer-visible copy (chat title, greeting, placeholder, status labels) comes
  from `domainConfig.copy` and the widget's Korean status map. Change copy through
  the domain pack, not by hardcoding new strings in the widget.
- To open the chat from a new entry point, dispatch the existing
  `jeomwon:open-chat` window event rather than lifting widget state.

## Must NOT

- Do not fetch or render admin or internal reservation data on this surface.
- Do not replace the Convex reactive query with a custom SSE or polling relay.
- Do not treat `thread_id` as authentication.
