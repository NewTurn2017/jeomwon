// Who is asking, and which thread are they allowed to touch.
// (`features.customerAccounts`.)
//
// ── The hole this closes ─────────────────────────────────────────────────────
// `chat:publicState` and every `agentTools:*` mutation are PUBLIC Convex
// functions whose only scoping is a caller-supplied `threadId` string. That is
// fine while threads are anonymous random UUIDs: the id is an unguessable bearer
// token, and there is no account to impersonate.
//
// It stops being fine the moment threads are derived from an account. A derived
// thread is STABLE and PREDICTABLE, and `admin:dashboardSnapshot` already hands
// every row's `threadId` to any operator surface. So a derived thread that is
// only checked in the Next route is a WORSE secret than the random UUID it
// replaced: anyone who can call Convex directly — the functions are public, the
// deployment URL ships to the browser — could pass someone else's thread string
// and read their transcript or cancel their bookings.
//
// The fix is not to hide the thread id. It is to stop trusting it. Below, the
// caller's thread is DERIVED from the authenticated identity and the argument is
// merely compared against it. `threadId` becomes a routing key, never an
// authorization signal — the same rule `engine/adminBooking` applies to `origin`.
//
// With `features.customerAccounts` off, every guard here is a no-op and the
// anonymous flow behaves exactly as it did before this file existed.
import { getAuthUserId } from "@convex-dev/auth/server";
import { domainConfig } from "../../domain.config";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

/**
 * The one place a customer's thread id is minted.
 *
 * Derived, not stored: no new table, no column, nothing to backfill. Because the
 * server can always recompute it from the authenticated user, an incoming
 * `threadId` never has to be believed — it only has to match.
 *
 * Domain-neutral by construction: a user id, not a domain noun.
 */
export function customerThreadId(userId: Id<"users">) {
  return `user:${userId}`;
}

export function assertCustomerAccountsEnabled() {
  if (!domainConfig.features.customerAccounts) {
    throw new Error("customer_accounts_disabled");
  }
}

// The operator allowlist lives in the Convex deployment env, not in the pack:
// who staffs the desk is a deployment fact, not a domain fact.
//
// Read INSIDE the guard, never cached at module scope: an authorization decision
// must not be frozen into a warm isolate, so `npx convex env set
// JEOMWON_ADMIN_EMAILS ...` binds on the next call instead of racing the module
// cache.
export function normalizeAdminEmailAllowlist(raw: string | undefined) {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  ];
}

export function adminEmailAllowlist() {
  return normalizeAdminEmailAllowlist(process.env.JEOMWON_ADMIN_EMAILS);
}

/**
 * Is this signed-in user an operator? The non-throwing form of `ensureAdmin`'s
 * rule, shared so the two guards can never drift apart:
 *
 * - Missing identity, anonymous identity, missing email, or empty allowlist:
 *   never an operator.
 * - Otherwise: only a normalized exact email match is an operator.
 */
export function operatorRolePolicy(
  user:
    | { readonly email?: string; readonly isAnonymous?: boolean }
    | null
    | undefined,
  allowlist: readonly string[],
) {
  if (!user || user.isAnonymous === true || allowlist.length === 0) {
    return false;
  }

  const email = user.email?.trim().toLowerCase();
  return email !== undefined && email.length > 0 && allowlist.includes(email);
}

export async function isOperator(ctx: AuthCtx, userId: Id<"users">) {
  const allowlist = adminEmailAllowlist();
  const user = await ctx.db.get(userId);
  return operatorRolePolicy(user, allowlist);
}

/**
 * Which thread is this caller allowed to act on?
 *
 * Flag off: whatever they asked for — today's anonymous behavior, unchanged.
 * Flag on: their OWN derived thread. The argument is optional precisely because
 * the server does not need it; when present it is checked, not trusted.
 *
 * An operator may still name another thread. That is not a backdoor: the same
 * person can already read every transcript through `admin:dashboardSnapshot`,
 * and `admin:rescheduleCustomerReservation` / `admin:deleteSession` reach the
 * chat mutations by `ctx.runMutation`, which carries the OPERATOR's identity
 * into a CUSTOMER's thread. Without this branch, turning both flags on would
 * break the operator board.
 */
export async function resolveCustomerThreadId(
  ctx: AuthCtx,
  requestedThreadId: string | null | undefined,
) {
  if (!domainConfig.features.customerAccounts) {
    // Only a MISSING thread is an error here — `publicState` made the argument
    // optional, and with the flag off there is no identity to derive one from.
    // An *empty* string is passed through untouched rather than rejected: the
    // validator has always accepted it, so rejecting it now would be a behavior
    // change on the anonymous path, which must stay identical.
    if (requestedThreadId === undefined || requestedThreadId === null) {
      throw new Error("thread_id_required");
    }

    return requestedThreadId;
  }

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    // Fail CLOSED. If the chat path cannot forward the caller's token to Convex,
    // the feature stops working loudly instead of silently serving whatever
    // thread the argument named. See the "Where identity enters" note in
    // engine/README.md — a bypass here re-opens the entire hole.
    throw new Error("auth_required");
  }

  const ownThreadId = customerThreadId(userId);
  if (!requestedThreadId || requestedThreadId === ownThreadId) {
    return ownThreadId;
  }

  if (await isOperator(ctx, userId)) {
    return requestedThreadId;
  }

  throw new Error("thread_forbidden");
}

/**
 * The additive guard for the existing public chat functions: they already take a
 * `threadId`, so rather than restructuring them, assert that the one they were
 * handed is the caller's own.
 */
export async function assertThreadAccess(ctx: AuthCtx, threadId: string) {
  if (!domainConfig.features.customerAccounts) {
    // A pure no-op, not even a validity check: with the flag off these mutations
    // must behave exactly as they did before this guard existed. No auth lookup,
    // no extra throw, no new failure mode for the nine embedded packs.
    return;
  }

  // These mutations act on `threadId` itself, so it is not enough that the caller
  // is ALLOWED some thread — the thread they handed us must BE that thread.
  // resolveCustomerThreadId is deliberately lenient (a falsy id resolves to the
  // caller's own thread) because `publicState` consumes its return value; these
  // mutations consume the raw argument, so an empty string that merely "resolves"
  // would still write to the shared "" bucket. Require an exact match.
  const resolved = await resolveCustomerThreadId(ctx, threadId);
  if (resolved !== threadId) {
    throw new Error("thread_forbidden");
  }
}
