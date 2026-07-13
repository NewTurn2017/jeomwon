# jeomwon 랜딩 디자인 브리프 (jeomwon.codewithgenie.com)

> ui-craft Craft Read — 작성: 2026-07-13. 이 문서가 카피·토큰·구성의 단일 진실 원천이다. 구현은 이 브리프를 따른다.

## Craft Read

- **표면**: 오픈소스 SaaS 킷 마케팅 랜딩, 정적 단일 페이지, 한국어 우선.
- **구성**: Product-forward 스플릿 히어로 (텍스트 좌 / 실동작 미니 컴포넌트 우, 우측 엣지·폴드에서 크롭).
- **DESIGN_VARIANCE**: 7 · **MOTION**: 5 (입장 페이드 + 호버, 섹션당 스크롤 리빌 1회 이하) · **CRAFT**: 8.
- **시그니처 벳 (정확히 1개)**: 히어로의 **자동 재생 카톡풍 예약 대화** — 타이핑 인디케이터 → 말풍선 순차 등장 → 예약 확정 카드. `prefers-reduced-motion`이면 전체 정적 표시.
- **전환 액션 (1개)**: GitHub 방문. 모든 섹션이 이 하나를 전진시킨다.

## 토큰

```css
--bg: #FBF8F3;            /* 따뜻한 크림 종이 */
--surface: #FFFFFF;
--ink: #16232B;           /* 딥 잉크 네이비 (본문/헤드라인) */
--muted: #5C6B76;
--accent: #136586;        /* = 제품 primary hsl(199 75% 30%) — 딥 페트롤 */
--accent-ink: #0E4A63;    /* 액센트 텍스트용 (크림 배경 AA) */
--accent-soft: #E1F2EF;   /* = 제품 accent 서피스 */
--border: rgba(22,35,43,.09);
--radius-s: 6px; --radius-m: 10px; --radius-l: 14px; --radius-bubble: 18px;
```

- 폰트: **Pretendard Variable** (jsdelivr dynamic-subset CSS import) 단일. 코드 블록은 시스템 모노 스택(`ui-monospace, SFMono-Regular, Menlo, monospace`).
- 대형 헤드라인 `letter-spacing: -0.02em`, `text-wrap: balance`. 숫자는 `tabular-nums`.
- 액센트 예산: 폴드 위 3–5회 (히어로 primary CTA, 점원 말풍선, 플로팅 카드 상태 pill, 로고 마크). 그 외 90% 뉴트럴.
- 라이트 모드 전용 (`color-scheme: light`). 그림자는 레이어드(앰비언트+디렉트), 두꺼운 컬러 보더 금지.

## 기술 제약

- **순수 정적**: `site/index.html` + `site/style.css` + `site/main.js` + `site/assets/`. 빌드 스텝·프레임워크·외부 JS 라이브러리 금지. Pretendard CDN CSS 한 줄만 외부.
- `lang="ko"`, 시맨틱 랜드마크, `focus-visible` 링, 모든 인터랙티브 44px 터치 타깃, `prefers-reduced-motion` 전면 존중, 입장 애니메이션 ≤400ms, `transition: all` 금지.
- SEO/공유: title `점원 (jeomwon) — AI 점원이 지키는 오픈소스 예약 SaaS 킷`, meta description, OG/Twitter 카드(`assets/og.png`, 1200×630), canonical `https://jeomwon.codewithgenie.com`, `assets/favicon.svg`(아래 명세).
- 반응형: 모바일에서 히어로 텍스트 우선 스택, 채팅 데모는 아래로, 가로 스크롤 0.

## 에셋

