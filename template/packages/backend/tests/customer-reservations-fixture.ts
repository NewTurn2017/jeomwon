import { isSlotAllowed, serviceEndMs } from "../convex/engine/availability";
import { domainConfig } from "../domain.config";
import {
  FakeDatabase,
  testContext,
} from "./customer-reservations-test-harness";

export function futureAllowedStart(offsetDays: number): number {
  const service = domainConfig.services[0];
  if (service === undefined) {
    throw new Error("test_service_missing");
  }
  let candidate = Date.now() + offsetDays * 24 * 60 * 60 * 1000;
  candidate = Math.ceil(candidate / (30 * 60 * 1000)) * (30 * 60 * 1000);
  for (let attempt = 0; attempt < 21 * 48; attempt += 1) {
    if (isSlotAllowed(candidate, serviceEndMs(service, candidate), service)) {
      return candidate;
    }
    candidate += 30 * 60 * 1000;
  }
  throw new Error("no_allowed_slot_in_test_horizon");
}

export function customerFixture() {
  const db = new FakeDatabase();
  db.seed("users", "users:a", { name: "Customer A", isAnonymous: true });
  db.seed("users", "users:b", { name: "Customer B", isAnonymous: true });
  return {
    db,
    unauth: testContext(db, null),
    customerA: testContext(db, "users:a"),
    customerB: testContext(db, "users:b"),
  };
}

export function setCustomerAccountsFeature(enabled: true) {
  const previous = domainConfig.features.customerAccounts;
  domainConfig.features.customerAccounts = enabled;
  return () => {
    domainConfig.features.customerAccounts = previous;
  };
}
