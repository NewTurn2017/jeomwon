import { afterEach, beforeEach, expect, test } from "bun:test";
import { resetDomain } from "../convex/qaReset";
import { domainConfig } from "../domain.config";
import {
  FakeDatabase,
  invoke,
  objectField,
  rejectionMessage,
  testContext,
} from "./customer-reservations-test-harness";

const originalResetFlag = process.env.JEOMWON_QA_RESET;

beforeEach(() => {
  process.env.JEOMWON_QA_RESET = "1";
});

afterEach(() => {
  if (originalResetFlag === undefined) {
    delete process.env.JEOMWON_QA_RESET;
  } else {
    process.env.JEOMWON_QA_RESET = originalResetFlag;
  }
});

test("QA reset deletes the delivery ledger before deleting domain reservations", async () => {
  const db = new FakeDatabase();
  db.seed("reservations", "reservations:qa", {
    domainKey: domainConfig.domainKey,
    status: "confirmed",
    startMs: 1,
  });
  db.seed("reservationEmailDeliveries", "reservationEmailDeliveries:stale", {
    reservationId: "reservations:qa",
    template: "reservation.confirmed",
  });
  Object.defineProperty(db, "delete", {
    value: async (id: string) => {
      for (const rows of Object.values(db.tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) rows.splice(index, 1);
      }
    },
  });

  const result = await invoke(resetDomain, testContext(db, null), {
    domainKey: domainConfig.domainKey,
  });

  expect(objectField(result, "reservationEmailDeliveries")).toBe(1);
  expect(db.tables.reservationEmailDeliveries.length).toBe(0);
  expect(db.tables.reservations.length).toBe(0);
});

test("QA reset remains disabled unless the existing dev-only flag is exact", async () => {
  delete process.env.JEOMWON_QA_RESET;
  const db = new FakeDatabase();
  db.seed(
    "reservationEmailDeliveries",
    "reservationEmailDeliveries:preserved",
    {
      reservationId: "reservations:old",
    },
  );

  const message = await rejectionMessage(
    invoke(resetDomain, testContext(db, null), {
      domainKey: domainConfig.domainKey,
    }),
  );
  expect(message).toMatch("qa_reset_disabled");
  expect(db.tables.reservationEmailDeliveries.length).toBe(1);
});
