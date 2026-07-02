# get-convex/v1 upstream 조사 보고 (Phase 0)

> 조사: Codex read-only (job task-20260702042106-948geg) · 핀 커밋: 924e4211fd671aa39d0267a883f82190c0f46a08 (2025-12-01) · 대상: upstream/v1 로컬 클론

**1. 모노레포 지형**
- 패키지 매니저는 `bun@1.1.26` 고정입니다. `package.json:37`; `pnpm-workspace.yaml`, `.nvmrc`, `.node-version`, `engines`는 없음.
- 워크스페이스는 `packages/*`, `apps/*`, `tooling/*`입니다. `package.json:4`
- Turbo는 `build/dev/typecheck/lint` 중심이고, build env에 Resend/Loops/OpenPanel/Sentry 키가 들어갑니다. `turbo.json:9`
- 앱:
  - `apps/app`: Next dashboard/product app, port `3000`, Next `14.2.7`, Convex Auth/Polar/next-themes/nuqs 포함. `apps/app/package.json:2`, `apps/app/package.json:6`, `apps/app/package.json:14`
  - `apps/web`: marketing site, port `3001`, Next `14.2.7`, Cal embed, Convex client, analytics 포함. `apps/web/package.json:2`, `apps/web/package.json:6`, `apps/web/package.json:14`
- 패키지:
  - `packages/backend`: Convex backend. `packages/backend/package.json:2`, `packages/backend/package.json:5`
  - `packages/email`: React Email preview/build package. `packages/email/package.json:2`, `packages/email/package.json:10`
  - `packages/analytics`: OpenPanel wrapper. `packages/analytics/package.json:2`, `packages/analytics/package.json:13`
  - `packages/logger`: pino wrapper. `packages/logger/src/index.ts:1`
  - `packages/ui`: shared shadcn-style UI exports. `packages/ui/package.json:22`
- 의존 그래프상 `apps/app`은 `@v1/analytics`, `@v1/backend`, `@v1/ui`를 선언합니다. `apps/app/package.json:21`
- `apps/web`은 `@v1/analytics`, `@v1/ui`만 선언하지만 소스에서 `@v1/backend`를 import합니다. `apps/web/package.json:18`, `apps/web/src/components/subscribe-form.tsx:3`

**2. Convex 배선**
- backend 위치는 `packages/backend/convex/*`; 스키마는 `authTables` + 커스텀 `users` 테이블뿐입니다. `packages/backend/convex/schema.ts:5`
- Convex Auth는 사용 중입니다. Google provider는 `convexAuth({ providers: [Google] })`로 등록됩니다. `packages/backend/convex/auth.ts:1`
- Auth config의 provider domain은 `process.env.CONVEX_SITE_URL`입니다. `packages/backend/convex/auth.config.ts:4`
- Google OAuth 키는 `setup-config.json`에서 Convex env로 설정됩니다: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. `setup-config.json:53`, `setup-config.json:61`
- 로컬 코드에서 `AUTH_GOOGLE_ID/SECRET`를 직접 provider에 넘기지는 않습니다. `packages/backend/convex/env.ts`가 검증 대상으로만 읽습니다. `packages/backend/convex/env.ts:13`
- HTTP routes는 Convex Auth route와 Polar webhook `/polar/events`입니다. `packages/backend/convex/http.ts:7`
- app client는 `ConvexAuthNextjsProvider` + `ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL)`입니다. `apps/app/src/app/convex-client-provider.tsx:4`
- web client는 인증 없는 `ConvexProvider`입니다. `apps/web/src/app/convex-client-provider.tsx:4`

