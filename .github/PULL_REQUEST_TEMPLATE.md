## 무엇을 바꾸나요 / What does this change?

<!-- 한 문단으로. One paragraph. -->

## 종류 / Type

- [ ] 도메인 팩 추가 (skill/EXAMPLES.md) / new domain pack
- [ ] template/ 수정 / template change
- [ ] skill/ 스크립트 수정 / skill script change
- [ ] 문서 / docs
- [ ] 기타 / other

## 검증 / Verification

- [ ] `cd template && bun run typecheck && bun run lint && bun test` 통과
- [ ] template/ 동작 변경 시: 라이브 QA(`cd template && bun run qa`) 결과 또는 재현 로그 첨부
- [ ] 도메인 팩 추가 시: `bun skill/scripts/bootstrap.mjs`로 생성 + `VERIFY PASS` 출력 첨부, EXAMPLES.md Coverage Catalog 갱신
