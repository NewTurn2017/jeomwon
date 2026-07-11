# OSS 공개 전 체크리스트

> 2026-07-12 감사 기준(추적 파일 320개 전수 스윕 + git 전체 히스토리 검사). 실제 공개(레포 public 전환)는 사용자 결정.

## 종합 판정

**공개 차단급 발견 0건.** 실 시크릿·개인 이메일·실명·프로덕션 키 유출 없음. git 히스토리에도 `.env.local`·`*.key`·deploy key가 커밋된 적 없음(`.env.example` 플레이스홀더 6종만 추적 이력). `upstream/` 제3자 클론은 gitignore로 추적 제외 확인, 벤더링된 `template/`·`samples/`는 MIT 원저작권(`Copyright (c) 2024 Midday Labs AB`)을 유지한 `LICENSE.md`를 동반 — 라이선스 위반 소지 없음.

## 이번 감사에서 정리한 것

- [x] `samples/pension-stay/UPSTREAM.md` — 로컬 절대경로(macOS 홈 디렉터리 경로라 username 노출) → `<repo-root>` 상대 표기로 치환.
- [x] `.gitignore` — 실재하지 않는 `template/UPSTREAM.md`를 가리키던 죽은 참조 주석 수정.

## 공개 전 사용자 결정 필요

- [ ] **라이선스 선택 + 루트 `LICENSE` 추가** — 파생원(get-convex/v1)이 MIT이므로 MIT 권장. 저작권자 표기(예: `Copyright (c) 2026 NewTurn2017`)는 사용자 확정 필요. 선택 후 `template/packages/backend/package.json`·`samples/.../backend/package.json`의 upstream 잔재 `"license": "ISC"`도 일치시킬 것.
- [ ] **`docs/upstream-report.md` 하단 내부 로그 잔재 정리** — Codex 잡ID·토큰 사용량·hook 로그 등. 이 파일은 **수정 금지 가드레일** 대상이라 이번 감사에서 손대지 않음. 공개 전 가드레일을 일시 해제해 정리하거나, 공개 트리에서 제외할지 결정.
- [ ] **레포 메타** — GitHub description 비어 있음, 토픽 미설정. public 전환 시 함께.

## 권고 (차단 아님)

- [ ] `docs/superpowers/specs/2026-07-09-m3-primitives-design.md`에 Convex dev 배포명(`dev:adamant-mole-272`)이 남음 — 키가 아닌 이름뿐이라 저위험. 역사 관측 문서라 본문 정정 대신 **공개 전 배포 재생성**(또는 감수) 권장. 같은 배포명이 dev 운영 중이므로 재생성 시 setup 재실행 필요.
- [ ] `START-HERE.md`(세션 인계 톤)·`VISION.md`·`FEATURES.md`(내부 로드맵)가 루트에 노출 — 내용상 무해하나 공개 첫인상 관점에서 `docs/` 이동 또는 톤 정리 검토.
- [ ] README의 Next.js 버전 문구와 코드 실버전 일치 여부 확인.
- [ ] package.json 13개에 license 필드 없음 — 루트 LICENSE 확정 후 일괄 정리하면 충분.
- [ ] dev 배포(adamant-mole-272)의 JWT 키가 로컬 세션 로그에 노출된 적 있음(2026-07-12, `convex env list` 출력) — dev 전용이지만 공개 전 `npx convex auth` 키 재생성 권장.

## 안전 확인된 것 (조치 불필요)

- `.gitignore`: `.env*`·`*.pem`·`*.key`·`qa-artifacts`·`upstream/`·에이전트 상태 디렉터리 전부 무시, 추적 누수 0건.
- `.env.example` 6종: 전부 빈 값 플레이스홀더.
- `RESEND_SENDER` 기본값 `onboarding@resend.dev`: Resend 공용 샌드박스 주소.
- `bun.lock`의 `eyJ...` 매치: npm 무결성 해시(false positive).
- GitHub 핸들 `NewTurn2017` 노출: 저장소 소유자, 의도적.
