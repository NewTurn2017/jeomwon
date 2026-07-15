export const QA_GATE_CONTRACT = [
  { id: 1, name: "해피 패스", artifact: "01-happy-path.json" },
  {
    id: 2,
    name: "cancelWindow 위반",
    artifact: "02-cancel-window.json",
  },
  {
    id: 3,
    name: "확인 없는 쓰기 차단",
    artifact: "03-confirmation-guardrail.json",
  },
  {
    id: 4,
    name: "무관 의도 차단",
    artifact: "04-relevance-guardrail.json",
  },
  {
    id: 5,
    name: "스키마 위반 422",
    artifact: "05-malformed-input.json",
  },
  {
    id: 6,
    name: "내부 키 grep 0건",
    artifact: "06-privacy-grep.json",
  },
  { id: 7, name: "홀드 만료 전이", artifact: "07-hold-expiry.json" },
  {
    id: 8,
    name: "메일 capture 모드",
    artifact: "08-email-capture.json",
  },
  { id: 9, name: "대기자 접수·알림", artifact: "09-waitlist.json" },
  {
    id: 10,
    name: "운영자 캘린더 CRUD",
    artifact: "10-operator-calendar-crud.json",
  },
  {
    id: 11,
    name: "고객 계정 경계",
    artifact: "11-customer-accounts.json",
  },
] as const;

export type QaGateId = (typeof QA_GATE_CONTRACT)[number]["id"];

export function gateArtifact(id: QaGateId) {
  const gate = QA_GATE_CONTRACT.find((candidate) => candidate.id === id);
  if (gate === undefined) {
    throw new Error(`Unknown QA gate: ${id}`);
  }
  return gate.artifact;
}
