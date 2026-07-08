# M2 — 스킬 suite: 코드확장 규약 (Code Extension Contract)

날짜: 2026-07-08 · 브랜치: `m2-skill-suite` · 상태: 설계 확정(사용자 승인: 접근안 A + 생성물 확장 1차 + 노쇼 마킹 실증)

## 1. 목표

에이전트가 **불변식(Session Rules)을 지키며 생성물(스캐폴드된 앱)에 전문 기능을 코드로 안전하게 추가하는 경로**를 스킬-가이드 규약으로 신설한다. M1 대기자 파일럿이 실증한 seam(자기 모듈 + 명명된 훅 + off-default 토글 + SKIP-aware QA 게이트)을 재사용 가능한 확장 레시피로 정식화한다.

## 2. 배경과 제약

- **결정 ②** (VISION.md:74): 팩 토글 견고화 먼저, 코드 전문기능은 스킬-가이드 컨벤션(불변식 상속 + 정해진 시퀀스). 정식 플러그인 프레임워크는 확장 패턴 3+ 반복 시. → **M2는 문서 규약만. 새 기계장치(extend.mjs, registry, 보일러플레이트 생성기) 금지.**
- **결정 ④** (VISION.md:76): 단일 `jeomwon` 스킬 유지, REFERENCE에 코드확장 규약 신설. 스킬 쪼개기 금지.
- 현재 문서는 확장을 **금지로만** 서술: `SKILL.md:33` "inject.mjs is the only path that writes domain-specific names", `REFERENCE.md:5` "Top-level keys are fixed". 이 제한은 **팩/inject 경로에 한정**됨을 명확히 하고, 그 밖의 코드확장 positive 경로를 규약으로 연다.
- **1차 적용 대상은 생성물 확장** (사용자 확정). 레시피 자체는 template 확장에도 통용되며(M1이 이미 실증), 규약 본문은 적용처를 명시한다.

## 3. 산출물

1. **`skill/REFERENCE.md` — "Code Extension Contract" 섹션 신설** (4절의 내용 요구)
2. **`skill/SKILL.md` — 확장 진입점 포인터 한 줄** (Fast Path 밖의 후속 요청 시 REFERENCE 규약으로 라우팅)
3. **blind-agent 실증**: showcase 팩에서 scaffold한 생성물에 노쇼 마킹을 규약대로 추가 (5절 프로토콜)
4. **문서 갱신**: `FEATURES.md`(174–175행 "스킬은 설정 생성기" 서술 갱신), `VISION.md` 로드맵 M2 완료 표기

## 4. 규약 내용 요구사항 (REFERENCE 섹션이 담아야 할 것)

- **불변식 상속 선언**: Session Rules 전체가 확장 코드에도 그대로 적용됨을 명시. 특히 — Convex 뮤테이션 불변식 강제(충돌·홀드만료·상태전이·취소정책), store timezone 달력 기준 시간 평가, PublicContext/InternalContext 분리(공개 표면 grep-clean), `thread_id`는 인증 아님.
- **정해진 시퀀스** (확장 레시피, M1 waitlist가 참조 구현):
  1. 자기 모듈 `convex/engine/<feature>.ts` — 확장 로직은 자기 모듈에 격리
  2. 코어 접촉은 **명명된 훅**으로만 — 기존 훅(예: `onSlotFreed`) 재사용 우선, 신규 훅 필요 시 명명·배치 규칙
  3. **off-default 토글** — inject 재실행에 살아남는 배치(7절 하드 요구)
  4. audit 이벤트 기록(+dedupe 패턴), 메일 종류 추가 시 등록 지점 3곳(kinds/validator/actor 매핑)
  5. **SKIP-aware QA 게이트 추가** — 토글 off면 SKIP, on이면 실검증
  6. 검증 커맨드 시퀀스(typecheck → lint → build → `bun run qa`)
- **Must-NOT**: 코어 엔진 모듈(`availability/policy/lifecycle`) 직접 수정 금지, 코어 상태 전이 규칙 변경 금지, 새 테이블은 기존 테이블 재사용 우선 검토 후(M1 전례), 고객 PII 수집 확대 금지, 공개 payload에 내부 키 노출 금지.
- **M1 waitlist 참조 포인터**: `engine/waitlist.ts`, 호출부 3곳, 게이트9 — 파일 경로 명시.

