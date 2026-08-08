# 재현 문제 해결표

| 증상 | 원인 확인 | 조치 |
|---|---|---|
| target이 비어 있지 않음 | 이전 실패 폴더 재사용 | 새 target 이름으로 다시 실행 |
| Bun 또는 package download 오류 | Bun 버전·네트워크·캐시 | Bun 1.3 이상 확인 후 `template`에서 `bun install --frozen-lockfile` |
| domain pack 거부 | 닫힌 스키마 밖 key/value | `skill/REFERENCE.md`와 `skill/EXAMPLES.md` 기준으로 수정 |
| 시간 문장을 해석하지 못함 | 현재 parser 밖 표현 | `N시간 뒤`, `N일 뒤`, `내일`, `모레` 또는 직접 슬롯 선택 |
| `bun setup` 자격 증명 오류 | Convex·Google OAuth 미연결 | `bun x convex login` 후 setup 질문에 실제 자격 증명 입력 |
| `bun run qa`가 SKIP | live deployment 또는 필수 env 없음 | SKIP 원인을 읽고 환경을 연결한 뒤 별도 실행 |
| Vercel에서 한 앱만 동작 | web/app root·env가 독립 | 두 프로젝트의 root, env, domain을 각각 확인 |
| 결제 checkout이 예약에 없음 | Polar는 계정 구독 옵션 | 예약금·건별 결제는 별도 확장으로 구현 |

오류를 숨기거나 기존 target에 덮어쓰지 않습니다. 사용한 commit, pack, 명령,
전체 출력을 함께 보관합니다.
