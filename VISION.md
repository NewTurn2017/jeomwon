# Jeomwon — Vision & Roadmap

> 이 문서는 jeomwon을 "핵심 기능이 라이브러리 수준으로 미리 구현되고, 모듈식으로 조립·연결되며, 조금만 바꾸면 바로 쓰는" 예약 SaaS 킷으로 디벨롭하기 위한 북극성이다.
> 상태: **결정 확정 (v1)** — "열린 결정" 6개 확정(2026-07-07). 아래 5번 참고.
> 근거: 2026-07-07 세션(06 웨비나 쇼케이스 정식 첫 빌드)에서 관측한 현재 상태 기반.

---

## 1. 북극성 (North Star)

> **뼈대(skeleton)를 세워두고 → 코딩 에이전트가 스킬을 써서 그 SaaS의 전문 기능을 쉽게 만들고 수정한다.**

- **핵심 기능 pre-built**: 예약 SaaS의 공통 골격(예약 수명주기·챗·관리자·인증·결제·메일)이 라이브러리 수준으로 이미 구현.
- **minimal-change 사용**: 새 업종은 인터뷰 10분 + 도메인 팩 하나로 바로 실사용.
- **모듈식 조립**: 전문 기능(대기자·보증금·노쇼·멤버십·다지점…)을 필요에 따라 켜고/붙이고/조합.
- **스킬-가이드 확장**: 에이전트가 스킬의 불변식(Session Rules)을 물려받아 **코드까지 안전하게** 확장/수정.

---

## 2. 현재 상태 (정직하게, 이번 세션 관측 기반)

### 2.1 구성
- **뼈대 = `template/`** — Convex 백엔드 · Next 웹/관리자 · agents 런타임 · 예약 수명주기 · 이메일 · 인증. 모노레포(`packages/*`, `apps/*`).
- **스킬 = `skill/`** (name: `jeomwon`) — 인터뷰 → 도메인 팩 JSON → `scaffold`/`inject`/`verify`. 파일 4 + 스크립트 3.
- **커스터마이즈 레버 = `domain-pack.json`** — 리소스·서비스·slotUnit·businessHours·정책·위젯·features(email/polar)·copy. `inject.mjs`가 `domain.config.ts` + seed 재생성.

### 2.2 이미 되는 것 (골격 기능)
- 챗 기반 예약 수명주기: 가용성 → 홀드 → 확정 → 변경 → 취소 → 에스컬레이션.
- 가드레일: relevance/privacy/confirmation, 공개-내부 컨텍스트 분리.
- 관리자 위젯: `calendar` / `seatGrid`.
- 라이프사이클 메일: capture(키 없음) / sent(Resend).
- 인증: Google OAuth + 익명 dev 로그인.
- 선택 결제: Polar (features.polar).
- 8게이트 QA + 오프라인 verify 게이트.
- 리소스 4종(person/seat/room/unit) × slot 3종(minutes:30/hour/day) × 위젯 2종.

### 2.3 알려진 한계·버그 (이번 세션 발견)
- **[C · 해결 (M0.2)] 실 LLM 챗** — zod를 전역 v4로 올려(`@openai/agents@0.12` peer 충족) import 크래시 제거하고, `"openai"` 런타임에 OpenAI Agents SDK 실 추론을 배선. LLM이 tool(find/hold/confirm/cancel/reschedule/lookup)로 Convex 상태를 실제 구동. 관측: 실 키 3턴 예약(eligible→held→confirmed) 성공, fallback 없음. 결정론은 기본·QA·폴백으로 유지, 가드레일(privacy/relevance/confirmation)은 두 런타임 공통 결정론 선차단(방어심층).
- **[QA · 해결 (M0.3)] 하니스 business-hours-aware** — cancel-window 오프셋을 엔진의 순수 헬퍼(`isSlotAllowed`/`alignToSlot`/`isInsideCancelWindow`)로 계산해 **실제 열린 슬롯**을 창의 올바른 쪽에 앵커(floor/ceil 반올림)한다. 좁은 시간대/휴무일 팩처럼 창 안쪽 슬롯이 물리적으로 불가능한 실행 시각엔 escalation 검사를 **결정론적 SKIP**(runner에 SKIP 상태 추가). 검증: 순수 시뮬레이션 672 실행시각 × 웨비나/데모 팩 — 웨비나 0 misclassify·0 skip, 데모 feasible 590건 0 misclassify·불가 82건 skip. 라이브 `bun run qa` 8/8.
- **[스킬 범위] 스킬이 "설정 생성기"에 머묾** — SKILL.md Output Contract: *"Do not generate domain-specific code outside that pack; inject.mjs is the only path."* → **전문 기능을 코드로 만드는 경로가 스킬에 없다.** (북극성과의 가장 큰 갭)

