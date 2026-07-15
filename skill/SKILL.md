---
name: jeomwon
description: Build a Jeomwon reservation SaaS project from a domain interview. Use when creating, scaffolding, injecting, or verifying a jeomwon project from a domain pack JSON, especially for reservation desks, services, seats, rooms, day-unit stays, customer support chat, Convex setup, or admin widgets.
---

# Jeomwon

Use this skill to turn one operational reservation domain into a generated Jeomwon project: an AI 점원이 가게 프런트를 지키는 agentic CS SaaS kit. Keep the conversation narrow: ask only for facts that affect routing, policy, availability, widget choice, feature toggles, or customer-facing copy.

## Fast Path

1. Interview for a single domain pack JSON and save it to a file.
2. Bootstrap the deterministic pipeline (scaffold → inject → offline verify) with one command:
   - Repo clone: `bun skill/scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>` from the kit repo; it uses local `template/`.
   - Skill-only install: `bun scripts/bootstrap.mjs <target-dir> <project-name> <domain-pack.json>` from the installed skill; when local `template/` is absent scaffold downloads the GitHub tarball (`JEOMWON_TEMPLATE_REF`, default `main`; `JEOMWON_TEMPLATE_ARCHIVE` for offline tarballs).
   Bootstrap is offline-only: it strips an ambient `JEOMWON_QA_BASE_URL` from its verify step so it never runs live QA, and it never runs `bun setup`. On success it prints the generated path and the next steps below; on the first stage failure it stops and prints that stage's exact rerun command.
3. Tell the user to run `bun setup` inside the generated project for Convex, Google OAuth, Resend, OpenAI, and optional Polar. This is a separate interactive step — bootstrap does not run it.
4. Tell the user to run `bun run qa` (live 11-gate) after `bun setup`; the command verifies one canonical dev deployment and starts the authenticated app itself. This is also separate from bootstrap. Google operator success CRUD is a separate approval-owned smoke, not part of deterministic gate 10.

Use the individual `scaffold.mjs`, `inject.mjs`, and `verify.mjs` commands (Script Contract below) for retries, partial reruns, and debugging after a bootstrap failure.

## Interview Order

Ask top to bottom. Every question below maps to exactly one field the `inject.mjs` validator checks — ask nothing outside this list, invent no field, and read every **bold** derived value back to the owner before moving on. Stop only when every validated field is explicit. Do not silently default business hours, slot units, capacity, or copy.

1. **Store identity + reservation key.**
   - `storeName`, `storeTimezone` (예: `Asia/Seoul`), `locale` (`ko-KR` 또는 `en-US`).
   - `domainKey`: "예약번호와 데이터에 붙일 짧은 영문 식별자 하나를 정해주세요 (소문자·숫자·하이픈만, 예: `hair-shop`)." 이 값은 DB 파티션 키이자 예약번호 접두사입니다. 읽어주기: **"그러면 예약번호는 `HAIR-SHOP-000123` 형태로 발급됩니다."** (`domainKey`는 소문자 슬러그여야 함.)

2. **Resources — capacity fan-out (do NOT ask "capacity assumptions"; it maps to no field).**
   - "한 번에 몇 팀·몇 명을 받을 수 있습니까? 동시에 서비스되는 자리를 하나씩 자원으로 등록합니다 — 6인실이면 좌석 6개로, 한 번에 한 팀만 받는 방이면 자원 1개로." 자원마다 `key`(슬러그), `label`, `kind`(`person`/`seat`/`room`/`unit`)를 받습니다.
   - 읽어주기: **"등록된 자원: ① 창가석, ② 홀석 … 총 N개."** (`resources`는 비어 있으면 안 되고, 각 `key`는 유일한 슬러그, `kind`는 네 값 중 하나.)

