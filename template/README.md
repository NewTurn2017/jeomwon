# Jeomwon 예약 SaaS

이 저장소는 Jeomwon으로 생성된 소상공인용 예약 SaaS입니다. 고객은 공개 웹
페이지에서 채팅으로 예약을 문의하고, 운영자는 관리자 앱에서 예약 상태와 확인
필요 요청을 관리합니다.

## 구성

```text
apps/web        고객용 예약 웹 앱
apps/app        운영자 관리자 앱
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

## 주요 설정

상점명, 서비스, 리소스, 영업 시간, 예약 정책, 고객 안내 문구는
`packages/backend/domain.config.ts`에서 관리합니다. 고객용 웹 앱은 이 설정의
공개 정보만 읽어 화면과 메타데이터를 구성합니다.

## 환경 변수

`bun setup`은 필요한 값을 대화형으로 입력받아 로컬 env와 Convex 배포 env에
반영합니다. 수동으로 설정할 때는 아래 값을 준비하세요.

### 웹 앱과 관리자 앱

```bash
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Convex 배포 env

```bash
SITE_URL=http://localhost:3001
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>
RESEND_API_KEY=<resend-api-key>
RESEND_SENDER_EMAIL_AUTH=Jeomwon <onboarding@yourdomain.com>
OPENAI_API_KEY=<openai-api-key>
```

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

`bun qa`는 로컬 앱과 Convex dev 배포가 준비된 상태에서 실행하세요. 개발 배포의
데이터 초기화가 필요하면 Convex env에 `JEOMWON_QA_RESET=1`을 설정하고 로컬
러너에 `CONVEX_DEPLOY_KEY`를 제공해야 합니다.
