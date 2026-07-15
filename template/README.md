# Jeomwon 예약 SaaS

이 저장소는 Jeomwon으로 생성된 소상공인용 예약 SaaS입니다. 공개 웹은 서비스와
영업 정보를 정적으로 안내하고 앱 로그인으로 연결합니다. 인증한 고객은 앱에서
예약·변경·취소와 AI 챗을 사용하고, 운영자는 같은 앱의 내부 `/admin` 경로에서
예약 상태와 확인 필요 요청을 관리합니다.

## 구성

```text
apps/web        정적 공개 안내 + 앱 로그인 CTA
apps/app        인증 고객 앱 + 내부 운영자 `/admin`
packages/backend Convex 함수, 예약 도메인 설정, 에이전트 도구
packages/agents 예약 에이전트 런타임 연결
packages/email  예약 및 구독 이메일 템플릿
packages/ui     Tailwind v4 + shadcn 기반 공용 UI
tooling         공유 TypeScript 설정
```

## 실행

```bash
bun install
bun setup
bun dev
```

개별 앱만 실행하려면 다음 명령을 사용합니다.

```bash
bun dev:web
bun dev:app
```

`apps/app`은 `http://localhost:3000`, `apps/web`은
`http://localhost:3001`에서 실행됩니다. 고객 로그인·예약·챗과 내부 `/admin`은
모두 app에 있고, web은 서버 런타임 없이 공개 안내와 app CTA만 제공합니다.

## 주요 설정

상점명, 서비스, 리소스, 영업 시간, 예약 정책, 고객 안내 문구는
`packages/backend/domain.config.ts`에서 관리합니다. `apps/web`은 이 설정의
공개 정보만 읽어 정적 안내를 구성합니다. 고객별 예약 데이터와 챗은 인증 고객
앱에서만 다룹니다.

## 환경 변수

`bun setup`은 필요한 값을 대화형으로 입력받아 로컬 env와 Convex 배포 env에
반영합니다. 수동으로 설정할 때는 아래 값을 준비하세요.

### 정적 공개 웹 (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

이 값은 공개 안내의 로그인 CTA 대상이며 필수입니다. web에는 Convex·인증·챗
env를 두지 않습니다.

### 인증 고객 앱 (`apps/app/.env.local`)

```bash
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
AUTH_ANONYMOUS_LOGIN=0
AGENT_RUNTIME=mock
```

고객 로그인·예약·챗과 내부 `/admin`에 필요한 Convex 연결 및 챗 런타임 env는
app이 소유합니다. `AGENT_RUNTIME=openai`를 선택할 때만 앱 서버 전용 env인
`OPENAI_API_KEY`를 추가하세요. `AUTH_ANONYMOUS_LOGIN`은 setup이 Convex 배포와
app에 같은 값으로 기록하며 기본값은 `0`입니다.

### Convex 배포 env

```bash
SITE_URL=http://localhost:3001
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>
JEOMWON_ADMIN_EMAILS=<operator-email>
AUTH_ANONYMOUS_LOGIN=0
RESEND_API_KEY=<resend-api-key>
RESEND_SENDER_EMAIL_AUTH=Jeomwon <onboarding@yourdomain.com>
```

Google OAuth의 로컬 Authorized JavaScript origin은 인증 앱인
`http://localhost:3000`만 등록합니다. callback은 Convex site URL의
`/api/auth/callback/google`을 사용합니다. `SITE_URL`은 공개 마케팅 주소와 이메일
링크에 사용합니다.

Polar 결제를 사용하는 도메인에서는 다음 값을 추가로 설정합니다.

```bash
POLAR_ORGANIZATION_TOKEN=<polar-organization-token>
POLAR_WEBHOOK_SECRET=<polar-webhook-secret>
```

## 개발 검증

```bash
bun typecheck
bun lint
bun qa
```

`bun qa`는 setup이 만든 동일한 Convex dev 배포를 backend와 app env에서 먼저
교차 검증한 뒤, 예약된 비일치 `.invalid` 운영자 allowlist와 인증 고객 A/B를
사용해 정확한 11게이트를 실행합니다. 게이트 10은 미인증 redirect와 인증 고객 404를
항상 검증합니다. `operatorCalendarCrud`가 꺼져 있으면 CRUD 경계 하위 사례만 이유와
함께 SKIP하고, 켜져 있으면 미인증·인증 비운영자의 create/update/delete 차단을
PASS로 증명합니다. 실제 Google 운영자 로그인과 성공 CRUD는 별도
maintainer-owned 라이브 smoke이며 사용자 승인 전에는 BLOCKED입니다. ambient
deploy key나 별도 operator email/storage-state를 로컬 러너에 제공하지 마세요.
