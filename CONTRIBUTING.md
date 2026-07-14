# 기여 가이드 / Contributing

> English speakers: jeomwon is Korean-first, but English contributions are very welcome —
> the same workflow below applies, and issues/PRs in English are fine.

## 가장 좋은 첫 기여: 도메인 팩

점원의 커버리지는 `resourceKind(4) × slotUnit(3) × adminWidget(2)` = 24칸 매트릭스로 관리됩니다.
현재 채워진 칸과 빈 칸(`gap`)은 [skill/EXAMPLES.md](skill/EXAMPLES.md)의 **Coverage Catalog**에 있습니다.
빈 칸 하나를 채우는 새 업종 팩이 가장 좋은 첫 기여입니다 — 코드가 아니라 JSON 하나입니다.

절차:

1. [도메인 팩 제안 이슈](../../issues/new?template=domain_pack.yml)를 엽니다 (선점 표시 겸 설계 피드백).
2. `skill/EXAMPLES.md`의 기존 팩을 본떠 팩 JSON을 작성합니다. 필드 계약(스키마·검증 규칙)은
   [skill/REFERENCE.md](skill/REFERENCE.md)에 있고, `skill/scripts/inject.mjs`가 전수 검증합니다.
3. 실제로 생성해 증명합니다:
   ```bash
   bun skill/scripts/bootstrap.mjs /tmp/my-pack-test my-pack-test my-pack.json
   ```
   끝에 `VERIFY PASS`가 떠야 합니다 (오프라인 게이트 — Convex 계정 불필요).
4. `skill/EXAMPLES.md`에 팩 섹션을 추가하고 Coverage Catalog 표의 해당 칸을 갱신합니다.
5. PR을 엽니다 — PR 템플릿의 체크리스트를 따라 `VERIFY PASS` 출력을 첨부하세요.

## template/ · skill/ 코드 기여

- **불변식은 Convex mutation 안에서**: 슬롯 충돌·홀드·취소 기한 검사를 클라이언트나 API 라우트로
  옮기는 변경은 받지 않습니다. 아키텍처 규약은 README의 "아키텍처 규약"과 `docs/plan.md` 3절 참고.
- **킷 버그는 생성물이 아니라 원본에서**: 생성된 프로젝트에서 발견한 버그는 `template/`·`skill/`에서
  고쳐야 합니다.
- **도메인 고유명사는 팩 밖으로 나가지 않게**: 업종 이름·문구를 `template/` 코드에 하드코딩하지 마세요.
  `inject.mjs`만이 도메인 이름을 프로젝트에 씁니다.

## 검증

PR 전 최소 게이트 (CI와 동일, 오프라인):

```bash
cd template
bun install
bun run typecheck
bun run lint
bun test
```

`template/` 동작을 바꿨다면 라이브 QA까지 돌려주세요 (dev Convex 배포 필요):

```bash
cd template && bun run qa   # 11게이트, dev: 배포가 아니면 스스로 거부
```

Convex 계정이 없으면 PR에 그 사실을 적어주세요 — 메인테이너가 라이브 QA를 대신 돌립니다.

## 커밋 메시지

Conventional Commits를 따릅니다: `feat(kit): …`, `fix(qa): …`, `docs: …`.
스코프는 `kit`(template)·`skill`·`qa`·`site`·`oss`(레포 위생)를 주로 씁니다.

## 라이선스

기여물은 [MIT](LICENSE)로 배포되는 데 동의하는 것으로 간주합니다.
