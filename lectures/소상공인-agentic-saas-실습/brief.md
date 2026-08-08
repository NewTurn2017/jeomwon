# 소상공인을 위한 Agentic SaaS 구축 1시간 실습

- **무엇을**: 헤어살롱·PC방·펜션·풋살장 중 현장에서 고른 한 업종을 인터뷰하고, 운영 규칙을 `domain-pack.json`으로 만든 뒤 Jeomwon의 `scaffold → inject → verify` 파이프라인으로 예약 SaaS를 생성한다.
- **누구에게**: 터미널 명령을 복사·붙여넣을 수 있는 소상공인과 바이브 코더. React나 데이터베이스 구현 지식은 필요 없다.
- **끝나면**: 무엇을 예약하고 어떤 자원을 배정하는지 설명한다. Next.js·Convex·Vercel의 역할을 구분한다. 자신의 업종에 맞게 인터뷰 프롬프트, domain pack, bootstrap 명령을 바꿔 다시 실행한다.
- **핵심 단계**: ① 현장 투표로 업종 선택 ② 자원·서비스·시간·정책 인터뷰 ③ domain pack 검토 ④ `bun skill/scripts/bootstrap.mjs <target> <name> <pack>` 실행 ⑤ 생성된 고객·운영자 화면 확인 ⑥ `bun setup → bun run qa → Vercel` 후속 순서 기록.
- **결제 범위**: Polar는 Jeomwon 계정의 선택형 구독 결제다. 고객 예약금·이용료 결제는 포함하지 않는다.
- **준비물**: 강사용 macOS 환경, Bun 1.3 이상, 검증된 Jeomwon 저장소. 수강생은 설치보다 시연에 집중하고 STUDENT 패키지와 프롬프트를 받아 수업 후 재현한다.
