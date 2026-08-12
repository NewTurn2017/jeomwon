export { validateFirstSuccess } from "./release-evidence-first-success";
export {
  validateArchiveIdentity,
  validateBrowser,
  validateContracts,
  validateGenerated,
  validateOperations,
  validateQaManifest,
  validateVersioned,
} from "./release-evidence-receipt-validation";

import type { ReleaseInput } from "./release-evidence-input";

export function validateRuntime(runtime: ReleaseInput["runtime"]) {
  if (
    runtime.bun !== Bun.version ||
    runtime.node !== process.versions.node ||
    runtime.platform !== `${process.platform}-${process.arch}`
  )
    throw new Error("runtime_identity_mismatch");
}

export function validateGit(git: ReleaseInput["git"]) {
  if (
    !/^[a-f0-9]{40}$/.test(git.commit) ||
    !["clean", "uncommitted"].includes(git.sourceState)
  )
    throw new Error("git_identity_invalid");
  if (git.sourceState === "clean" && git.diffSha256 !== null)
    throw new Error("git_state_inconsistent");
  if (
    git.sourceState === "uncommitted" &&
    !/^[a-f0-9]{64}$/.test(git.diffSha256 ?? "")
  )
    throw new Error("git_state_inconsistent");
}

export function digest(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("evidence_hash_invalid");
  return value;
}