**3. 제거 대상 전수 목록**
- Sentry 파일: `apps/app/next.config.mjs:2`, `apps/app/src/instrumentation.ts:1`, `apps/app/src/app/global-error.tsx:3`, `apps/app/sentry.client.config.ts:1`, `apps/app/sentry.server.config.ts:1`, `apps/app/sentry.edge.config.ts:1`
- Sentry 의존성/env/config: `@sentry/nextjs` in `apps/app/package.json:39`; `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in `apps/app/.env.example:8`, `setup-config.json:110`, `turbo.json:15`
- OpenPanel 파일/패키지: `packages/analytics/*` 전체, `@openpanel/nextjs` in `packages/analytics/package.json:14`
- OpenPanel 소비: web layout provider import/render. `apps/web/src/app/layout.tsx:4`, `apps/web/src/app/layout.tsx:43`
- OpenPanel env: `NEXT_PUBLIC_OPENPANEL_CLIENT_ID`, `OPENPANEL_SECRET_KEY` in `apps/web/.env.example:4`, `apps/app/.env.example:4`, `setup-config.json:91`; app/web env validators에도 있음. `apps/app/src/env.mjs:14`, `apps/web/src/env.ts:7`
- 함께 정리할 wrapper: `packages/logger`는 analytics에서만 쓰입니다. `packages/analytics/src/client.tsx:6`, `packages/analytics/src/server.ts:2`, `packages/logger/src/index.ts:1`

**4. 유지 대상 배선**
- React Email+Resend:
  - 독립 preview package는 `packages/email`입니다. `packages/email/package.json:14`
  - 실제 Convex-side 발송 유틸은 `packages/backend/convex/email/index.ts`이며 Resend REST API를 직접 호출합니다. `packages/backend/convex/email/index.ts:28`
  - subscription email 템플릿/발송 함수는 있으나 호출자는 없습니다. `packages/backend/convex/email/templates/subscriptionEmail.tsx:119`
- i18n:
  - 라이브러리는 `next-international`; app 전용입니다. `apps/app/package.json:29`
  - locale은 `en/fr/es`, 기본 locale은 `en`입니다. `apps/app/src/middleware.ts:9`, `apps/app/src/locales/client.ts:11`
- Polar:
  - Convex component로 등록됩니다. `packages/backend/convex/convex.config.ts:1`
  - webhook route와 checkout API가 연결되어 있습니다. `packages/backend/convex/http.ts:9`, `packages/backend/convex/subscriptions.ts:23`
  - app billing UI와 nav upgrade CTA에서 사용합니다. `apps/app/src/app/[locale]/(dashboard)/settings/billing/page.tsx:3`, `apps/app/src/app/[locale]/(dashboard)/_components/navigation.tsx:4`
  - 현재는 쉽게 끄는 토글 경계가 아닙니다. backend env에서 Polar 키가 required입니다. `packages/backend/convex/env.ts:8`
- `next-themes`: app layout provider와 theme switcher에서 사용. `apps/app/src/app/[locale]/layout.tsx:8`, `apps/app/src/app/[locale]/(dashboard)/_components/theme-switcher.tsx:9`
- `nuqs`: `apps/app/package.json` 의존성만 있고 소스 사용처 없음. `apps/app/package.json:32`

**5. marketing(web) vs dashboard(app) 경계**
- `apps/web`는 공개 marketing site입니다. layout이 `Header`, `children`, `Footer`, analytics provider를 감쌉니다. `apps/web/src/app/layout.tsx:37`
- `apps/web` 인증 middleware는 없음. 다만 newsletter form이 Convex action을 호출합니다. `apps/web/src/components/subscribe-form.tsx:28`
- `apps/app`는 Convex Auth middleware로 `/login` 외 라우트를 보호합니다. `apps/app/src/middleware.ts:17`
- dashboard shell은 `apps/app/src/app/[locale]/(dashboard)/layout.tsx`이며 user/onboarding 검사 후 `Navigation`과 children을 렌더합니다. `apps/app/src/app/[locale]/(dashboard)/layout.tsx:10`
- 고객용 챗 위젯 자연 삽입점: `apps/web/src/app/layout.tsx`의 `ConvexClientProvider` 내부, `children` 뒤의 floating widget.
- 관리자 대시보드 삽입점: `apps/app/src/app/[locale]/(dashboard)/page.tsx` 또는 dashboard layout의 `Navigation` 아래 content 영역. `apps/app/src/app/[locale]/(dashboard)/page.tsx:17`

**6. .env.example 전수**
- 실제 `.env.example`는 두 개뿐입니다: `apps/app/.env.example`, `apps/web/.env.example`.
- `apps/app/.env.example`: `RESEND_API_KEY`, `NEXT_PUBLIC_OPENPANEL_CLIENT_ID`, `OPENPANEL_SECRET_KEY`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`. `apps/app/.env.example:1`
- `apps/web/.env.example`: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_OPENPANEL_CLIENT_ID`, `OPENPANEL_SECRET_KEY`, `NEXT_PUBLIC_CAL_LINK`. `apps/web/.env.example:1`
- `NEXT_PUBLIC_CONVEX_URL`: app/web runtime client env, both Convex clients consume. `apps/app/src/env.mjs:13`, `apps/web/src/env.ts:6`
- `NEXT_PUBLIC_APP_URL`: `.env.example`에는 없지만 setup/README에 있고 web header/page가 직접 링크로 사용. `setup-config.json:25`, `apps/web/src/components/header.tsx:35`
- Convex deployment env in setup: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `POLAR_WEBHOOK_SECRET`, `POLAR_ORGANIZATION_TOKEN`, `RESEND_API_KEY`, `RESEND_SENDER_EMAIL_AUTH`, `LOOPS_FORM_ID`. `setup-config.json:48`, `setup-config.json:68`, `setup-config.json:139`, `setup-config.json:174`
- backend env validator는 추가로 `CONVEX_SITE_URL`, `SITE_URL`, `VALIDATE_ENV`를 전제로 합니다. `packages/backend/convex/env.ts:6`, `packages/backend/package.json:7`
- `VERCEL_URL`, `PORT`, `SKIP_ENV_VALIDATION`, `CI`는 app/web env validation 제어 또는 runtime shared 값입니다. `apps/app/src/env.mjs:6`, `apps/web/src/env.ts:18`
- `LOOPS_ENDPOINT`, `LOOPS_API_KEY`는 `turbo.json` build env에만 있고 실제 소비자는 없음. `turbo.json:12`

**7. @openai/agents 호환성 판단 근거**
- 로컬 repo는 Next `14.2.7`입니다. `apps/app/package.json:28`, `apps/web/package.json:22`
- 현재 `apps/*`에는 `route.ts` route handler가 없습니다. 검색 결과 없음.
- Next config에서 edge runtime 강제는 없습니다. `apps/web/next.config.mjs:1`, `apps/app/next.config.mjs:5`
- Next 공식 문서상 route segment runtime 기본값은 `nodejs`이고 `edge` 선택도 가능합니다. https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
- Next 공식 문서상 Edge Runtime은 Node.js API 전체를 지원하지 않아 일부 패키지가 동작하지 않을 수 있습니다. https://nextjs.org/docs/app/api-reference/edge
- 따라서 이 레포에 Next route handler로 agent loop를 추가하는 것은 로컬 구조상 가능하되, edge로 옮기면 위험합니다. 명시적으로 `export const runtime = "nodejs"`를 두는 쪽이 근거 있는 경계입니다.
- repo에는 `@openai/agents`가 없고 `openai` SDK v4만 backend에 선언되어 있습니다. `packages/backend/package.json:20`
- Convex action은 Node.js `"use node"` directive도 가능하다는 generated 타입 주석이 있습니다. `packages/backend/convex/_generated/server.d.ts:72`

**계획 충돌**
- 계획은 `ko 기본 + en`을 가정하지만 upstream은 `en/fr/es`, default `en`입니다. `docs/plan.md:22`, `apps/app/src/middleware.ts:9`
- 계획은 Sentry/OpenPanel 제거를 전제로 맞지만 upstream에는 둘 다 깊게 포함되어 있습니다. 위 3절 목록 참조.
- `apps/app/.env.example`에는 app 필수인 `NEXT_PUBLIC_CONVEX_URL`이 없습니다. `apps/app/src/env.mjs:13`
- `packages/backend/convex/env.ts`는 `SITE_URL`을 required로 검증하지만 setup-config/`.env.example`에 없습니다. `packages/backend/convex/env.ts:12`
- `apps/web`는 `@v1/backend`를 소스에서 import하지만 package dependency로 선언하지 않습니다. `apps/web/src/components/subscribe-form.tsx:3`
- README에는 `bun dev:convex`, `bun dev:email`이 언급되지만 root scripts에는 없습니다. `README.md:159`, `package.json:9`

**Phase 1 벤더링 시 주의점**
- Sentry/OpenPanel 제거는 파일 삭제만이 아니라 env validator, setup-config, turbo env, README, app/web package deps, lockfile, analytics/logger workspace 정리까지 한 번에 해야 합니다.
- Polar는 required env와 dashboard UI, Convex component, webhook route, seed action이 얽혀 있어 “선택 모듈”로 만들려면 env validation부터 optional boundary가 필요합니다.
- Resend/React Email은 현재 호출자가 없고 backend package에 React Email 관련 직접 dependency가 부족해 보입니다.
- `packages/backend`가 `zod`/`@t3-oss/env-core`를 직접 package dependency로 선언하지 않는데 Convex files가 import합니다.
- Phase 1 빌드 게이트 전에 `apps/web`의 undeclared `@v1/backend` dependency와 app `.env.example` 누락을 먼저 정리해야 합니다.
- 조사 중 파일 수정은 하지 않았고, `upstream/v1` 상태는 `main...origin/main` clean입니다.
AGENTDESK-P0 COMPLETE
hook: Stop
hook: Stop Completed
tokens used
322,226
