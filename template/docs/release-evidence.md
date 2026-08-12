# Release evidence

`bun run release:evidence -- --input <fixture.json> --root <repository> --output-dir <trusted-directory> --output <receipt.json>` creates a deterministic local receipt. It reads and hashes existing proof only; it performs no network, provider, tag, release, or deployment writes.

The fixture binds the source commit/state, Bun/Node/platform versions, compatibility/project/capability/setup/QA schema identities, final archive, generated proof, setup preview, QA manifest, browser actions/screenshots, deployment readiness, workshop/local proof, and operational blockers. References are repository-relative paths plus SHA-256. Missing evidence stays `missing`; unavailable authorized operations stay `blocked`. Neither state is counted as verified.

First-success remains `defined-not-measured` unless a real ten-run file passes the unchanged `first-success-report.ts` evaluator. Participant data is never copied into the release receipt.

Sensitive keys or values are rejected, including emails, credentials, tokens, URLs, browser storage, and raw provider payloads. Output uses the deployment checker’s existing trusted-root containment rules, refuses symlinks/traversal/FIFOs/existing leaves, and is created mode `0600`.

Read-only final-audit helpers:

```bash
bun scripts/release-evidence.ts audit-plan --plan ../.omo/plans/jeomwon-full-stack-foundation.md --mode in-progress --output-dir <trusted-directory> --output plan.json
bun scripts/release-evidence.ts audit-scope --base <commit> --head HEAD --root .. --mode in-progress --output-dir <trusted-directory> --output scope.json
```

Use `--mode strict` for F1/F4. Strict plan audit rejects unchecked required items; strict scope audit rejects protected/forbidden paths, unrelated top-level scope, and uncommitted source. In-progress mode is only for local Todo 17 verification and never proves final release readiness.

A successful local receipt prints `RELEASE EVIDENCE PASS`. Tag and GitHub release operations remain `blocked` until the orchestrator performs the separately approved external publication after Todo 17 and F1-F4.
