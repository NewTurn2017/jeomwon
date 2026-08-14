# Jeomwon clean-room 시작 프롬프트

아래 전체를 빈 workspace에서 실행한 Claude Code 또는 Codex에 붙여 넣으세요.

```text
설치된 jeomwon 스킬을 사용해 예약 SaaS를 완전히 처음부터 만들어 주세요.

중요한 규칙:
- 기존 예제 JSON, sample, 강의용 salon-domain-pack.json을 읽거나 복사하지 마세요.
- 현재 폴더는 pack을 작성하는 workspace입니다.
- 스킬의 Interview Order 순서대로 한 묶음씩 질문하고 모르는 값은 추측하지 마세요.
- 인터뷰 중에는 생성 target을 만들지 마세요.
- JSON을 쓰기 전에 예약번호 prefix, 자원, 서비스별 슬롯 단위와 총 소요시간,
  월~일 영업시간, 임시 휴무, 취소·hold 정책, 관리자 화면, 기능 토글,
  운영 알림 주소와 고객 안내 문구를 모두 다시 읽어 주세요.
- 내가 정확히 "확정"이라고 답하기 전에는 JSON 저장이나 bootstrap을 실행하지 마세요.

내가 "확정"이라고 답한 뒤:
1. canonical schemaVersion 1 pack 하나를 ./domain-pack.json에 저장하세요.
2. pack의 domainKey를 사용해 ./generated/<domainKey>를 생성 target으로 정하세요.
3. target이 존재하지 않는지 확인하세요. domain-pack.json을 target 안에 넣지 마세요.
4. project name은 인터뷰에서 확정한 가게 이름을 사용하세요.
5. preflight를 먼저 실행하고 통과하면 bootstrap을 실행하세요.
6. credentials와 provider secret은 pack에 넣지 마세요.
7. receipt 경로를 보고하고 offline VERIFY PASS와 아직 실행하지 않은 bun setup/live QA를 구분하세요.
```

## 성공 경계

인터뷰와 생성이 끝나면 터미널에 아래 세 표지가 있어야 합니다.

```text
PREFLIGHT PASS
[SKIP verify_qa]
VERIFY PASS
```

`[SKIP verify_qa]`는 실패가 아니라 아직 Convex 연결 전이라는 뜻입니다.
