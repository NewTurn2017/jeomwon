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
bun install --frozen-lockfile
bun x convex login
bun setup
bun dev
```

`bun setup`의 첫 성공 경로는 저장소에 고정된 Bun·Convex CLI 버전과 Convex
로그인을 먼저 확인합니다. 이후 deployment, 앱 URL 연결, JWT 키, 로컬 익명 고객
로컬 익명 로그인 설정을 app/Convex env에 동기화합니다. Google 최종 사용자 로그인은
실행하지 않습니다. 사용자가 입력하는 값은 기존 Google OAuth client ID,
client secret, 실제 Google 운영자 계정과 일치하는 이메일 하나뿐입니다.

setup이 표시한 정확한 Redirect URI를 Google Console에 등록하고 저장하면 Enter로
재개합니다. 이 등록 단계는 건너뛸 수 없습니다. Resend·OpenAI·Polar는 첫 성공
범위에서 제외되며 기본 예약·취소·운영자 에스컬레이션은 Convex로 영속됩니다.
첫 성공 후 선택 제공자까지 연결하려면 `bun setup --optional-providers`를
실행합니다.

<!-- doc-contract:setup:start -->
| Step ID | Kind | Required | Feature |
|---|---|---:|---|
| app-url | local-env | false | - |
| site-url | convex-env-with-local-default | false | - |
| convex | convex-provision | false | - |
| convex-auth | convex-auth-keys | false | - |
| google-oauth | google-oauth | false | - |
| admin-emails | admin-emails | true | - |
| anonymous-login | anonymous-login | false | - |
| resend | resend | false | email |
| openai | openai | false | - |
| polar | polar | false | polar |
<!-- doc-contract:setup:end -->

setup은 위 외부 소유 항목의 계정·DNS·OAuth client를 생성하거나 최종 사용자의 Convex/Google 로그인을 수행하지 않는다. Convex CLI 로그인은 setup 전에 `bun x convex login`으로 완료해야 한다.

setup 중 `prerequisite_missing`은 표시된 Bun 버전과 `bun install
--frozen-lockfile`, `prerequisite_unauthenticated`는 `bun x convex login`으로
복구합니다. `external_environment`는 네트워크·Convex 팀 권한·deployment quota를
확인합니다. Google 로그인에서 redirect mismatch가 보이면 setup이 출력한 URI가
공백·슬래시까지 정확히 등록됐는지 확인한 뒤 `bun setup`을 다시 실행합니다. 정상
사전 조건에서 deployment·URL·JWT 자동화가 실패하면 수동 env 편집으로 우회하지
말고 `product_failure`로 기록합니다.

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

`bun setup`이 로컬 env와 Convex 배포 env를 자동으로 연결합니다. 아래 목록은
자동화 결과의 소유 위치를 설명하기 위한 것이며, 첫 성공 중 수동 env 편집으로
설정을 우회하지 않습니다.

### 정적 공개 웹 (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

이 값은 공개 안내의 로그인 CTA 대상이며 필수입니다. web에는 Convex·인증·챗
env를 두지 않습니다.

### 인증 고객 앱 (`apps/app/.env.local`)

```bash
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
AUTH_ANONYMOUS_LOGIN=1
AGENT_RUNTIME=mock
```

고객 로그인·예약·챗과 내부 `/admin`에 필요한 Convex 연결 및 챗 런타임 env는
app이 소유합니다. `AGENT_RUNTIME=openai`를 선택할 때만 앱 서버 전용 env인
`OPENAI_API_KEY`를 추가하세요. `AUTH_ANONYMOUS_LOGIN`은 setup이 Convex 배포와
app에 같은 값으로 기록하며 로컬 첫 성공에서는 `1`입니다. production URL에서는
명시적 확인 문구 없이는 활성화되지 않습니다.

### Convex 배포 env

```bash
SITE_URL=http://localhost:3001
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>
JEOMWON_ADMIN_EMAILS=<operator-email>
AUTH_ANONYMOUS_LOGIN=1
RESEND_API_KEY=<resend-api-key>
RESEND_SENDER_EMAIL_AUTH=Jeomwon <onboarding@yourdomain.com>
```

Google OAuth의 로컬 Authorized JavaScript origin은 인증 앱인
`http://localhost:3000`만 등록합니다. callback은 Convex site URL의
`/api/auth/callback/google`을 사용합니다. `SITE_URL`은 공개 마케팅 주소와 이메일
링크에 사용합니다.

Polar **계정 구독**을 사용하는 도메인에서는 `POLAR_PRODUCT_IDS`와 함께 다음 값을 추가로 설정합니다. 이 연동은 로그인 계정의 SaaS 구독 전용이며 서비스 `price`와 예약 보증금·예약 청구·환불·예약별 결제 ledger를 구현하지 않습니다.

```bash
POLAR_ORGANIZATION_TOKEN=<polar-organization-token>
POLAR_WEBHOOK_SECRET=<polar-webhook-secret>
POLAR_PRODUCT_IDS=<account-subscription-product-ids>
```

## 개발 검증

```bash
bun typecheck
bun lint
bun qa
```

`bun qa`는 setup이 만든 동일한 Convex dev 배포를 backend와 app env에서 먼저
교차 검증한 뒤, 예약된 비일치 `.invalid` 운영자 allowlist와 인증 고객 A/B를
사용해 QA contract v2의 정확한 12게이트를 실행합니다. 게이트 10은 미인증 redirect와 인증 고객 404를
항상 검증합니다. `operatorCalendarCrud`가 꺼져 있으면 CRUD 경계 하위 사례만 이유와
함께 SKIP하고, 켜져 있으면 미인증·인증 비운영자의 create/update/delete 차단을
PASS로 증명합니다. 게이트 12는 `noShow` off에서 무변경 SKIP하고 on에서 과거
확정 예약의 서버 권한 전이를 검증합니다. 실제 Google 운영자 로그인과 성공 CRUD는
별도 maintainer-owned 라이브 smoke이며 사용자 승인 전에는 BLOCKED입니다. ambient
deploy key나 별도 operator email/storage-state를 로컬 러너에 제공하지 마세요.

setup schema 2와 생성 receipt schema 3은 각각 setup 입력 구조와 로컬 생성물 일관성 계약입니다. setup은 provider 계정, DNS, Google OAuth client를 만들지 않으며 오프라인 bootstrap/`VERIFY PASS`도 이 live QA나 deployment를 대신하지 않습니다.

첫 사용자 10명의 전체 영속 왕복과 운영체제별 판정 절차는
`docs/first-success-validation.md`를 따릅니다. 기록 후
`bun run first-success:report <기록.json>`으로 4/3/3 할당, 중앙값 15분,
9/10 25분, 플랫폼별 기능·보안 100% 조건을 기계적으로 판정합니다.