## 5. 실증 프로토콜 (blind-agent)

규약의 진짜 검증 대상은 "**에이전트가 규약 텍스트만 보고 불변식을 지키며 완주할 수 있는가**"이다.

1. showcase 팩(`~/dev/side/jeomwon-showcase/01-salon-hair/domain-pack.json` 등 1개 선정)에서 생성물 scaffold. **주의: showcase는 팩+프롬프트만 있는 비-git 디렉토리 — scaffold·env 준비는 오케스트레이터 수행.**
2. Convex 배포 준비는 오케스트레이터(네트워크·auth 보유) 몫.
3. **fresh Codex 태스크**(규약 작성 컨텍스트 없음)에 (a) 생성물 경로, (b) 노쇼 마킹 기능 요구(6절), (c) "REFERENCE.md의 Code Extension Contract를 따르라"만 제공.
4. 결과 판정: QA 그린(신규 게이트 포함, 기존 게이트 회귀 없음) + 규약 시퀀스 준수 여부 리뷰.
5. **에이전트가 막히거나 규약을 어긴 지점 = 규약의 결함** → REFERENCE 본문 수정으로 환류. 이 환류가 M2의 핵심 산출물.

## 6. 노쇼 마킹 기능 경계 (실증용 최소)

- 확정(confirmed) 예약이 시작 시각 경과 후에도 이행 확인이 없을 때, 운영자가 **노쇼로 마킹**할 수 있다.
- 마킹은 audit로 기록되고 중복 마킹은 방지된다. 시간 판정은 store timezone 기준.
- **자동 제재·차단·수수료 없음** (mark-only — M1 notify-only와 같은 정신). 고객 이메일/PII 수집 없음.
- 구현 메커니즘(상태 필드 vs audit 조회, 표면 선택)은 blind 에이전트가 규약 안에서 스스로 결정 — 미리 설계하면 실증이 오염됨.

## 7. 하드 요구

- **inject-safe 토글**: `inject.mjs`는 `domain.config.ts`를 재생성하므로, 생성물에서 확장 토글이 inject 재실행에 지워지지 않는 배치여야 한다. 메커니즘(별도 확장 설정 파일 등)은 플랜 단계에서 repo 근거로 확정.
- 킷 커밋물은 `skill/` 문서(+실증 중 드러난 template seam 보완, 필요 시)만. 실증 생성물은 킷에 커밋하지 않는다.
- `upstream/`, `docs/upstream-report.md` 수정 금지. main 직접 커밋 금지(본 브랜치 사용).

## 8. 비목표

- extend.mjs·registry·플러그인 프레임워크·스킬 분할 (결정 ②④ 유보 사항)
- 노쇼 자동 제재, 보증금·멤버십·다지점 (후속 확장 후보)
- template에 노쇼 builtin 추가 (M1 경로의 반복 — 한계가치 없음)

## 9. 검증 게이트

| 대상 | 게이트 |
|---|---|
| 킷 (skill/ 문서 변경) | 오프라인: typecheck/lint 해당 없음(문서) → template 회귀: `cd template && bun run qa` 9게이트 그린 유지 |
| 킷 (template seam 보완 발생 시) | `bun run qa` 9게이트 + waitlist flip 검증 |
| 실증 생성물 | 확장 후 QA 그린: 기존 게이트 회귀 없음 + 신규 노쇼 게이트(SKIP-aware) PASS |
| 규약 자체 | blind 에이전트 완주 + 위반 0 (위반 발견 시 규약 수정 후 재실증) |

## 10. 완료 조건

1. REFERENCE에 Code Extension Contract 신설, SKILL 포인터 추가
2. blind 실증: 노쇼 마킹 QA 그린, 규약 결함 환류 반영
3. FEATURES·VISION 갱신
4. 브랜치 커밋 완료 (머지·push는 사용자 결정)

## 11. 플랜 단계 확정 항목

- inject-safe 토글 메커니즘 (7절)
- 실증용 showcase 팩 선정과 scaffold·Convex env 준비 절차
- 신규 QA 게이트를 생성물 qa.ts에 추가하는 규약 문구(게이트 번호·SKIP 규칙)
- 신규 훅이 필요한 경우의 명명·배치 규칙 문구
