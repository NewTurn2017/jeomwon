// Who is asking, and which thread are they allowed to touch.
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
import { getAuthUserId } from "@convex-dev/auth/server";
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

export function viewerRolePolicy(
  user:
    | { readonly email?: string; readonly isAnonymous?: boolean }
    | null
    | undefined,
  allowlist: readonly string[],
): "operator" | "customer" {
  return operatorRolePolicy(user, allowlist) ? "operator" : "customer";
}

export async function isOperator(ctx: AuthCtx, userId: Id<"users">) {
  const allowlist = adminEmailAllowlist();
  const user = await ctx.db.get(userId);
  return viewerRolePolicy(user, allowlist) === "operator";
}

/**
 * Which thread is this caller allowed to act on?
 *
 * The argument is optional because the server derives the caller's own thread;
 * when present it is checked, not trusted.
 *
 * Operators do not get a public-thread exception. Admin customer actions call
 * the deep lifecycle helper only after `ensureAdmin`, with an explicit actor and
 * target thread, so the public chat guard remains customer-exact.
 */
export async function resolveCustomerThreadId(
  ctx: AuthCtx,
  requestedThreadId: string | null | undefined,
) {
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

  throw new Error("thread_forbidden");
}

/**
 * The additive guard for the existing public chat functions: they already take a
 * `threadId`, so rather than restructuring them, assert that the one they were
 * handed is the caller's own.
 */
export async function assertThreadAccess(ctx: AuthCtx, threadId: string) {
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
