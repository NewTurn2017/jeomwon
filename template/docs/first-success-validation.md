# 첫 성공 검증 기록

이 문서는 `bun setup`부터 고객 취소 요청, 운영자 `approveCancel`, 동일 고객
브라우저 프로필의 새로고침과 개발 서버 재시작 후 Convex 상태 재확인까지 한 번의
측정으로 기록하는 절차입니다. 테스트 결과를 미리 채우거나 시뮬레이션 결과를 실제
사용자 결과로 기록하지 않습니다.

## 준비

- 저장소가 지정한 Bun 버전과 `bun install --frozen-lockfile`
- `bun x convex login` 완료
- Google OAuth Web application client 생성
- 운영자 Google 계정과 일치하는 이메일
- 고객용 브라우저 프로필과 운영자용 별도 브라우저 프로필

공식 할당은 macOS 최신 2명, macOS 직전 주요 버전 2명, Ubuntu 최신 LTS 3명,
Windows 11 네이티브 PowerShell 7 3명입니다. WSL은 Ubuntu로 기록합니다.

## 1회 수행

1. 시간을 시작하고 `bun setup`을 실행합니다.
2. 표시된 Redirect URI를 Google Console에 정확히 등록하고 저장한 뒤 Enter로
   재개합니다.
3. Google client ID, client secret, 실제 운영자 이메일을 입력합니다.
4. `bun dev`를 실행합니다.
5. 고객 프로필에서 비회원으로 예약한 뒤 `cancelWindowHours` 안쪽 예약의 취소를
   요청하고 `escalated` 상태를 확인합니다.
6. 별도 운영자 프로필에서 Google 로그인 후 `/admin`의 `approveCancel`을
   실행합니다. allowlist 밖 Google 계정은 같은 작업이 차단되어야 합니다.
7. 고객 화면에서 `cancelled`를 확인하고 전체 새로고침합니다.
8. 고객·운영자 브라우저를 닫지 않은 채 개발 서버만 재시작합니다.
9. 같은 고객 프로필과 같은 익명 신원으로 `cancelled`를 다시 확인하고, 운영자
   화면에서도 같은 상태를 확인한 시점에 시간을 멈춥니다.

새 프로필, 시크릿 창, 쿠키 삭제, 새 익명 로그인을 사용하면 영속성 검증이
아니므로 그 수행은 무효입니다.

## 기록과 판정

실행별 JSON은 다음 필드를 가집니다.

```json
{
  "participantId": "P01",
  "platform": "macos-latest",
  "elapsedMinutes": 12.4,
  "outcome": "complete",
  "setupAutomation": true,
  "oauthPauseResume": true,
  "securityBoundary": true,
  "sessionSeparation": true,
  "approveCancelRoundtrip": true,
  "restartPersistence": true
}
```

`platform`은 `macos-latest`, `macos-previous`, `ubuntu-lts`,
`windows-11-powershell-7` 중 하나입니다. 실패·미완료는
`elapsedMinutes`를 25분 초과로 기록합니다. 사전 조건 오류와 네트워크·권한·quota
같은 외부 환경 실패는 각각 `prerequisite_error`,
`external_environment_failure`로 기록합니다.

10개 실행을 `{ "runs": [...] }`로 저장한 뒤 판정합니다.

```bash
bun run first-success:report ./first-success-runs.json
```

PASS 조건은 중앙값 15분 이하, 최소 9명 25분 이하, 모든 지원 플랫폼에서 설정
자동화·OAuth pause/resume·보안 경계·세션 분리·approveCancel 왕복·재시작
영속성이 모두 통과하는 것입니다.
