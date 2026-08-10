import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const qaSource = [
  "qa.ts",
  "qa-booking.ts",
  "qa-gates-email.ts",
  "qa-gate-waitlist.ts",
]
  .map((file) => readFileSync(join(import.meta.dir, file), "utf8"))
  .join("\n");
const bridgeSource = readFileSync(
  join(import.meta.dir, "../apps/app/src/components/qa-browser-bridge.tsx"),
  "utf8",
);
const stateWaitSource = readFileSync(
  join(import.meta.dir, "qa-browser-state-wait.ts"),
  "utf8",
);

describe("QA exact-state timing contract", () => {
  test("email, waitlist, and hold gates contain no fixed-delay polling or timing retry", () => {
    expect(qaSource).not.toContain("delay(250)");
    expect(qaSource).not.toContain("setTimeout(resolve, waitMs)");
    expect(qaSource).not.toContain("maxAttempts = 2");
    expect(qaSource).not.toContain("waitForWaitlistSlotOpened");
  });

  test("the authenticated bridge uses a Convex watch and every runner wait has cancellation", () => {
    expect(bridgeSource).toContain("convex.watchQuery");
    expect(bridgeSource).toContain("watch.onUpdate");
    expect(bridgeSource).toContain("publicStateWaits.get(id)?.cancel()");
    expect(stateWaitSource).toContain("startPublicStateWait");
    expect(stateWaitSource).toContain("finishPublicStateWait");
    expect(qaSource).toContain("await holdExpiry.cancel()");
    expect(qaSource).toContain("await waitlistEvidence.cancel()");
    expect(qaSource).toContain("await wait.cancel()");
  });
});
