# Upstream Provenance

- Source: `/Users/genie/dev/side/jeomwon/upstream/v1`
- Pinned commit: `924e4211fd671aa39d0267a883f82190c0f46a08`
- Vendored on: 2026-07-02
- Copy target: `/Users/genie/dev/side/jeomwon/template`

## Vendoring Policy

Copied the pinned upstream tree into `template/` and excluded source-control, install, and build artifacts:

- Excluded: `.git`, `node_modules`, `.next`, `.turbo`
- Omitted after strip: `bun.lock`

`bun.lock` was not retained because telemetry packages were removed and this environment is not allowed to run `bun install` to regenerate a consistent lockfile. The first owner-side `bun install` should create a clean lockfile from the stripped manifests.

## Removed

- Deleted the app telemetry config files:
  - `apps/app/sentry.client.config.ts`
  - `apps/app/sentry.server.config.ts`
  - `apps/app/sentry.edge.config.ts`
  - `apps/app/src/instrumentation.ts`
- Replaced the app error boundary with a plain Next.js `global-error.tsx` that does not report externally.
- Removed the Sentry wrapper from `apps/app/next.config.mjs`.
- Removed telemetry package dependencies from app manifests:
  - `apps/app/package.json`: removed `@sentry/nextjs` and `@pension-stay/analytics`
  - `apps/web/package.json`: removed `@pension-stay/analytics`
- Deleted the OpenPanel wrapper package: `packages/analytics`
- Deleted `packages/logger` after confirming it was only consumed by `packages/analytics`.
- Removed telemetry environment keys from:
  - `apps/app/src/env.mjs`
  - `apps/web/src/env.ts`
  - `apps/app/.env.example`
  - `apps/web/.env.example`
  - `setup-config.json`
  - `turbo.json`
  - `README.md`

## Upstream Defect Fixes

1. Added missing `@pension-stay/backend` workspace dependency to `apps/web/package.json`.
2. Added missing `NEXT_PUBLIC_CONVEX_URL` to `apps/app/.env.example`.
3. Documented required `SITE_URL` in:
   - `packages/backend/.env.example`
   - `setup-config.json`
   - `README.md`
4. Added direct backend dependencies used by Convex files:
   - `@t3-oss/env-core@^0.11.1`
   - `zod@^3.23.8`
5. Fixed the dev-only Anonymous auth guard:
   - Convex provider registration now uses `AUTH_DEV_ANONYMOUS=1` as the
     single explicit opt-in because `CONVEX_DEPLOYMENT` is not present in the
     Convex deployment runtime.
   - The login page uses the same server-side opt-in flag and no longer depends
     on `CONVEX_DEPLOYMENT`.
   - The shortcut must never be enabled in production; setup docs and wizards
     must keep it dev-only.
6. Added a dev-only QA reset gate: persistent QA data resets require Convex deployment env `JEOMWON_QA_RESET=1` plus local `CONVEX_DEPLOY_KEY`; never set the reset flag in production.

## Owner-Side Gates

Run from `template/` after this vendoring step:

```bash
bun install
```

For build/typecheck without real secrets, use dummy public URLs plus `SKIP_ENV_VALIDATION=1`:

```bash
SKIP_ENV_VALIDATION=1 \
NEXT_PUBLIC_CONVEX_URL=https://example-123.convex.cloud \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
SITE_URL=http://localhost:3001 \
bun run build

SKIP_ENV_VALIDATION=1 \
NEXT_PUBLIC_CONVEX_URL=https://example-123.convex.cloud \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
SITE_URL=http://localhost:3001 \
bun run typecheck

bun run lint
```

Convex backend validation remains skipped unless `VALIDATE_ENV=true` is set, so Polar, Google OAuth, Resend, and Loops secrets are not required for these local gates.

## 로컬 게이트 수선 내역 (오케스트레이터, 2026-07-02)

- bun 1.3 isolated 링커 대응: `bunfig.toml` hoisted 지정, `@pension-stay/typescript`·tailwind 계열 workspace 의존 명시 선언
- `@convex-dev/polar`를 실존 최신 `^0.9.2`로 핀 (1차 패스의 `0.2.0-alpha.5`는 npm에 없는 버전)
- `--webpack` 빌드 플래그 제거: Codex 샌드박스 회피책이었고, 로컬 Turbopack(Next 16 기본) 빌드 통과 확인 후 기본값 복원
- 게이트 통과 기록: bun install(lockfile 재생성) / typecheck 4·4 / lint 4·4 / build 3·3(Turbopack) / dev 부팅 스모크 web 200·app 200(로케일 리다이렉트 후)
