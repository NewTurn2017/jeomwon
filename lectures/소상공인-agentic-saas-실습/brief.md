# 소상공인을 위한 Agentic SaaS 구축 1시간 실습

- **무엇을**: 헤어살롱·PC방·펜션·풋살장 중 현장에서 고른 한 업종을 인터뷰하고, 운영 규칙을 `domain-pack.json`으로 만든 뒤 Jeomwon의 `scaffold → inject → verify` 파이프라인으로 예약 SaaS를 생성한다.
- **누구에게**: 터미널 명령을 복사·붙여넣을 수 있는 소상공인과 바이브 코더. React나 데이터베이스 구현 지식은 필요 없다.
- **끝나면**: 무엇을 예약하고 어떤 자원을 배정하는지 설명한다. Next.js·Convex·Vercel의 역할을 구분한다. 자신의 업종에 맞게 인터뷰 프롬프트, domain pack, bootstrap 명령을 바꿔 다시 실행한다.
- **핵심 단계**: ① 사전 준비된 실제 고객/운영자 앱에서 동일 슬롯 충돌 시연 ② 현장 투표와 운영 인터뷰 ③ 체크인 domain pack 검토 ④ 설치 skill의 `preflight.mjs` 실행 ⑤ 같은 argv로 `bootstrap.mjs` 실행 ⑥ `[SKIP verify_qa]`와 `VERIFY PASS`, receipt 확인 ⑦ setup → live QA → Vercel은 별도 후속으로 기록.
- **결제 범위**: Polar는 Jeomwon 계정의 선택형 구독 결제다. 고객 예약금·이용료 결제는 포함하지 않는다.
- **준비물**: 강사용 macOS 환경, Bun 1.3.14, checksum이 일치하는 bundled archive를 가진 로컬 dev checkout, 사전 생성 fallback. 공개 release는 `release_missing`으로 BLOCKED입니다. 수강생은 설치보다 시연에 집중하고 STUDENT 패키지와 프롬프트를 받아 수업 후 재현한다.
