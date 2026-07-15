# 데모 플레이그라운드 운영 런북

이 문서는 `demo.codewithgenie.com`에서 인증된 고객 앱(`template/apps/app`)을 제공하는 강연용 공개 데모의 운영 절차다. 데모 Convex 배포, Vercel 프로젝트, 데이터, 환경 변수, deploy key는 일반 운영과 공유하지 않는다. 이 절차의 Vercel·Convex·DNS 작업은 운영자 승인 뒤에만 실행한다.

정확한 11게이트의 게이트 10은 미인증 `/admin` redirect와 인증 고객 `/admin` 404를 항상 검증한다. `features.operatorCalendarCrud=false`이면 CRUD 경계 하위 사례만 구체적 이유와 함께 SKIP하고, `true`이면 예약된 비일치 `.invalid` allowlist 아래에서 미인증·인증 비운영자의 create/update/delete 차단을 PASS로 증명한다. 실제 Google 운영자 로그인과 성공 CRUD는 이 결정론적 경계 게이트와 분리된 승인 소유 라이브 smoke이며, 승인 전에는 BLOCKED로 기록한다.

## 1. 전용 Convex 배포 준비

1. Convex 계정으로 로그인한 뒤 백엔드 디렉터리로 이동한다.

   ```bash
   cd template/packages/backend
   bunx convex login
   ```

2. 장기 운영할 데모 전용 production-class 배포를 만든다. 기존 운영 배포를 선택하거나 기본 production 배포로 지정하지 않는다.

   ```bash
   bunx convex deployment create demo-playground --type prod
   ```

3. 데모 전용 배포의 이름을 별도로 기록한다. 일반 운영 배포의 데이터, deploy key, 관리자 allowlist를 복사하지 않는다. `JEOMWON_QA_RESET`도 설정하지 않는다.

4. 전용 배포의 **Settings → Deploy Keys**에서 Vercel 빌드 전용 deploy key를 최소 권한으로 만든다. 값은 터미널이나 문서에 출력하지 않고 Vercel의 `CONVEX_DEPLOY_KEY` secret으로만 저장한다.