- `assets/storefront.jpg` — 페이퍼컷 스토어프런트 일러스트, 1440px 폭 (기능 Row A 비주얼). alt: "종이공예 스타일의 동네 가게 일러스트 — 점원과 고객이 말풍선으로 대화".
- `assets/og.png` — OG 카드 1200×630.
- `assets/favicon.svg` — 구현 시 제작: 딥 페트롤(#136586) 라운드 사각(radius ~22%) 위에 흰색 굵은 "점" 한 글자 중앙 배치. 폰트 없는 환경 대비 `<text>` 대신 패스 아웃라인이 이상적이나, `<text font-family="system-ui">점</text>`도 허용.
- 로고 마크(나브/푸터): favicon과 동일 모티프의 인라인 SVG 미니 마크 + "점원" 워드마크 텍스트.

## 페이지 구성 + 확정 카피 (수정 금지, 오탈자 수정만 허용)

레이아웃 패밀리는 페이지 전체에서 반복 금지: 스플릿 히어로 / 가로 3스텝 / 교차 스플릿×2 / 풀폭 스탯 스트립 / 중앙 코드 블록 / 중앙 CTA. 업퍼케이스 아이브로우는 전체 1개 이하.

### 0. 나브

로고 마크+점원 · 링크: 작동 방식 / 기능 / 빠른 시작 · CTA(컴팩트 다크 버튼): `GitHub에서 시작하기`

### 1. 히어로 (스플릿: 카피 좌 / 채팅 데모 우)

- H1 (2줄): `가게 프런트에` / `AI 점원을 세우세요`
- 서브 (1문장): `도메인 인터뷰 한 번이면 고객 예약 챗, 관리자 대시보드, 수명주기 메일까지 — 열어보면 바로 돌아가는 오픈소스 SaaS 킷.`
- CTA: primary(액센트) `GitHub에서 시작하기` → https://github.com/NewTurn2017/jeomwon · ghost `빠른 시작 보기` → #quick-start
- 마이크로 트러스트 라인: `MIT 라이선스 · Convex + Next.js 16 + bun`
- 우측 비주얼: **카톡풍 채팅 미니 컴포넌트** (실제 위젯 문법: 좌우 정렬 말풍선, 한국어 상태 라벨, 점원 말풍선만 accent-soft 배경). 자동 재생 대화:
  1. 고객(우): `내일 오후 3시에 커트 예약 돼요?`
  2. 점원(좌, 타이핑 인디케이터 후): `네, 내일 15:00 커트 가능해요. 성함 알려주시면 바로 잡아둘게요.`
  3. 고객(우): `김민지요`
  4. 점원(좌): 예약 확정 카드 — 상단 상태 pill `확정`, 본문 `커트 · 내일 15:00 · 김민지`, 하단 캡션 `취소는 하루 전까지 가능해요`
- 채팅 프레임 위 **플로팅 증거 카드** (대시보드 알림 스타일, 살짝 겹침): `새 예약이 확정됐어요` / `김민지 · 커트 · 15:00` + 상태 pill. 채팅 컴포넌트는 우측 엣지에서 크롭되어 스크롤을 유도.

### 2. 작동 방식 (가로 3스텝, id="how")

섹션 헤딩: `말 한마디에서 SaaS까지, 세 단계`

1. `도메인을 말하면` — Claude Code에서 "PC방 좌석 예약 만들어줘" 한 마디. 스킬이 도메인 팩 하나로 인터뷰합니다.
2. `bootstrap 한 번이면` — 스캐폴드, 도메인 주입, 오프라인 검증까지 커맨드 하나로 끝. 터미널 스니펫(모노): `bun skill/scripts/bootstrap.mjs my-shop domain-pack.json`
3. `증명까지 끝` — bun setup으로 자격증명을 연결하고, 라이브 QA 9게이트가 동작을 증명합니다.

### 3. 기능 (교차 스플릿 정확히 2행, id="features")

**Row A** (일러스트 좌 / 카피 우): 헤딩 `고객은 대화만 하면 됩니다` — 본문: `카카오톡처럼 익숙한 챗 위젯으로 예약, 변경, 취소가 끝납니다. 고객 화면에는 원시 에러도 내부 enum도 보이지 않습니다.` 비주얼: `assets/storefront.png`

**Row B** (카피 좌 / 미니 컴포넌트 우): 헤딩 `사장님은 승인만 하면 됩니다` — 본문: `대시보드는 행동 순서대로: 에스컬레이션 큐에서 승인/유지, 그다음 예약 목록, 그다음 에이전트 타임라인. Convex 실시간이라 새로고침이 없습니다.` 비주얼: **에스컬레이션 카드 미니 컴포넌트**(실제 대시보드 문법) — 카드: 상태 pill `에스컬레이션` · `취소 기한 지난 변경 요청 — 김민지 · 커트 · 내일 15:00` · 버튼 [승인] [유지]

### 4. 증거 스트립 (풀폭, 큰 숫자 3개, tabular-nums)

- `9게이트` — 라이브 QA가 해피패스부터 홀드 만료까지 증명
- `10개` — 실전 디버깅에서 살아남은 불변식, 전부 Convex mutation 안에서 강제
- `8필드` — 고객에게 공개되는 PublicContext는 정확히 8필드뿐

### 5. 빠른 시작 (중앙 코드 블록, id="quick-start")

섹션 헤딩: `5분이면 시작합니다`

코드 블록 1 (Claude Code와 함께, 복사 버튼):
```
git clone https://github.com/NewTurn2017/jeomwon.git && cd jeomwon
ln -sfn "$(pwd)/skill" ~/.claude/skills/jeomwon
# Claude Code에서: "PC방 좌석 예약 시스템 만들어줘"
```

코드 블록 2 (Claude Code 없이):
```
cd template && bun install
bun setup   # Convex·OAuth·메일 자격증명 위저드
bun dev     # web + app + backend 병렬 실행
```

캡션: `자세한 내용은 README와 skill/REFERENCE.md에 있습니다.`

### 6. 마지막 CTA (중앙)

헤딩: `오늘 저녁, 가게에 AI 점원을 세워보세요` · CTA `GitHub에서 시작하기` · 마이크로 트러스트 라인 반복.

### 7. 푸터 (심심하게)

로고 마크 · `점원 (jeomwon)` · GitHub · MIT License · `© 2026 NewTurn2017` · `Convex + Next.js 16 + bun`

## 수용 기준 (구현 후 자가 점검)

- [ ] 스퀸트 테스트: H1 → primary CTA 순서로 시선, 경쟁 요소 없음
- [ ] 전환 액션 1개(GitHub), CTA 라벨은 인텐트당 1개(`GitHub에서 시작하기` 재사용)
- [ ] 채팅 데모가 우측 엣지/폴드에서 크롭 — 허공에 뜬 비주얼 금지
- [ ] 균일 아이콘 카드 그리드 0개 · 이모지 아이콘 0개 · 보라-시안 그라디언트 0개
- [ ] 섹션 간격 80–160px 가변 · 인접 섹션 레이아웃 패밀리 중복 금지
- [ ] 업퍼케이스 아이브로우 ≤1 · 스크롤 유도 문구/화살표 금지
- [ ] 액센트는 #136586 하나, 폴드 위 3–5회
- [ ] `prefers-reduced-motion` 존중, 입장 ≤400ms, `transition: all` 금지
- [ ] 모바일(390px): 가로 스크롤 0, CTA 엄지 도달, H1 줌 없이 가독
- [ ] OG/파비콘/캐노니컬/메타 디스크립션 완비