3. **Services — slot unit is PER SERVICE (never omit it).**
   - 서비스마다 `key`(슬러그·유일), `label`, `resourceKind`(반드시 위에서 등록한 어떤 자원의 `kind`와 일치), 선택 `price`(문자열), 그리고 **서비스별 `slotUnit`**(`minutes:30`/`hour`/`day`)을 받습니다. 필요하면 `durationMinutes`(양의 정수, 단위의 배수)를 함께 받습니다.
   - `slotUnit`을 비우면 조용히 30분으로 굳어져 "겉보기엔 되는데 실제로는 다른 앱"이 나옵니다. 절대 빈 채로 두지 말고 서비스마다 명시적으로 확정한 뒤 읽어주기: **"<서비스> = <단위> × <N> = <총 소요시간>"** (예: "커트 = 30분 × 2 = 60분").
   - **숙박형(`slotUnit: "day"`)이면** `dayUnit`도 받습니다: `checkInTime`·`checkOutTime`(둘 다 `HH:MM`, **30분 격자**에 맞춤, 예 `15:00`/`11:00`)과 `checkInLabel`·`checkOutLabel`. `dayUnit`은 `slotUnit`이 `day`일 때만 허용됩니다.

4. **Business hours — ask per weekday, all seven.**
   - "요일별 영업 시작·종료 시각과 정기 휴무 요일을 알려주세요." monday…sunday 각각에 대해 정기 휴무면 `{ closed: true }`, 아니면 `{ open, close }`(둘 다 `HH:MM`, **`open`이 `close`보다 빨라야 함**)를 기록합니다.
   - 필수 분기: "24시간 영업입니까? 자정을 넘겨 영업합니까?" **자정을 넘기면(예 22:00–02:00) 여기서 멈추고 경고**하세요 — 스키마는 하루 안에서 `open < close`만 표현할 수 있어 자정 교차를 담지 못합니다. 사장님이 구간을 나누거나 종료 시각을 자정 이전으로 잡아야 합니다.
   - 읽어주기: **주간 영업표** 전체. (7개 요일 키 모두 필수, 각 `open`/`close`는 `HH:MM`, `open`은 `close`보다 앞.)

5. **Blackout dates (optional, but format-gated).**
   - "임시 휴무나 예약을 막을 특정 기간이 있나요? 없으면 넘어갑니다." `blackouts`는 비워도 됩니다. 각 항목은 `startIso`·`endIso`(파싱 가능한 ISO 타임스탬프, **`start`가 `end`보다 앞**, 예 `2026-08-15T00:00:00+09:00` → `2026-08-16T00:00:00+09:00`)와 선택 `reason`. 각 구간을 읽어주기.

6. **Policies — positive integers only; confirmation is a fact, not a question.**
   - `cancelWindowHours`: "예약 몇 시간 전까지 취소할 수 있습니까?" / `holdMinutes`: "임시 홀드를 몇 분간 유지합니까?" 둘 다 **양의 정수**여야 하므로 "언제든 취소"·"홀드 없이" 같은 답은 그대로 받지 말고 구체적 숫자로 옮겨 확인하세요(제한이 사실상 없으면 충분히 큰 양의 정수로).
   - 사실로 고지(질문하지 말 것): "확정 전 확인 절차(`policies.confirmationRequired`)는 항상 켜져 있습니다" — 고정 리터럴 `true`라 선택지가 아닙니다. (고객에게 보일 확인 요청 **문구**는 10번 `confirmationRequired` 카피에서 따로 받습니다.)

7. **Admin widget — ask the operator's mental model.**
   - "예약을 시간표를 훑듯이 보십니까(캘린더), 아니면 좌석 배치도를 보듯이 보십니까(좌석 그리드)?" 답에 따라 `adminWidget`을 `calendar` 또는 `seatGrid`로 정하고 읽어주기: **"관리자 화면은 <시간표 캘린더 | 좌석 배치도>로 그려집니다."**

8. **Optional kit feature flags — ask both.**
   - waitlist: "자리가 차면 대기자를 받고 취소가 나면 알릴까요?" → `features.waitlist`.
   - operatorCalendarCrud: "사장님이 캘린더에서 예약을 직접 등록·수정·삭제해야 합니까?" → `features.operatorCalendarCrud`. **예 ⇒ `adminWidget`은 반드시 `calendar`여야 합니다** (인젝터가 `operatorCalendarCrud: true` + 다른 위젯을 하드 실패시킴). 물으면 기록하고, 안 물으면 두 값 모두 `false`로 굳습니다.
   - 고객 로그인과 자기 예약 관리는 모든 생성 프로젝트의 기본 계약입니다. 선택 질문을 하지 말고 compatibility 필드 `features.customerAccounts`는 `true`로 기록합니다.

