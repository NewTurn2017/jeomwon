type IssueSink = string[];

const sideEffectKeys = [
  "reservationEmailDeliveries",
  "waitlistReservations",
  "chatEvents",
] as const;

export function validateNoShowEvidence(
  status: unknown,
  evidence: unknown,
  issues: IssueSink,
): void {
  if (!isRecord(evidence) || evidence.status !== status) {
    issues.push("artifact:no-show:12");
    return;
  }
  if (!validAccountBillingState(evidence.accountBillingState)) {
    issues.push("artifact:no-show-billing-state:12");
  }
  if (status === "SKIP") {
    if (
      evidence.reason !== "features.noShow=false" ||
      evidence.mutationAttempted !== false ||
      !validSideEffects(evidence.sideEffects)
    ) {
      issues.push("artifact:no-show-skip:12");
    }
    return;
  }
  if (status !== "PASS") {
    issues.push("artifact:no-show:12");
    return;
  }
  const transition = evidence.transition;
  const rejections = evidence.rejections;
  const negativeStatuses = evidence.negativeStatuses;
  if (
    evidence.fixtureVersion !== 1 ||
    !isRecord(transition) ||
    transition.from !== "confirmed" ||
    transition.to !== "no_show" ||
    transition.auditType !== "reservation.no_show" ||
    transition.auditCount !== 1 ||
    transition.publicContextStatus !== "no_show" ||
    transition.publicContextCount !== 1 ||
    !meaningfulString(transition.reservationId) ||
    !isRecord(rejections) ||
    rejections.repeat !== "no_show_already_marked" ||
    rejections.future !== "no_show_future" ||
    rejections.ineligible !== "no_show_wrong_status" ||
    !isRecord(negativeStatuses) ||
    negativeStatuses.future !== "confirmed" ||
    negativeStatuses.ineligible !== "cancelled" ||
    !validSideEffects(evidence.sideEffects)
  ) {
    issues.push("artifact:no-show-pass:12");
  }
  if (evidence.operatorSuccessSmoke !== "BLOCKED_MAINTAINER_GOOGLE_IDENTITY") {
    issues.push("artifact:no-show-operator-boundary:12");
  }
}

function validSideEffects(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return sideEffectKeys.every((key) => {
    const count = value[key];
    return (
      isRecord(count) &&
      nonnegativeInteger(count.before) &&
      count.after === count.before &&
      count.unchanged === true &&
      Object.keys(count).length === 3
    );
  });
}

function validAccountBillingState(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.source !== "accountDeletionJobs.phase+subscriptionCompleted" ||
    value.unchanged !== true ||
    !validBillingSnapshot(value.before) ||
    !validBillingSnapshot(value.after) ||
    JSON.stringify(value.before) !== JSON.stringify(value.after) ||
    Object.keys(value).length !== 4
  ) {
    return false;
  }
  return true;
}

function validBillingSnapshot(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.phases)) return false;
  const phases = value.phases;
  const phaseKeys = [
    "requested",
    "subscription_done",
    "storage_done",
    "records_redacted",
    "auth_deleted",
  ] as const;
  const phaseTotal = phaseKeys.reduce((sum, key) => {
    const count = phases[key];
    return sum + (nonnegativeInteger(count) ? count : Number.NaN);
  }, 0);
  return (
    value.source === "accountDeletionJobs.phase+subscriptionCompleted" &&
    nonnegativeInteger(value.rowCount) &&
    nonnegativeInteger(value.subscriptionCompleted) &&
    nonnegativeInteger(value.subscriptionPending) &&
    value.subscriptionCompleted + value.subscriptionPending ===
      value.rowCount &&
    phaseTotal === value.rowCount &&
    Object.keys(phases).length === phaseKeys.length &&
    Object.keys(value).length === 5
  );
}

function meaningfulString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
