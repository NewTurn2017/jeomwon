# OSS 공개 전 체크리스트

> 2026-07-12 감사 기준(추적 파일 320개 전수 스윕 + git 전체 히스토리 검사). 실제 공개(레포 public 전환)는 사용자 결정.

## 종합 판정

**공개 차단급 발견 0건.** 실 시크릿·개인 이메일·실명·프로덕션 키 유출 없음. git 히스토리에도 `.env.local`·`*.key`·deploy key가 커밋된 적 없음(`.env.example` 플레이스홀더 6종만 추적 이력). `upstream/` 제3자 클론은 gitignore로 추적 제외 확인, 벤더링된 `template/`·`samples/`는 MIT 원저작권(`Copyright (c) 2024 Midday Labs AB`)을 유지한 `LICENSE.md`를 동반 — 라이선스 위반 소지 없음.

## 이번 감사에서 정리한 것

- [x] `samples/pension-stay/UPSTREAM.md` — 로컬 절대경로(macOS 홈 디렉터리 경로라 username 노출) → `<repo-root>` 상대 표기로 치환.
- [x] `.gitignore` — 실재하지 않는 `template/UPSTREAM.md`를 가리키던 죽은 참조 주석 수정.

## 공개 전 사용자 결정 필요

- [x] **라이선스 선택 + 루트 `LICENSE` 추가** — 2026-07-13 MIT 확정(`Copyright (c) 2026 NewTurn2017`). 루트 `LICENSE` 추가, 추적 package.json 16개 정리(ISC 2곳 → MIT, 무필드 14곳에 MIT 추가).
- [x] **`docs/upstream-report.md` 하단 내부 로그 잔재 정리** — 2026-07-13 가드레일 일시 해제 후 최소 정리: 꼬리 하니스 로그 5줄(hook/tokens) 제거 + 헤더의 Codex 잡ID 제거. 본문 관측 내용은 불변.
- [x] **레포 메타 + public 전환** — 2026-07-13 description·토픽 7종 설정 후 사용자 승인으로 PUBLIC 전환 완료(`gh repo view` visibility=PUBLIC 확인). Convex 프로젝트 `m2-salon-noshow-proof`도 사용자가 대시보드에서 삭제 완료.

## 권고 (차단 아님)

- [ ] `docs/superpowers/specs/2026-07-09-m3-primitives-design.md`에 Convex dev 배포명(`dev:adamant-mole-272`)이 남음 — 키가 아닌 이름뿐이라 저위험. 역사 관측 문서라 본문 정정 대신 **공개 전 배포 재생성**(또는 감수) 권장. 같은 배포명이 dev 운영 중이므로 재생성 시 setup 재실행 필요.
- [ ] `START-HERE.md`(세션 인계 톤)·`VISION.md`·`FEATURES.md`(내부 로드맵)가 루트에 노출 — 내용상 무해하나 공개 첫인상 관점에서 `docs/` 이동 또는 톤 정리 검토.
- [x] README의 Next.js 버전 문구와 코드 실버전 일치 여부 확인 — 2026-07-13 확인: README "Next.js 16" = 실버전 `^16.2.10`, 일치.
- [x] package.json license 필드 — 2026-07-13 루트 LICENSE와 함께 16개 전부 MIT로 정리.
- [x] dev 배포(adamant-mole-272)의 JWT 키 로컬 세션 로그 노출 건 — 2026-07-13 RS256 키쌍 재생성 후 `JWT_PRIVATE_KEY`/`JWKS` 교체(값 비출력), 라이브 QA 9게이트 통과로 검증.

## 안전 확인된 것 (조치 불필요)

- `.gitignore`: `.env*`·`*.pem`·`*.key`·`qa-artifacts`·`upstream/`·에이전트 상태 디렉터리 전부 무시, 추적 누수 0건.
- `.env.example` 6종: 전부 빈 값 플레이스홀더.
- `RESEND_SENDER` 기본값 `onboarding@resend.dev`: Resend 공용 샌드박스 주소.
- `bun.lock`의 `eyJ...` 매치: npm 무결성 해시(false positive).
- GitHub 핸들 `NewTurn2017` 노출: 저장소 소유자, 의도적.
