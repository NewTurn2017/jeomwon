# Pension Stay — jeomwon 생성 샘플

이 디렉터리는 [jeomwon](https://github.com/NewTurn2017/jeomwon) 킷의 **셀프 증명 샘플**입니다.
`skill/EXAMPLES.md`의 Pension Stay 도메인 팩(일 단위 숙박, `room` 리소스, 체크인 15:00 / 체크아웃 11:00)을
`bootstrap.mjs`에 넣어 실제로 생성한 결과물을 그대로 커밋했습니다 (`VERIFY PASS` 확인 후).

고객은 공개 웹 페이지에서 채팅으로 숙박 예약을 문의하고, 운영자는 관리자 앱에서
예약 상태와 확인 필요 요청을 관리합니다. 슬롯 충돌·홀드·취소 기한 같은 불변식은
전부 Convex mutation 안에서 강제됩니다.

## 구성

```text
apps/web         고객용 예약 웹 앱
apps/app         운영자 관리자 앱
packages/backend Convex 함수, 예약 도메인 설정, 에이전트 도구
packages/agents  예약 에이전트 런타임 연결
packages/email   예약 및 구독 이메일 템플릿
packages/ui      Tailwind v4 + shadcn 기반 공용 UI
tooling          공유 TypeScript 설정
```

## 직접 생성해 보기

이 샘플과 같은 프로젝트를 새로 만들려면 킷 루트에서 한 줄이면 됩니다:

```bash
bun skill/scripts/bootstrap.mjs my-pension pension-stay pension-pack.json
```

도메인 팩 JSON은 `skill/EXAMPLES.md`의 Pension Stay 섹션에 있습니다.

## 실행

```bash
bun install
bun setup        # Convex 프로비저닝, JWT 키 생성, Google OAuth / Resend / OpenAI 안내
bun dev          # web + app + backend 병렬 실행
```

개별 앱만 실행하려면 `bun dev:web` 또는 `bun dev:app`을 사용합니다.

## 주요 설정

상점명, 서비스, 리소스, 영업 시간, 예약 정책, 고객 안내 문구는
`packages/backend/domain.config.ts`에서 관리합니다. 고객용 웹 앱은 이 설정의
공개 정보만 읽어 화면과 메타데이터를 구성합니다.

## 개발 검증

```bash
bun run typecheck
bun run lint
bun test         # 엔진 순수 함수 단위 테스트
bun run qa       # 라이브 QA — Convex 준비부터 서버 기동·정리까지 원커맨드
```

`bun run qa`는 `dev:` 배포가 아니면 실행을 거부합니다 — 해당 도메인의 예약·챗
데이터를 초기화하기 때문입니다. 자세한 QA 규약은 킷 루트 README를 참고하세요.

## 라이선스

킷 루트의 [MIT LICENSE](../../LICENSE)를 따르며, 파생원(get-convex/v1)의
원저작권 고지는 `LICENSE.md`에 유지됩니다.