Convex의 다중 배포와 CLI 동작은 [multiple deployments](https://docs.convex.dev/production/multiple-deployments)와 [deployment CLI](https://docs.convex.dev/cli/reference/deployment)를 기준으로 한다.

## 2. 환경 변수 경계

데모 로그인, 표시 배너, 데이터 리셋은 서로 다른 경계다. 한 플래그로 다른 기능을 대신 켜지 않는다.

| 위치 | 변수 | 값/역할 |
| --- | --- | --- |
| 데모 Convex 배포 | `AUTH_ANONYMOUS_LOGIN` | 정확히 `1`; 제품용 익명 auth provider 허용 |
| 데모 Convex 배포 | `JEOMWON_ADMIN_EMAILS` | 비어 있지 않은 운영자 전용 allowlist; 값은 출력 금지 |
| 데모 Convex 배포 | `JEOMWON_DEMO_RESET` | 정확히 `1`; 데모 데이터 reset/reseed와 메일 capture 전용 |
| 데모 app Vercel 서버 | `AUTH_ANONYMOUS_LOGIN` | 정확히 `1`; 로그인 화면의 제품용 익명 로그인 허용 |
| 데모 app Vercel 공개 빌드 | `NEXT_PUBLIC_JEOMWON_DEMO` | 정확히 `1`; 로그인과 인증된 shell의 안내 배너만 표시 |
| 데모 app Vercel 빌드 | `CONVEX_DEPLOY_KEY` | 1단계의 데모 전용 deploy key; Sensitive secret |

`AUTH_ANONYMOUS_LOGIN`은 app 서버와 같은 데모 Convex 배포 양쪽에 필요하다. Convex의 `JEOMWON_ADMIN_EMAILS`도 비어 있지 않아야 제품용 익명 로그인이 fail-closed 조건을 통과한다. 반면 `NEXT_PUBLIC_JEOMWON_DEMO`는 화면 표시 전용이며 로그인이나 리셋을 허용하지 않는다. `JEOMWON_DEMO_RESET`은 Convex 서버 전용이며 공개 env나 익명 로그인 enable 식에 넣지 않는다.

Convex 변수는 전용 배포를 명시해 설정한다.

```bash
cd template/packages/backend
bunx convex env --deployment <demo-deployment> set AUTH_ANONYMOUS_LOGIN 1
bunx convex env --deployment <demo-deployment> set JEOMWON_ADMIN_EMAILS <operator-allowlist>
bunx convex env --deployment <demo-deployment> set JEOMWON_DEMO_RESET 1
```

확인할 때는 값 대신 이름만 조회한다.

```bash
bunx convex env --deployment <demo-deployment> list --names-only
```

환경 변수 명령은 [Convex env CLI](https://docs.convex.dev/cli/reference/env)를 따른다.

## 3. Vercel 앱 프로젝트와 빌드

1. 데모 Vercel Project의 Root Directory를 `template/apps/app`으로 지정한다. 모노레포의 `packages/*`를 읽을 수 있도록 **Include source files outside of the Root Directory in the Build Step**를 켠다.

2. Production 환경에 2절의 app/Vercel 변수를 설정하고, 인증된 앱이 기존에 요구하는 일반 auth 변수도 데모 전용 값으로 설정한다. secret 값은 로그나 증빙에 남기지 않는다.

3. 빌드는 `template/apps/app/vercel.json`을 사용한다. 이 설정은 deploy key가 가리키는 전용 Convex에 백엔드를 배포한 뒤 `NEXT_PUBLIC_CONVEX_URL`을 app build에 전달한다. `apps/web`의 설정이나 build output을 데모 앱 배포에 사용하지 않는다.

4. 운영자 승인 뒤 앱 프로젝트를 연결하고 production 배포를 만든다.

   ```bash
   cd template/apps/app
   bunx vercel link
   bunx vercel --prod
   ```

Vercel 모노레포 설정은 [Using Monorepos](https://vercel.com/docs/monorepos)를 기준으로 한다.

## 4. 안전한 배포·도메인 전환 순서

다음 순서를 바꾸지 않는다.

1. 전용 Convex 배포와 env 이름을 확인한다.
2. `apps/app` 데모를 Vercel 임시 production URL에 배포한다. 이 단계에서는 `demo.codewithgenie.com`을 전환하지 않는다.
3. 임시 URL에서 `/` → `/login` → 제품용 익명 로그인 → 인증된 `/` 진입, 로그인·shell 배너, 고객 예약 CRUD, 메일 capture, reset/reseed를 운영자가 확인한다. app readiness가 통과하지 않으면 web이나 도메인 단계로 진행하지 않는다.
4. 같은 릴리스의 `apps/web` 정적 마케팅 변경을 기존 마케팅 프로젝트에 배포하고 CTA가 준비된 app 진입 URL을 가리키는지 확인한다. 이 배포는 데모 Convex deploy key나 demo env를 받지 않는다.
5. 모든 확인이 끝난 뒤에만 `demo.codewithgenie.com`을 app 프로젝트로 전환한다. 앱 배포가 준비되기 전에 web 프로젝트에서 도메인을 제거하지 않는다.
6. HTTPS 인증서가 준비된 뒤 base URL과 기존 QR이 같은 `https://demo.codewithgenie.com/`을 열고 로그인으로 이동하는지 확인한다. 저장소의 QR이나 `site/**` 자산은 이 전환에서 수정하지 않는다.

도메인 작업은 실제 프로젝트 이름을 확인한 뒤 수행한다.

```bash
bunx vercel domains add demo.codewithgenie.com <app-vercel-project>
bunx vercel domains inspect demo.codewithgenie.com
```

도메인 절차는 [Working with domains](https://vercel.com/docs/domains/working-with-domains)를 따른다.

app readiness나 web CTA 확인이 실패하면 도메인은 검증된 이전 배포에 그대로 유지한다. 도메인 전환 뒤 문제가 생기면 먼저 이전의 검증된 대상에 도메인을 되돌리고, reset 대상이 불확실하면 Convex의 `JEOMWON_DEMO_RESET`을 제거해 추가 삭제를 멈춘다. 임시 app URL 검증과 web CTA 배포가 끝나기 전에는 DNS나 QR을 변경하지 않는다.

## 5. reset 주기와 중지

현재 주기는 `template/packages/backend/convex/crons.ts`의 `reset demo playground` hourly 등록이 소유한다. `JEOMWON_DEMO_RESET`이 정확히 `1`일 때만 예약, 채팅, 대기자, 에스컬레이션 데이터를 지우고 `domain.config.ts`의 리소스를 다시 시드한다. 같은 서버 전용 플래그가 메일을 capture 모드로 강제하므로 `RESEND_API_KEY`가 있어도 실제 발송 API를 호출하지 않는다.

- 매시간 실행 분만 바꾸려면 `minuteUTC`를 `0`부터 `59` 사이 값으로 변경한다.
- N시간 간격으로 바꾸려면 `hourly` 대신 `interval`과 `{ hours: N }`을 사용한다.
- 변경 후에는 app 프로젝트를 배포해 전용 Convex 함수와 cron 등록을 갱신한다.
- 긴급 중지는 코드 변경보다 먼저 전용 배포의 reset 플래그를 제거한다. cron 호출은 남아도 reset handler는 no-op이다.

  ```bash
  cd template/packages/backend
  bunx convex env --deployment <demo-deployment> remove JEOMWON_DEMO_RESET
  ```

> **경고: 일반 운영 Convex 배포에는 `JEOMWON_DEMO_RESET`을 절대 설정하지 않는다.** 값이 `1`이면 해당 배포의 데모 대상 데이터가 cron마다 삭제된다. 대상을 확신할 수 없으면 `list --names-only`로 배포와 변수 이름을 확인하고, 데모 전용 배포가 아니면 즉시 중단한다.

데모를 종료할 때는 전용 Convex의 `JEOMWON_DEMO_RESET`을 먼저 제거하고 app 프로젝트의 `AUTH_ANONYMOUS_LOGIN`과 `NEXT_PUBLIC_JEOMWON_DEMO`를 제거한 뒤 새 배포를 만든다. 다음으로 도메인을 분리하고, 마지막에 데모 전용 deploy key와 Convex 배포를 폐기한다.
