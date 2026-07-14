# 데모 플레이그라운드 운영 런북

이 문서는 강연용 공개 체험 인스턴스를 새로 만들고 운영하는 순서다. 데모 백엔드는 운영 백엔드와 데이터·환경 변수·배포 키를 공유하지 않는다.

## 1. 전용 Convex 배포 만들기

1. Convex 계정으로 로그인한 뒤 백엔드 디렉터리로 이동한다.

   ```bash
   cd template/packages/backend
   bunx convex login
   ```

2. 장기 운영할 데모 전용 production-class 배포를 만든다. 기존 운영 배포를 선택하거나 기본 production 배포로 지정하지 않는다.

   ```bash
   bunx convex deployment create demo-playground --type prod
   ```

3. Convex Dashboard에서 새 배포의 이름을 확인하고, 이 배포에만 필요한 일반 환경 변수를 설정한다. 운영 배포의 데이터나 배포 키를 복사하지 않는다. 특히 `JEOMWON_QA_RESET`은 설정하지 않는다.

4. Vercel 빌드 전용 deploy key를 새 배포의 **Settings → Deploy Keys**에서 만든다. 권한은 배포에 필요한 최소 권한만 주고, 값은 복사한 뒤 터미널이나 문서에 출력하지 않는다. 이후 Vercel의 `CONVEX_DEPLOY_KEY` secret으로만 저장한다.

Convex는 장기 staging 성격의 환경에는 별도 프로젝트나 전용 배포를 권장한다. CLI 동작은 [Convex multiple deployments](https://docs.convex.dev/production/multiple-deployments)와 [deployment CLI](https://docs.convex.dev/cli/reference/deployment)를 기준으로 한다.

## 2. 데모 환경 변수 두 개 설정하기

데모 모드를 켜는 값은 정확히 두 개다. setup 위저드는 둘 다 만들거나 켜지 않는다.

### 2-1. Convex 배포: 자동 리셋과 메일 capture

`<demo-deployment>`를 1단계에서 확인한 전용 배포 이름 또는 reference로 바꾼다.

```bash
cd template/packages/backend
bunx convex env --deployment <demo-deployment> set JEOMWON_DEMO_RESET 1
```

이 값이 정확히 `1`일 때만 매시간 예약, 채팅, 대기자, 에스컬레이션 데이터가 삭제되고 `domain.config.ts`의 리소스가 다시 시드된다. 같은 플래그가 서버 메일을 capture 모드로 강제하므로 `RESEND_API_KEY`가 있어도 Resend 발송 API를 호출하지 않는다.

값을 확인할 때는 secret 값 전체를 출력하지 말고 변수 이름만 확인한다.

```bash
bunx convex env --deployment <demo-deployment> list --names-only
```

환경 변수 명령은 [Convex env CLI](https://docs.convex.dev/cli/reference/env)를 따른다.

### 2-2. Vercel 웹: 안내 배너

데모 웹 전용 Vercel Project의 **Settings → Environment Variables**에서 다음 값을 Production 환경에 추가한다.

```text
NEXT_PUBLIC_JEOMWON_DEMO=1
```

`NEXT_PUBLIC_*` 값은 빌드 결과에 포함된다. 기존 배포에는 새 값이 소급되지 않으므로 설정 후 반드시 새 production deployment를 만든다. 자세한 동작은 [Vercel environment variables](https://vercel.com/docs/environment-variables)를 참고한다.

## 3. Vercel 배포와 도메인 연결

1. 같은 Git 저장소로 새 Vercel Project를 만들고 Root Directory를 `template/apps/web`으로 지정한다. 모노레포의 `packages/*`를 읽어야 하므로 Root Directory 설정에서 **Include source files outside of the Root Directory in the Build Step**도 켠다.

2. Vercel Project의 Production 환경에 다음을 설정한다.

   - `CONVEX_DEPLOY_KEY`: 1단계에서 만든 데모 전용 키. Sensitive로 저장한다.
   - `NEXT_PUBLIC_JEOMWON_DEMO`: `1`
   - 그 밖의 웹 빌드에 필요한 일반 변수

   `apps/web/vercel.json`의 build command가 deploy key 대상 Convex에 백엔드를 배포하고, 그 URL을 `NEXT_PUBLIC_CONVEX_URL`로 웹 빌드에 전달한다.

3. `template/apps/web`에서 프로젝트를 연결하고 production 배포를 실행한다. 명령을 쓰지 않는 팀은 같은 설정으로 Vercel Dashboard에서 Deploy해도 된다.

   ```bash
   cd template/apps/web
   bunx vercel link
   bunx vercel --prod
   ```

4. 배포 후 페이지 상단에 `체험용 데모입니다 · 데이터는 매시간 초기화됩니다`가 보이는지 확인한다. 예약 챗으로 테스트 데이터를 만든 뒤 다음 정시 이후 데이터가 사라지고 리소스가 다시 보이는지도 확인한다.

5. 전용 도메인을 연결한다. `<domain>`과 `<vercel-project>`를 실제 값으로 바꾼다.

   ```bash
   bunx vercel domains add <domain> <vercel-project>
   bunx vercel domains inspect <domain>
   ```

   안내된 DNS 레코드를 등록하고 인증서 발급이 끝난 뒤 HTTPS로 접속한다. Vercel의 모노레포와 도메인 절차는 [Using Monorepos](https://vercel.com/docs/monorepos)와 [Working with domains](https://vercel.com/docs/domains/working-with-domains)를 참고한다.

## 4. 리셋 주기 변경하기

현재 주기는 `template/packages/backend/convex/crons.ts`의 다음 등록으로 정한다.

```ts
crons.hourly(
  "reset demo playground",
  { minuteUTC: 0 },
  internal.demoReset.resetPlayground,
  {},
);
```

- 매시간 실행 분만 바꾸려면 `minuteUTC`를 `0`부터 `59` 사이 값으로 변경한다.
- N시간 간격으로 바꾸려면 `hourly` 대신 `interval`과 `{ hours: N }`을 사용한다.
- 변경 후 Vercel production을 다시 배포해 Convex 함수와 cron 등록을 갱신한다.
- 긴급 중지할 때는 코드를 바꾸기 전에 플래그를 제거한다. cron 호출은 남지만 즉시 저비용 no-op이 된다.

  ```bash
  cd template/packages/backend
  bunx convex env --deployment <demo-deployment> remove JEOMWON_DEMO_RESET
  ```

## 5. 운영 배포 경고

> **경고: 운영 Convex 배포에는 `JEOMWON_DEMO_RESET`을 절대 설정하지 않는다.** 값이 `1`이면 해당 도메인의 예약, 채팅, 대기자, 에스컬레이션 데이터가 cron 실행 때마다 삭제된다. 배포 대상을 확신할 수 없다면 먼저 `bunx convex env --deployment <target> list --names-only`로 대상과 변수 이름을 확인하고, 데모 전용 배포가 아니면 작업을 중단한다.

데모를 종료할 때는 Convex의 `JEOMWON_DEMO_RESET`을 먼저 제거하고, Vercel의 `NEXT_PUBLIC_JEOMWON_DEMO`를 제거한 다음 새 production 배포를 만든다. 그 후 도메인과 deploy key를 폐기한다.