### 2.4 이번 세션에 이미 고친 것 (커밋 대기, `template/`)
- `CONVEX_SITE_URL` 빌트인 setup 크래시 → `ensureConvexEnv` 가드.
- setup CLI 오버홀 — 색상·번호 섹션·**비밀키 마스킹 에코(•)**·인트로(필수/선택 안내)·완료 박스.
- `bun run qa` **원커맨드화** — `scripts/qa-local.ts`(dev 배포 안전차단·함수배포·mock 서버 자동 기동/종료·QA env 세팅/해제), `package.json` qa/qa:run, QA 중 이메일 capture 강제(실 RESEND 무해).

---

## 3. 갭 분석 (현재 → 북극성)

| 축 | 현재 | 북극성 | 갭 |
|---|---|---|---|
| 기능 | 고정 세트(예약 수명주기)만 | 모듈식 전문 기능 조립 | 대기자·보증금·노쇼·멤버십·다지점·리뷰·리마인더 등 **모듈화 + 조합 시스템** 필요 |
| 커스터마이즈 | 팩 JSON(설정성) | 설정 + **코드 확장** | 팩 밖 기능을 안전하게 추가하는 경로 부재 |
| 스킬 | 단일 좁은 스킬 1개 | 스킬 묶음(suite) | `jeomwon-feature`/`-agent-tool`/`-policy` 등 확장 스킬 필요 |
| 에이전트 | 결정론 엔진(+깨진 openai 게이트) | 실 LLM or 하이브리드 확정 | 실 LLM 경로 복구/구현 or 결정론 확정 결단 |
| 라이브러리성 | template 내부에 뒤섞임 | 재사용 primitive(가용성·락·정책·위젯 엔진) | 경계 있는 라이브러리화 |

---

## 4. 로드맵 (마일스톤 초안)

- **M0 — 기반 안정화**: 대기 커밋 정리 · **issue C 해결**(zod 충돌 풀고 실 LLM 추론을 옵션으로 배선; 결정론=기본/QA 경로 유지) · QA 하니스 business-hours-aware 견고화 · 현행 기능 세트 문서화.
- **M1 — 코어 모듈화**: 예약 수명주기를 경계 있는 모듈로 정리 + 팩 토글 넘어서는 **feature registry/조합 시스템**.
- **M2 — 스킬 묶음**: 에이전트가 불변식 준수하며 기능/툴/정책을 **코드로** 확장하는 스킬 suite.
- **M3 — 라이브러리 primitive**: availability engine · hold/lock · policy engine · widget kit을 재사용 라이브러리로 문서화.
- **M4 — DX & 갤러리**: 기능 모듈 갤러리 · 예제 · 테스트 · 원커맨드 플로우.

---

## 5. 확정된 결정 (2026-07-07)

1. **에이전트 → 하이브리드**: 결정론 엔진을 기본값·QA 경로로 유지하고, 실 LLM 추론을 **옵션으로 실제 배선**. issue C(zod 충돌)는 회피가 아니라 **해결**한다.
2. **모듈 시스템 → 팩 토글 먼저 + 코드확장은 스킬 규약**: 현행 `features` 토글을 견고화하고, 코드 전문기능은 스킬-가이드 컨벤션(불변식 상속 + 정해진 시퀀스)으로 안전 확장. 정식 플러그인 프레임워크는 확장 패턴이 3개+ 반복될 때.
3. **모노레포 → 현 구조 유지 + 폴더 경계만 정리**: `packages` 남발 금지. availability/policy/widget은 백엔드 내부 폴더 경계로만 분리. 여러 app에서 재사용이 실제 증명될 때만 패키지로 승격.
4. **스킬 입도 → 단일 `jeomwon` 스킬 + 코드확장 규약 추가**: 스킬 하나 유지, REFERENCE에 코드확장 규약 신설. 스킬 쪼개기는 확장 패턴이 반복된 뒤.
5. **타깃 → 오픈소스 지향·내부품질 먼저**: 상용 인프라(과금/멀티테넌시)는 안 짓고, 내부에서 견고히 굳힌 뒤 공개. `upstream/` 가드레일과 정합.
6. **폴더/네이밍 → 최소 정리 (현 위치 유지)**: `skill/` 폴더명·스킬명 `jeomwon` 유지, 기획문서는 루트. 지금 이동/개명 없음.

---

## 6. 원칙 (제안)
- pre-built core, minimal-change 사용.
- 모듈식·조합 가능 — 켜고/붙이고/조합.
- 스킬-가이드 안전 확장 — 불변식(Session Rules) 상속.
- 검증된 채 출고 — verify + 8게이트 QA는 모든 경로에 유지.
- 비밀은 팩 밖 · setup에만.

---

## 7. 건드리면 안 되는 것
- `upstream/` , `docs/upstream-report.md` — 수정 금지(README/skill 가드레일).
- 생성물(`app/`)에서 킷 버그 고치지 말 것 — 항상 `skill/`·`template/` 레벨에서 고치고 킷 repo에 커밋.
