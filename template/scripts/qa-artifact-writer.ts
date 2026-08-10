import fs from "node:fs";
import path from "node:path";
import { QA_CONTRACT_VERSION, QA_GATE_CONTRACT } from "./qa-contract";
import { artifactDir, assert, type QaResult, writeJson } from "./qa-shared";

export function assertExactGateResults(gateResults: readonly QaResult[]): void {
  const actual = gateResults.map(({ id, name }) => ({ id, name }));
  const expected = QA_GATE_CONTRACT.map(({ id, name }) => ({ id, name }));
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    "QA manifest must contain each gate ID and name exactly once in order",
  );
}

export function finalizeGateArtifacts(gateResults: readonly QaResult[]): void {
  for (const result of gateResults) {
    const gate = QA_GATE_CONTRACT.find(({ id }) => id === result.id);
    assert(gate !== undefined, `QA gate artifact missing for ${result.id}`);
    writeJson(gate.artifact, {
      qaContractVersion: QA_CONTRACT_VERSION,
      id: result.id,
      name: result.name,
      status: result.status,
      evidence: readJsonArtifact(gate.artifact),
    });
  }
}

function readJsonArtifact(fileName: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(artifactDir, fileName), "utf8"));
}
