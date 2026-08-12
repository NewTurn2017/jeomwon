import type { EvidenceRef } from "./release-evidence-files";
import { exactKeys, record } from "./release-evidence-files";

export type VersionedRef = EvidenceRef & { schemaVersion: number };
export type ReleaseInput = {
  schemaVersion: 1;
  git: {
    commit: string;
    sourceState: "clean" | "uncommitted";
    diffSha256: string | null;
  };
  runtime: { bun: string; node: string; platform: string };
  contracts: Record<
    "compatibility" | "project" | "capability" | "setup" | "qa",
    VersionedRef
  >;
  archive: EvidenceRef & { contentSha256: string };
  generatedProofs: EvidenceRef[];
  setupPreview: EvidenceRef;
  qaManifest: VersionedRef;
  browser: {
    status: "verified" | "blocked" | "missing";
    actions?: EvidenceRef;
    screenshots?: EvidenceRef[];
    reason?: string;
  };
  deploymentReadiness: EvidenceRef;
  workshop: EvidenceRef;
  localProof: EvidenceRef;
  firstSuccess:
    | { status: "defined-not-measured" }
    | { status: "verified"; dataset: EvidenceRef };
  operations: Array<{
    name: "tag" | "release" | "provider";
    status: "blocked";
    reason: string;
    receipt?: EvidenceRef;
  }>;
};
const REF = ["status", "path", "sha256", "reason"];

export function parseReleaseInput(value: unknown): ReleaseInput {
  rejectSensitive(value);
  exactKeys(
    value,
    [
      "schemaVersion",
      "git",
      "runtime",
      "contracts",
      "archive",
      "generatedProofs",
      "setupPreview",
      "qaManifest",
      "browser",
      "deploymentReadiness",
      "workshop",
      "localProof",
      "firstSuccess",
      "operations",
    ],
    "release_schema_invalid",
  );
  if (value.schemaVersion !== 1) throw new Error("release_schema_invalid");
  exactKeys(
    value.git,
    ["commit", "sourceState", "diffSha256"],
    "release_schema_invalid",
  );
  exactKeys(
    value.runtime,
    ["bun", "node", "platform"],
    "release_schema_invalid",
  );
  exactKeys(
    value.contracts,
    ["compatibility", "project", "capability", "setup", "qa"],
    "release_schema_invalid",
  );
  for (const item of Object.values(value.contracts))
    exactKeys(item, [...REF, "schemaVersion"], "release_schema_invalid");
  exactKeys(value.archive, [...REF, "contentSha256"], "release_schema_invalid");
  for (const key of [
    "setupPreview",
    "deploymentReadiness",
    "workshop",
    "localProof",
  ] as const)
    exactKeys(value[key], REF, "release_schema_invalid");
  if (
    !Array.isArray(value.generatedProofs) ||
    value.generatedProofs.length === 0
  )
    throw new Error("generated_proofs_missing");
  for (const item of value.generatedProofs)
    exactKeys(item, REF, "release_schema_invalid");
  exactKeys(
    value.qaManifest,
    [...REF, "schemaVersion"],
    "release_schema_invalid",
  );
  exactKeys(
    value.browser,
    ["status", "actions", "screenshots", "reason"],
    "release_schema_invalid",
  );
  if (value.browser.actions !== undefined)
    exactKeys(value.browser.actions, REF, "release_schema_invalid");
  if (value.browser.screenshots !== undefined) {
    if (!Array.isArray(value.browser.screenshots))
      throw new Error("release_schema_invalid");
    for (const item of value.browser.screenshots)
      exactKeys(item, REF, "release_schema_invalid");
  }
  exactKeys(
    value.firstSuccess,
    ["status", "dataset"],
    "release_schema_invalid",
  );
  if (
    value.firstSuccess.status !== "defined-not-measured" &&
    value.firstSuccess.status !== "verified"
  )
    throw new Error("release_schema_invalid");
  if (
    value.firstSuccess.status === "defined-not-measured" &&
    value.firstSuccess.dataset !== undefined
  )
    throw new Error("release_schema_invalid");
  if (value.firstSuccess.status === "verified")
    exactKeys(value.firstSuccess.dataset, REF, "release_schema_invalid");
  if (!Array.isArray(value.operations) || value.operations.length < 2)
    throw new Error("release_schema_invalid");
  for (const item of value.operations) {
    exactKeys(
      item,
      ["name", "status", "reason", "receipt"],
      "release_schema_invalid",
    );
    if (item.receipt !== undefined)
      exactKeys(item.receipt, REF, "release_schema_invalid");
  }
  return value as unknown as ReleaseInput;
}

function rejectSensitive(value: unknown, key = "") {
  const normalized = key
    .normalize("NFKC")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (
    /(?:secret|password|credential|authorization|browserstorage|storage(state)?|providerpayload|rawpayload|token|apikey)/.test(
      normalized,
    )
  )
    throw new Error("sensitive_input");
  if (
    typeof value === "string" &&
    (/@/.test(value) ||
      /:\/\//.test(value) ||
      /bearer\s|gh[pousr]_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{8,}\./i.test(
        value,
      ))
  )
    throw new Error("sensitive_input");
  if (Array.isArray(value))
    for (const item of value) rejectSensitive(item, key);
  else if (record(value))
    for (const [itemKey, item] of Object.entries(value))
      rejectSensitive(item, itemKey);
}
