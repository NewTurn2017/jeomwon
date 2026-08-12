import {
  sha256Bytes,
  stableJson,
  validateEvidenceRef,
} from "./release-evidence-files";
import { parseReleaseInput } from "./release-evidence-input";
import {
  digest,
  validateArchiveIdentity,
  validateBrowser,
  validateContracts,
  validateFirstSuccess,
  validateGenerated,
  validateGit,
  validateOperations,
  validateQaManifest,
  validateRuntime,
  validateVersioned,
} from "./release-evidence-validation";

export function buildReleaseReceipt(
  value: unknown,
  root: string,
  actualCommit: string,
  actualDiffSha256: string | null = null,
) {
  const input = parseReleaseInput(value);
  if (input.git.commit !== actualCommit) throw new Error("git_commit_mismatch");
  validateGit(input.git);
  validateRuntime(input.runtime);
  if (input.git.diffSha256 !== actualDiffSha256)
    throw new Error("git_state_mismatch");
  const contracts = validateContracts(root, input.contracts);
  const { contentSha256, ...archiveEvidence } = input.archive;
  const archive = {
    ...validateEvidenceRef(root, archiveEvidence),
    contentSha256: digest(contentSha256),
  };
  validateArchiveIdentity(root, contracts.compatibility, archive);
  const generatedProofs = input.generatedProofs
    .map((ref) => validateGenerated(root, ref, archive, contracts))
    .sort(compareRef);
  if (
    new Set(
      generatedProofs.map((ref) => `${ref.status}:${ref.path ?? ref.reason}`),
    ).size !== generatedProofs.length
  )
    throw new Error("generated_proof_duplicate");
  const qaManifest = validateVersioned(root, input.qaManifest);
  validateQaManifest(root, qaManifest, contracts.qa.schemaVersion);
  const body = {
    schemaVersion: 1,
    status: "pass",
    git: input.git,
    runtime: input.runtime,
    contracts,
    archive,
    evidence: {
      generatedProofs,
      setupPreview: validateEvidenceRef(root, input.setupPreview),
      qaManifest,
      browser: validateBrowser(root, input.browser),
      deploymentReadiness: validateEvidenceRef(root, input.deploymentReadiness),
      workshop: validateEvidenceRef(root, input.workshop),
      localProof: validateEvidenceRef(root, input.localProof),
    },
    firstSuccess: validateFirstSuccess(root, input.firstSuccess),
    operations: validateOperations(root, input.operations).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    externalEffects: "none-read-only",
  } as const;
  return { ...body, receiptSha256: sha256Bytes(stableJson(body)) };
}

function compareRef(
  left: { path?: string; status: string },
  right: { path?: string; status: string },
) {
  return `${left.status}:${left.path ?? ""}`.localeCompare(
    `${right.status}:${right.path ?? ""}`,
  );
}
