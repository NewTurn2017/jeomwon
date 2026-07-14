import { describe, expect, test } from "bun:test";
import en from "@/locales/en";
import ko from "@/locales/ko";
import { normalizeCustomerReservationError } from "./customer-reservation-errors";
import type { CustomerReservationCopy } from "./customer-reservation-view";

const koCopy = {
  ...ko.dashboard.customer.manager,
  status: ko.dashboard.status,
} satisfies CustomerReservationCopy;
const enCopy = {
  ...en.dashboard.customer.manager,
  status: en.dashboard.status,
} satisfies CustomerReservationCopy;

describe("customer reservation locale parity", () => {
  test("Given Korean and English manager copy When compared Then every customer-visible key exists in both", () => {
    expect(Object.keys(koCopy).sort()).toEqual(Object.keys(enCopy).sort());
    expect(Object.values(koCopy).every(isPopulatedCopy)).toBe(true);
    expect(Object.values(enCopy).every(isPopulatedCopy)).toBe(true);
  });

  test("Given an escalated cancellation When localized Then Korean and English both explain operator review", () => {
    expect(koCopy.escalatedNotice).toBe("취소 요청됨 · 운영자 확인 필요");
    expect(enCopy.escalatedNotice).toContain("operator review");
  });

  test("Given the backend slot_conflict code When localized Then both languages provide collision recovery", () => {
    expect(normalizeCustomerReservationError(new Error("slot_conflict"))).toBe(
      "collision",
    );
    expect(koCopy.collisionError).toContain("다시 검색");
    expect(enCopy.collisionError).toContain("Search again");
  });
});

function isPopulatedCopy(value: string | Readonly<Record<string, string>>) {
  return typeof value === "string"
    ? value.length > 0
    : Object.values(value).every((label) => label.length > 0);
}
