# 소상공인을 위한 Agentic SaaS 구축 1시간 실습

Gate 1 승인본 · 2026-08-08 · revision 1

| # | 시간 | 제목 | 레이아웃 | 목적과 증거 |
|---|---:|---|---|---|
| 1 | 1분 | 60분 안에 Agentic SaaS를 만드는 법 | `title-slide` + 생성 이미지 | 결과와 offline/live 경계를 짧게 약속 |
| 2 | 4분 | 사전 준비된 실제 앱: 한 슬롯, 두 요청 | 실제 앱 + 로컬 제품 지도 fallback | 고객 A/B 충돌과 운영자 기록. provider 권한 없으면 live만 BLOCKED |
| 3 | 2분 | 장재현, 만들고 운영하며 가르칩니다 | `big-statement` | SaaS 100+·프로젝트 200+·AI 풀스택 10년만 제시 |
| 4 | 3분 | 오늘 만들 업종을 고릅니다 | `card-grid` | 헤어살롱·PC방·펜션·풋살장 현장 투표, 동률이면 살롱 |
| 5 | 4분 | 예약 화면 뒤에는 운영 시스템이 있다 | `big-statement` + 생성 이미지 | Agentic SaaS와 단순 챗봇을 상태·책임으로 구분 |
| 6 | 4분 | Jeomwon은 생성기와 생성된 앱으로 나뉩니다 | 네이티브 아키텍처 다이어그램 | coding-time plane과 runtime plane 분리 |
| 7 | 4분 | Next.js·Convex·Vercel은 무엇을 맡나 | `comparison` | 두 Next 앱, Convex 권한, Vercel 배포 경계 구분 |
| 8 | 5분 | Convex DB: 데이터와 서버 규칙을 한곳에 | `card-grid` | tables·queries·mutations·scheduler를 비개발자 언어로 설명 |
| 9 | 4분 | 프롬프트보다 강한 것: mutation 불변식 | 네이티브 상태 다이어그램 | 충돌·홀드·확정·취소·권한은 Convex가 보장 |
| 10 | 5분 | 대화가 domain pack이 되고 제품이 된다 | `step-list` + 생성 이미지 | 인터뷰→자원·서비스·시간·정책·카피→JSON→제품 |
| 11 | 4분 | 수업 후 그대로 쓰는 프롬프트 사다리 | `code-block` | 인터뷰, 스키마화, 검토 프롬프트 제공 |
| 12 | 12분 | preflight → scaffold → inject → verify | 실제 터미널 | 실행 10분 + 문제 해결/fallback 2분, receipt와 정확한 marker 확인 |
| 13 | 3분 | 생성 다음 순서: setup → QA → Vercel | `step-list` | 계정·OAuth·dev deployment·QA contract v2의 12 gates·배포 체크리스트 |
| 14 | 3분 | 결제는 어디까지 되어 있나 | `comparison` | Polar 계정 구독과 미구현 예약 결제 분리 |
| 15 | 2분 | 월요일에 다시 만드는 7단계 | `closing` | 자료·첫 프롬프트·첫 명령 회수와 Q&A |

**합계: 60분**

## 현장 선택 규칙

1. 네 업종 중 거수 또는 QR 투표로 하나를 고른다.
2. 동률·무응답이면 헤어살롱을 사용한다.
3. 선택 도메인은 기존 capability matrix 안에서만 구성한다.
4. 새 기능 요청은 후속 확장 목록으로 분리한다.

## 강사 소개 범위

프로필 PDF에서 직무와 검증 가능한 성과만 사용한다. 학력, 생년월일,
이메일, SNS 등 강의 목적에 불필요한 개인정보는 슬라이드에 넣지 않는다.
