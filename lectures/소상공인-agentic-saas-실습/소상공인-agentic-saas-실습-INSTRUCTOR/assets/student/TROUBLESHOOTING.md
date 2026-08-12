# 재현 문제 해결표

| 증상 | 원인 확인 | 조치 |
|---|---|---|
| `release_missing` | 공개 GitHub tag/release 없음 | 로컬 checkout은 dev-only로 유지하고 release URL을 만들지 않음 |
| target이 비어 있지 않음 | 이전 실패 폴더 재사용 | 출력의 대체 target을 쓰거나 새 이름으로 다시 실행 |
| `bun_version_mismatch` | Bun이 1.3.14가 아님 | `bun upgrade --version 1.3.14` 후 버전 재확인 |
| `cache_not_ready` | frozen offline install cache 미준비 | preflight가 출력한 단일 `warm-cache.mjs` recovery argv를 네트워크 허용 시 실행 |
| `archive_checksum_mismatch` | 설치 skill archive가 계약 SHA와 다름 | 설치를 지우고 현재 로컬 checkout에서 skill을 다시 설치; 임의 archive 사용 금지 |
| `pack_missing` | 예전 `domain-pack.json` 예시 경로 사용 | 저장소 루트의 `lectures/소상공인-agentic-saas-실습/assets/student/salon-domain-pack.json` 사용 |
| domain pack 거부 | 닫힌 스키마 밖 key/value | `skill/REFERENCE.md`와 `skill/EXAMPLES.md` 기준으로 수정 |
| bootstrap 중단 | cache/build/도구 오류 | 실패 target 재사용 금지; 새 target으로 재시도하거나 준비된 fallback receipt 표시 |
| `[SKIP verify_qa]` | 정상 offline 경계 | PASS로 바꾸지 않음; provider/setup 후 live QA를 별도 실행 |
| live 데모 BLOCKED | 앱 URL, Convex, OAuth, 고객/운영자 계정 없음 | 생성 로컬 표면만 실행하고 `provider_authorization_absent` 증거 보관 |
| Vercel에서 한 앱만 동작 | web/app root·env가 독립 | 두 프로젝트의 root, env, domain을 각각 확인 |
| 결제 checkout이 예약에 없음 | Polar는 계정 구독 옵션 | 예약금·건별 결제는 별도 확장으로 구현 |

오류를 숨기거나 기존 target에 덮어쓰지 않습니다. 사용한 archive checksum, pack,
명령, receipt, 전체 출력을 함께 보관합니다.
