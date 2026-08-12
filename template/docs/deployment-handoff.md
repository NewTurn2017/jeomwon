# Read-only deployment readiness handoff

`bun run deployment:check` validates a locally prepared production handoff. It
does not call Vercel, Convex, Google, Resend, Polar, DNS, or any other network
service. It cannot create accounts, change provider state, deploy, or prove that
a provider console currently matches the operator's attestation.

Production deployment remains outside this kit's automated scope. The output is
local evidence for the operator who owns those actions, not a deployment receipt.

## Run the checker

Create a private JSON input outside source control using
`scripts/fixtures/deployment-readiness-complete.json` as the shape, replace its
safe fixture values locally, then run:

```bash
bun run deployment:check -- \
  --input /private/path/deployment-readiness-input.json \
  --output-dir /private/existing/report-directory \
  --output deployment-readiness.json
```

`--output` must be a contained relative path under the existing trusted
`--output-dir`; absolute paths, traversal, missing directories, and symlinked
root/intermediate/leaf components are rejected. The output file must be new.
`--help` prints the CLI contract. A ready handoff exits 0 and prints
`DEPLOYMENT READINESS PASS`; incomplete or inconsistent input writes the same
redacted report, exits nonzero, and identifies only the responsible owner and
key. Remove both private files after the handoff.

The JSON report contains key names, presence booleans, SHA-256 digests, fixed
root/check identifiers, and a deterministic report hash. It never contains raw
environment values, email addresses, tokens, credentialed URLs, browser storage,
or provider payloads. Digests establish local input continuity; they do not
validate or reveal provider values.

## Fixed deployment roots

Use two separate Vercel projects:

| Surface | Vercel root | Runtime ownership |
|---|---|---|
| Authenticated customer/operator app | `apps/app` | Next.js app and the production Convex URL |
| Public static marketing web | `apps/web` | Static domain content and the authenticated-app link only |

The app root owns `apps/app/vercel.json`. Its build command runs the Convex
production deployment and then builds the authenticated app with the resulting
`NEXT_PUBLIC_CONVEX_URL`. The static web root must not gain Convex, auth, agent,
chat, storage, or reservation runtime.

## Environment ownership

The handoff input separates values by deployment owner. Do not flatten these
maps or expose Convex-only values through `NEXT_PUBLIC_*`.

| Owner | Always required | Conditional |
|---|---|---|
| `web` | `NEXT_PUBLIC_APP_URL` | none |
| `app` | `NEXT_PUBLIC_CONVEX_URL`, `AUTH_ANONYMOUS_LOGIN`, `AGENT_RUNTIME` | `OPENAI_API_KEY` only for `AGENT_RUNTIME=openai` |
| `convex` | `CONVEX_DEPLOYMENT`, `CONVEX_URL`, `CONVEX_SITE_URL`, `SITE_URL`, `JEOMWON_APP_ORIGINS`, `JWT_PRIVATE_KEY`, `JWKS`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `JEOMWON_ADMIN_EMAILS`, `AUTH_ANONYMOUS_LOGIN`, `RESERVATION_EMAIL_MODE` | Resend values for `sent`; Polar values only when enabled |

`CONVEX_DEPLOYMENT` must be a named `prod:` identity. Its name must match both
the `.convex.cloud` backend URL and `.convex.site` HTTP-actions URL. The app's
`NEXT_PUBLIC_CONVEX_URL` must exactly match the backend `CONVEX_URL`.
`AUTH_ANONYMOUS_LOGIN` must match between app and Convex. Production QA/test and
reset flags are forbidden.

`RESERVATION_EMAIL_MODE` must be explicit:

- `capture`: records delivery intent without external email; no Resend values
  are required.
- `sent`: requires `RESEND_API_KEY` and `RESEND_SENDER_EMAIL_AUTH` in Convex.

When `features.polar` is enabled, Convex also owns
`POLAR_ORGANIZATION_TOKEN`, `POLAR_WEBHOOK_SECRET`, and `POLAR_PRODUCT_IDS`.
Polar is **account-subscription only**. It does not implement reservation
commerce, reservation deposits, per-reservation charges, refunds, or a payment
ledger.

## Google provider attestation

The input's `google.authorizedOrigins` must include the exact HTTPS origin from
`web.NEXT_PUBLIC_APP_URL`. `google.redirectUris` must include exactly the
production `CONVEX_SITE_URL` followed by `/api/auth/callback/google`. These are
operator attestations copied from the Google Web application client; the checker
never reads or mutates Google Console.

## Deployment order and rollback

1. Record an immutable, previously verified app release as `rollbackTarget`.
2. Configure the named Convex production environment without printing values.
3. Initiate the authenticated `apps/app` Vercel deployment. Its checked-in build
   contract deploys Convex and binds the resulting URL before the app build.
4. Smoke auth and the app/backend seam.
5. Initiate the independent static `apps/web` Vercel deployment only after the
   authenticated app URL is stable.
6. Complete the checklist below. On failure, stop, preserve evidence, and restore
   the recorded immutable app release plus its matching Convex schema/functions.

The checker does not execute any step above.

## Production smoke checklist

- Static web loads and every reservation CTA reaches the authenticated app.
- Google customer login succeeds; an allowlist-external account cannot use
  operator actions; an allowlisted operator can open `/admin`.
- A customer can hold, confirm, reschedule, and cancel only their reservation.
- Operator dashboard reads live production state without exposing internal data
  to the customer surface.
- Email behavior matches the declared `capture` or `sent` mode without exposing
  recipient data in logs.
- If Polar is enabled, only account-subscription checkout is reachable.
- QA, test-hold, demo-reset, and other reset surfaces remain disabled.
- The recorded rollback target is available and still matches its backend.

This smoke pass is an operator-owned observation. Do not place identities,
screenshots containing PII, browser storage, provider responses, or secrets in
the readiness report.