9. **Email + operator address — split so neither is skipped.**
   - "예약 확인·리마인더 메일을 보낼까요?" → `features.email`(boolean). 결제 연동 여부 → `features.polar`(boolean).
   - 위 답과 무관하게: "운영 알림을 받을 사장님 이메일 주소 하나는 반드시 필요합니다." → `notificationEmail` (조건 없이 필수, 이메일 형태여야 함).

10. **Customer-facing copy — the store's VOICE; ask 18 with field names shown, derive the 19th.**
    - 카피는 배치로 묻되 **필드 이름을 보여주며** 받습니다(그래야 지어내지 않습니다). 모두 비어 있지 않은 문자열이어야 합니다.
    - 챗 외피: `chatTitle`, `chatGreeting`, `chatPlaceholder`.
    - 거절·가드레일: `relevanceRefusal`, `confirmationRequired`(확인 요청 문구), `privacyRefusal`, `schemaError`, `guardrailBanner`.
    - 흐름 응답: `availabilityIntro`, `holdCreated`, `confirmed`, `rescheduled`, `cancelled`, `cancelEscalated`, `holdExpired`.
    - 다음 단계 안내: `nextStepAvailability`, `nextStepHold`, `nextStepConfirmed`.
    - **파생(묻지 말 것)**: `policySummary`는 6번의 `cancelWindowHours`·`holdMinutes`에서 직접 만들어냅니다(예: "예약 N시간 전까지 취소 가능, 홀드는 M분 유지"). 톤 확인용으로 읽어주기: "이 문구 톤 괜찮으세요?"

마지막으로 파생·핵심 값(예약번호, 자원 목록, 서비스별 소요시간, 주간 영업표, 관리자 위젯, 정책 문구)을 한 번에 다시 읽어주고 확정합니다.

## Output Contract

The Fast Path interview must converge to exactly one domain pack JSON object. Its shape is defined in [REFERENCE.md](REFERENCE.md) and examples live in [EXAMPLES.md](EXAMPLES.md). During Fast Path pack/inject generation, do not generate domain-specific code outside that pack; `inject.mjs` is the only path that writes domain-specific names into the project.

For a follow-up request to extend code in a generated project or harden a template seam, first use the [REFERENCE.md](REFERENCE.md) `Code Extension Contract`. Keep `inject.mjs` for domain-pack regeneration only.

## Script Contract

- `bootstrap.mjs <target-dir> <project-name> <domain-pack.json>` is the standard one-command deterministic path — a thin sequencer that runs `scaffold.mjs`, then `inject.mjs`, then `verify.mjs`, resolving them as its own siblings so it works from a repo clone or an installed skill. The first argument is the target, the last is the pack, and the words between are the project name. It is offline-only: it deletes an ambient `JEOMWON_QA_BASE_URL` from the verify step and never runs live QA, and it never runs `bun setup`. On the first stage failure it stops, names the stage, and prints one `Recovery: bun <script> ...` line for that stage; it never deletes a target, so a non-empty or partial target must be inspected and removed manually before rerunning. On success it prints the generated path and the `bun setup` → `bun run qa` next steps as guidance only (it does not run them).
- `scaffold.mjs` copies `template/` into a target directory, excludes dependency/build/env artifacts, replaces `@jeomwon/` with the project npm scope, and prints the next commands.
- `inject.mjs` validates the domain pack JSON and writes generated domain config plus the optional email sample. The scaffolded `jeomwonSeed.ts` remains the single seed source and is never regenerated by injection.
- `verify.mjs` runs offline install, typecheck, lint, build, and optionally QA when `JEOMWON_QA_BASE_URL` points at the running generated authenticated app (`apps/app`).
- The individual `scaffold.mjs`, `inject.mjs`, and `verify.mjs` commands stay the retry, partial-execution, and debugging entrypoints — run them directly to rerun a single stage after a bootstrap failure.

## Guardrails

- Never edit `upstream/v1/` or `docs/` while using this skill.
- Never hardcode domain proper nouns outside the domain pack JSON or files generated from it.
- Keep secrets out of the domain pack. Setup credentials belong in `bun setup` only.
- Treat `thread_id` as continuity/routing only; it is never identity, authentication, or authorization.
- For `slotUnit: "day"`, collect check-in/check-out times and labels in `service.dayUnit`.
